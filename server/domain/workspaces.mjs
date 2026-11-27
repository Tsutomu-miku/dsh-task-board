import { execFileSync } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { existsSync, mkdirSync, realpathSync } from "node:fs"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { BoardError } from "../errors.mjs"

function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8", timeout: 8000, maxBuffer: 512 * 1024, stdio: ["ignore", "pipe", "ignore"],
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" },
  })
}

function read(cwd, ...args) {
  try { return git(cwd, ...args).replace(/\r?\n$/, "") } catch { return null }
}

export function containsPath(parent, child) {
  const path = relative(parent, child)
  return path === "" || (path !== ".." && !path.startsWith("../") && !isAbsolute(path))
}

export function createWorkspaces(database) {
  const root = join(dirname(resolve(database)), "worktrees")

  function locate(card, source) {
    const top = read(source, "rev-parse", "--show-toplevel")
    if (!top) return null
    const repo = realpathSync(top)
    const common = read(repo, "rev-parse", "--path-format=absolute", "--git-common-dir")
    if (!common) throw new BoardError(409, "无法识别 Git 仓库。")
    const key = createHash("sha256").update(realpathSync(common)).digest("hex").slice(0, 12)
    const checkout = join(root, key, card.id)
    const path = join(checkout, relative(repo, source))
    const branch = `board/${card.id}`
    return { id: key, path, lock: checkout, repo, common: realpathSync(common), checkout, branch }
  }

  function plan(card, source, legacyResume = false) {
    const isolated = card.workspaceMode === "isolated" ||
      (!card.workspaceMode && card.runs?.some(attempt => attempt.delivery?.branch === `board/${card.id}`))
    if (isolated && !legacyResume) {
      const located = locate(card, source)
      if (located) return located
    }
    const top = read(source, "rev-parse", "--show-toplevel")
    return { path: source, lock: top ? realpathSync(top) : source }
  }

  function remember(card, record) {
    card.worktrees ??= {}
    card.worktrees[record.id] = record
  }

  function registrations(record) {
    return git(record.repo, "worktree", "list", "--porcelain", "-z").split("\0\0").map(block => {
      const fields = block.split("\0")
      return {
        path: fields.find(field => field.startsWith("worktree "))?.slice(9),
        branch: fields.find(field => field.startsWith("branch "))?.slice(7),
        locked: fields.some(field => field === "locked" || field.startsWith("locked ")),
      }
    })
  }

  function records(card) {
    const records = { ...card.worktrees }
    for (const attempt of card.runs) {
      if (!attempt.sourceWorkdir || attempt.legacyWorkspace) continue
      try {
        const record = locate(card, attempt.sourceWorkdir)
        if (!record || records[record.id] || (record.path !== attempt.executor.workdir &&
          !(attempt.delivery?.branch === record.branch && containsPath(record.checkout, attempt.executor.workdir)))) continue
        records[record.id] = { ...record, target: null, generation: null }
      } catch {
        // The original directory may have been removed outside the board.
      }
    }
    return Object.values(records).filter(record => !record.removed)
  }

  function prepare(card, plan) {
    if (!plan.checkout) return { path: plan.path }
    try {
      let record = records(card).find(item => item.id === plan.id)
      if (!record) {
        const current = registrations(plan).find(item => item.path === plan.checkout)
        const existing = current || read(plan.repo, "show-ref", "--verify", `refs/heads/${plan.branch}`)
        record = { ...plan, target: existing ? null : read(plan.repo, "symbolic-ref", "--quiet", "HEAD"), generation: randomUUID() }
      }
      if (!existsSync(plan.checkout)) {
        mkdirSync(dirname(plan.checkout), { recursive: true, mode: 0o700 })
        const branchExists = read(plan.repo, "show-ref", "--verify", `refs/heads/${plan.branch}`)
        if (branchExists) git(plan.repo, "worktree", "add", "--", plan.checkout, plan.branch)
        else git(plan.repo, "worktree", "add", "-b", plan.branch, "--", plan.checkout, "HEAD")
      }
      if (read(plan.checkout, "symbolic-ref", "--quiet", "HEAD") !== `refs/heads/${plan.branch}` ||
        !registrations(plan).some(item => item.path === plan.checkout && item.branch === `refs/heads/${plan.branch}`)) {
        throw new Error("Invalid worktree")
      }
      remember(card, record)
      const path = realpathSync(plan.path)
      if (!containsPath(realpathSync(plan.checkout), path)) throw new Error("Invalid worktree subdirectory")
      return { path, generation: record.generation }
    } catch {
      throw new BoardError(409, "无法准备 Git 工作树。请确认仓库已有提交，并且任务目录存在于该分支。")
    }
  }

  function inspect(record, occupied) {
    const { id, repo, checkout, branch } = record
    const info = { id, repo, path: checkout, branch, target: record.target?.slice(11) ?? null }
    try {
      const common = git(repo, "rev-parse", "--path-format=absolute", "--git-common-dir").trimEnd()
      if (realpathSync(common) !== record.common) throw new Error("Repository changed")
      const ref = `refs/heads/${branch}`
      const entries = registrations(record)
      const entry = entries.find(item => item.path === checkout)
      const branchCommit = read(repo, "rev-parse", "--verify", ref)
      const present = existsSync(checkout)
      const current = read(repo, "symbolic-ref", "--quiet", "HEAD")
      const target = record.target ?? (current === ref ? null : current)
      const targetCommit = target && read(repo, "rev-parse", "--verify", target)
      info.target = target?.slice(11) ?? null
      info.present = Boolean(entry || branchCommit || present)
      if (!info.present) return info
      if (entry?.locked || (present && (!entry || realpathSync(checkout) !== checkout)) ||
          (entry && entry.branch !== ref) || entries.some(item => item.branch === ref && item.path !== checkout)) {
        throw new Error("Worktree registration or branch changed")
      }
      const changes = present ? git(checkout, "status", "--porcelain=v1", "-z", "--untracked-files=all") : ""
      const files = present ? git(checkout, "status", "--porcelain=v1", "-z", "--ignored", "--untracked-files=normal") : ""
      const ignored = files.split("\0").some(field => field.startsWith("!! "))
      const merged = !branchCommit || Boolean(targetCommit && read(repo, "merge-base", "--is-ancestor", branchCommit, targetCommit) !== null)
      const fastForward = targetCommit && branchCommit &&
        read(repo, "merge-base", "--is-ancestor", targetCommit, branchCommit) !== null
      info.risks = [
        ...(changes ? ["工作树有未提交或未跟踪的文件"] : []),
        ...(ignored ? ["工作树包含 Git 忽略的文件"] : []),
        ...(!merged ? ["任务分支有未合回的提交"] : []),
      ]
      const busy = occupied(repo) || occupied(checkout)
      info.cleanupError = busy ? "原目录或工作树仍有任务在执行。" : null
      const legacyTarget = !record.target && info.target
      info.mergeError = busy ? info.cleanupError
        : !present ? "找不到任务工作树。"
        : changes ? `请先在 ${branch} 提交要合回的改动及新文件。`
        : !target || current !== target ? "请在原目录切回目标分支。"
        : git(repo, "status", "--porcelain=v1", "-z", "--untracked-files=all") ? "原目录有未提交或未跟踪的文件，请先处理。"
        : ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply", "sequencer"].some(name => {
          const path = read(repo, "rev-parse", "--path-format=absolute", "--git-path", name)
          return path && existsSync(path)
        }) ? "请先结束原目录中的 Git 操作。"
        : merged ? "任务分支已包含在目标分支中。"
        : !fastForward ? "任务分支与目标分支已分叉。请先在任务工作树变基并解决冲突。"
        : null
      if (legacyTarget) info.legacyTarget = true
      info.confirmation = createHash("sha256").update(JSON.stringify([id, branchCommit, targetCommit, changes, files])).digest("hex")
      return { ...info, registered: Boolean(entry), branchCommit, merged, presentOnDisk: present }
    } catch {
      const error = "无法确认工作树或分支的 Git 状态，请检查原目录和 Git 工作树登记。"
      return { ...info, present: true, risks: [], cleanupError: error, mergeError: error }
    }
  }

  function list(card, occupied) {
    return records(card).map(record => inspect(record, occupied)).filter(item => item.present)
  }

  function merge(card, id, target, occupied) {
    const record = records(card).find(item => item.id === id)
    if (!record) throw new BoardError(404, "找不到任务工作树。")
    const info = inspect(record, occupied)
    if (!info.present || info.mergeError || info.target !== target) {
      throw new BoardError(409, info.mergeError ?? "工作树或目标分支已变更，请刷新。")
    }
    try { git(record.repo, "merge", "--ff-only", info.branchCommit) } catch {
      throw new BoardError(409, "Git 无法快进合回。请检查原目录和两个分支。")
    }
    remember(card, { ...record, target: `refs/heads/${target}` })
  }

  function cleanup(card, id, confirmations, occupied) {
    const selected = records(card).filter(record => id === undefined || record.id === id)
    if (id !== undefined && !selected.length) throw new BoardError(404, "找不到任务工作树。")
    const checked = selected.map(record => ({ record, info: inspect(record, occupied) }))
    for (const { info } of checked) {
      if (info.cleanupError) throw new BoardError(409, info.cleanupError)
      if (info.risks?.length && !confirmations?.includes(info.confirmation)) {
        throw new BoardError(409, "工作树包含未合回的内容，请刷新并再次确认清理。")
      }
    }
    for (const { record, info } of checked) {
      try {
        if (info.registered) git(record.repo, "worktree", "remove", ...(info.risks?.length ? ["--force"] : []), "--", record.checkout)
        if (info.branchCommit) {
          const useSafeDelete = info.merged && read(record.repo, "symbolic-ref", "--short", "HEAD") === info.target
          git(record.repo, "branch", useSafeDelete ? "-d" : "-D", "--", record.branch)
        }
      } catch {
        throw new BoardError(409, "Git 未能完成清理。请刷新查看剩余的工作树或分支。")
      }
      remember(card, { ...record, removed: true })
    }
  }

  return { plan, prepare, list, merge, cleanup, hasRecords: card => records(card).length > 0 }
}

