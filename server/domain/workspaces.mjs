import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
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
  try { return git(cwd, ...args).trim() } catch { return null }
}

export function containsPath(parent, child) {
  const path = relative(parent, child)
  return path === "" || (path !== ".." && !path.startsWith("../") && !isAbsolute(path))
}

export function createWorkspaces(database) {
  const root = join(dirname(resolve(database)), "worktrees")

  function plan(card, source, legacyResume = false) {
    const top = read(source, "rev-parse", "--show-toplevel")
    if (!top) return { path: source, lock: source }
    const repo = realpathSync(top)
    if (card.workspaceMode === "shared" || legacyResume) return { path: source, lock: repo }
    const common = read(repo, "rev-parse", "--path-format=absolute", "--git-common-dir")
    if (!common) throw new BoardError(409, "无法识别 Git 仓库。")
    const key = createHash("sha256").update(realpathSync(common)).digest("hex").slice(0, 12)
    const checkout = join(root, key, card.id)
    const path = join(checkout, relative(repo, source))
    const branch = `board/${card.id}`
    return { path, lock: checkout, repo, common: realpathSync(common), checkout, branch }
  }

  function prepare(plan) {
    if (!plan.checkout) return plan.path
    try {
      if (!existsSync(plan.checkout)) {
        mkdirSync(dirname(plan.checkout), { recursive: true, mode: 0o700 })
        const branchExists = read(plan.repo, "show-ref", "--verify", `refs/heads/${plan.branch}`)
        if (branchExists) git(plan.repo, "worktree", "add", plan.checkout, plan.branch)
        else git(plan.repo, "worktree", "add", "-b", plan.branch, plan.checkout, "HEAD")
      }
      const common = read(plan.checkout, "rev-parse", "--path-format=absolute", "--git-common-dir")
      if (!common || realpathSync(common) !== plan.common) throw new Error("Invalid worktree")
      const path = realpathSync(plan.path)
      if (!containsPath(realpathSync(plan.checkout), path)) throw new Error("Invalid worktree subdirectory")
      return path
    } catch {
      throw new BoardError(409, "无法准备 Git 工作树。请确认仓库已有提交，并且任务目录存在于该分支。")
    }
  }

  return { plan, prepare }
}

export function gitDelivery(workdir, { diff = false, baseCommit } = {}) {
  const commit = read(workdir, "rev-parse", "HEAD")
  if (!commit) return null
  const status = read(workdir, "status", "--short", "--untracked-files=normal") ?? ""
  const branch = read(workdir, "symbolic-ref", "--short", "HEAD")
  const trackedBase = baseCommit && /^[a-f0-9]{40,64}$/.test(baseCommit) ? baseCommit : "HEAD"
  const files = read(workdir, "diff", "--name-only", trackedBase) ?? ""
  const patch = diff ? read(workdir, "diff", "--no-ext-diff", "--no-color", trackedBase) : null
  return {
    workdir, branch, commit, baseCommit: trackedBase === "HEAD" ? commit : trackedBase,
    files: [...new Set([...status.split("\n"), ...files.split("\n")].filter(Boolean))].slice(0, 100),
    ...(diff ? { diff: (patch ?? "").slice(0, 64_000), diffTruncated: patch === null || patch.length > 64_000 } : {}),
  }
}