export function gitDelivery(workdir, { diff = false, baseCommit } = {}) {
  const commit = read(workdir, "rev-parse", "HEAD")
  if (!commit) return null
  const status = (read(workdir, "status", "--porcelain=v1", "-z", "--untracked-files=all") ?? "").split("\0")
  const branch = read(workdir, "symbolic-ref", "--short", "HEAD")
  const trackedBase = baseCommit && /^[a-f0-9]{40,64}$/.test(baseCommit) ? baseCommit : "HEAD"
  const files = new Set((read(workdir, "diff", "--name-only", "-z", trackedBase) ?? "").split("\0").filter(Boolean))
  for (let index = 0; index < status.length; index++) {
    const entry = status[index]
    if (entry.length < 4) continue
    files.add(entry.slice(3))
    if (/[RC]/.test(entry.slice(0, 2))) index++
  }
  const patch = diff ? read(workdir, "diff", "--no-ext-diff", "--no-color", trackedBase) : null
  return {
    workdir, branch, commit, baseCommit: trackedBase === "HEAD" ? commit : trackedBase,
    fileCount: files.size, files: [...files].slice(0, 100),
    ...(diff ? { diff: (patch ?? "").slice(0, 64_000), diffTruncated: patch === null || patch.length > 64_000 } : {}),
  }
}
