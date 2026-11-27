import { randomUUID } from "node:crypto"
import { openSync, closeSync, constants, fstatSync, readSync, realpathSync } from "node:fs"
import { basename, resolve } from "node:path"
import { assertPlainObject, assertUuid, BoardError, requireText } from "../errors.mjs"
import { createToolCommands, createWorkflowRepository } from "../storage/workflow-repository.mjs"
import { boundedNumber, waitingFor } from "./task-metadata.mjs"
import { containsPath } from "./workspaces.mjs"

const FILE_LIMIT = 5 * 1024 * 1024
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"])
const OUTPUT_STATES = ["blocked", "review", "todo"]
const parameter = (type, description) => ({ type, description })

function tool(name, description, properties, required) {
  return { name, description, inputSchema: { type: "object", properties, required, additionalProperties: false } }
}

const text = description => parameter("string", description)
export const BOARD_RUN_TOOLS = [
  tool("board_set_outcome", "Set the current run's outcome on the board. Use blocked when awaiting help, review for delivery, or todo for work still in progress.",
    { status: { type: "string", enum: OUTPUT_STATES }, reason: text("Summarize the handoff or what would unblock the task.") }, ["status", "reason"]),
  tool("board_post_comment", "Post a discussion comment on the current task without starting a run.",
    { text: text("Comment"), parentId: text("Optional thread root ID") }, ["text"]),
  tool("board_delegate", "Queue a handoff to a board executor on the current card or create and queue a child task. The destination executor must allow agent handoffs.",
    { executorId: text("Executor ID"), prompt: text("Work to do"), title: text("Child task title. Omit to hand off the current task."),
      stage: parameter("integer", "Stage for a newly created child. Earlier stages must be accepted first.") }, ["executorId", "prompt"]),
  tool("board_add_attachment", "Attach a file from the current execution workspace to the card.",
    { path: text("Path relative to the execution workdir"), mime: text("Media type, for example image/png") }, ["path"]),
  tool("board_read_project", "Read the current card discussion, files, executors, and project knowledge documents.", {}, []),
]

export function createCollaboration({ storage, cards, executors }) {
  const store = createWorkflowRepository(storage.db)
  const commands = createToolCommands(storage.db)
  const access = new Map()
  const dshAgents = new WeakMap()
  const wakeups = () => store.list("wakeup")
  let runs
  let timer
  let schedule
  let enabled = true

  function notify(cardId, kind, message) {
    const record = { id: randomUUID(), cardId, kind, message, at: Date.now(), read: false }
    store.save("notification", "", record)
  }

  function comment(card, input, author = "用户") {
    const parentId = input.parentId == null ? null : assertUuid(input.parentId, "讨论串")
    if (parentId) {
      const parent = store.get("comment", parentId)
      if (!parent || parent.cardId !== card.id || parent.parentId) throw new BoardError(404, "找不到讨论串。")
    }
    const item = store.save("comment", card.id, {
      id: randomUUID(), cardId: card.id, parentId, author, at: Date.now(),
      text: requireText(input.text, 16000, "评论"),
    })
    if (author !== "用户") notify(card.id, "comment", `${author} · ${item.text.slice(0, 160)}`)
    return item
  }

  function attach(card, input, bytes, author = "用户") {
    const name = requireText(input.name, 255, "文件名")
    if (/[\\/\x00-\x1f\x7f]/.test(name)) throw new BoardError(400, "文件名无效。")
    const mime = typeof input.mime === "string" && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(input.mime)
      ? input.mime.toLowerCase() : "application/octet-stream"
    if (!bytes.length || bytes.length > FILE_LIMIT) throw new BoardError(400, "附件需在 5 MiB 以内。")
    const record = { id: randomUUID(), cardId: card.id, name, mime, inline: IMAGE_TYPES.has(mime), size: bytes.length, author, at: Date.now() }
    return storage.atomic(() => {
      const files = store.list("attachment", card.id)
      if (files.length >= 50 || files.reduce((sum, file) => sum + file.size, 0) + bytes.length > 25 * 1024 * 1024) {
        throw new BoardError(409, "任务附件上限为 50 个文件或 25 MiB。")
      }
      store.addFile(record.id, bytes)
      return store.save("attachment", card.id, record)
    })
  }

  function attachWorkspaceFile(entry, input) {
    const root = realpathSync(entry.attempt.executor.workdir)
    const path = realpathSync(resolve(root, requireText(input.path, 1024, "附件路径")))
    if (path === root || !containsPath(root, path)) throw new BoardError(403, "附件必须位于当前任务工作区。")
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      const stat = fstatSync(fd)
      if (!stat.isFile() || stat.size > FILE_LIMIT) throw new BoardError(400, "附件需为 5 MiB 以内的普通文件。")
      const buffer = Buffer.alloc(stat.size)
      const count = readSync(fd, buffer)
      return attach(cards.get(entry.job.cardId), { name: basename(path), mime: input.mime }, buffer.subarray(0, count), entry.executor.name)
    } finally {
      closeSync(fd)
    }
  }

  function runTool(runId, name, raw) {
    const entry = access.get(runId)
    if (!enabled || !entry || entry.job.controller.signal.aborted || runs.job(entry.job.cardId) !== entry.job) {
      throw new BoardError(403, "该运行没有看板写权限。")
    }
    const input = assertPlainObject(raw ?? {})
    const { job, attempt, executor } = entry
    const card = cards.get(job.cardId)
    if (name === "board_set_outcome") {
      if (!OUTPUT_STATES.includes(input.status)) throw new BoardError(400, "无效的运行结论。")
      job.outcome = { status: input.status, reason: requireText(input.reason, 2000, "交接说明") }
      return { accepted: true, outcome: job.outcome }
    }
    if (name === "board_post_comment") return comment(card, input, executor.name)
    if (name === "board_add_attachment") return attachWorkspaceFile(entry, input)
    if (name === "board_read_project") {
      const { comments, attachments, documents } = detail(card)
      return {
        comments: comments.slice(-12).map(item => ({ ...item, text: item.text.slice(0, 1500) })),
        attachments,
        documents: documents.slice(0, 12).map(item => ({ ...item, text: item.text.slice(0, 2400) })),
        executors: executors.list().filter(item => item.enabled && item.agentTools && item.engine !== "command")
        .map(({ id, name, engine }) => ({ id, name, engine })) }
    }
    if (name === "board_delegate") {
      if (!executor.agentTools) throw new BoardError(403, "当前执行器尚未启用 Agent 委派。")
      if (job.delegated || attempt.dispatchDepth >= 5) throw new BoardError(409, "该轮已交接或已达到 5 层交接上限。")
      const target = executors.get(input.executorId)
      if (!target.agentTools || target.engine === "command" || target.id === executor.id) throw new BoardError(403, "请选择另一位允许 Agent 协作的执行器。")
      const result = storage.atomic(() => {
        const next = input.title === undefined ? card : cards.create({
          title: input.title, prompt: input.prompt, executorId: target.id, workdir: card.workdir,
          ...(card.project ? { project: card.project } : {}), parentId: card.id, stage: input.stage ?? 0,
        })
        const message = runs.send(next, { executorId: target.id, prompt: input.prompt, mode: "priority" }, {
          defer: true, depth: (attempt.dispatchDepth ?? 0) + 1,
        })
        notify(next.id, "handoff", `${executor.name} → ${target.name}`)
        return { cardId: next.id, messageId: message.id }
      })
      job.delegated = true
      runs.drain()
      return result
    }
    throw new BoardError(404, "未知的看板工具。")
  }

  function detail(card) {
    return {
      comments: store.list("comment", card.id).slice(0, 200).reverse(),
      attachments: store.list("attachment", card.id),
      documents: card.project ? store.list("document", card.project).slice(0, 50) : [],
      wakeups: wakeups().filter(item => item.cardId === card.id),
    }
  }

  function saveWakeup(card, input) {
    if (card.archived) throw new BoardError(409, "请先恢复归档任务。")
    const existing = input.wakeupId ? store.get("wakeup", input.wakeupId) : null
    if (input.wakeupId && existing?.cardId !== card.id) throw new BoardError(404, "找不到唤醒规则。")
    const condition = input.condition
    if (!["time", "dependencies", "status", "ci-success"].includes(condition)) throw new BoardError(400, "未知的唤醒条件。")
    const subjectId = condition === "status" ? assertUuid(input.subjectId, "观察任务") : null
    if (subjectId) cards.get(subjectId)
    const status = condition === "status" ? requireText(input.status, 20, "观察状态") : null
    if (status && !["todo", "running", "blocked", "review", "done"].includes(status)) throw new BoardError(400, "无效的观察状态。")
    if (condition === "ci-success" && !card.prUrl) throw new BoardError(409, "请先关联 GitHub PR。")
    const executor = executors.get(input.executorId ?? card.executorId)
    if (!executor.enabled) throw new BoardError(409, "唤醒执行器已停用。")
    return store.save("wakeup", "", {
      id: existing?.id ?? randomUUID(), cardId: card.id, condition, subjectId, status, executorId: executor.id,
      prompt: requireText(input.prompt, 16000, "唤醒消息"),
      at: condition === "time" ? boundedNumber(input.at, 1, 8.64e15, "唤醒时间") : null,
      interval: condition === "time" && input.interval ? boundedNumber(input.interval, 60_000, 31_536_000_000, "重复间隔") : null,
      enabled: input.enabled !== false, lastRunAt: existing?.lastRunAt ?? null, error: null,
    })
  }

  function ready(rule, card) {
    if (rule.condition === "time") return rule.at <= Date.now()
    if (rule.condition === "dependencies") return !waitingFor(card, cards.list({ metadata: true })).length
    if (rule.condition === "status") return cards.get(rule.subjectId).status === rule.status
    return card.pullRequest?.ci === "success" && Date.now() - card.pullRequest.checkedAt <= 75_000
  }

  function tickWakeups() {
    if (!enabled) return
    let queued = false
    for (const rule of wakeups()) {
      if (!rule.enabled) continue
      try {
        const card = cards.get(rule.cardId)
        if (card.archived || card.status === "running" || !ready(rule, card)) continue
        storage.atomic(() => {
          runs.send(card, { executorId: rule.executorId, prompt: rule.prompt, mode: "queue" }, { defer: true })
          const now = Date.now()
          store.save("wakeup", "", { ...rule, lastRunAt: now, enabled: Boolean(rule.interval),
            at: rule.interval ? rule.at + (Math.floor((now - rule.at) / rule.interval) + 1) * rule.interval : rule.at,
            error: null })
        })
        queued = true
        notify(card.id, "wakeup", `${card.title} · 已加入执行队列`)
      } catch (error) {
        store.save("wakeup", "", { ...rule, enabled: false, error: error.message })
        notify(rule.cardId, "wakeup", `唤醒失败 · ${error.message}`)
      }
    }
    if (queued) runs.drain()
  }

  function handleCommands() {
    for (const item of commands.pending()) {
      try {
        commands.finish(item.id, { value: runTool(item.run_id, item.action, JSON.parse(item.data)) })
      } catch (error) {
        commands.finish(item.id, { error: error instanceof BoardError ? error.message : "看板工具操作失败。" })
      }
    }
  }

  return {
    notify, detail, store, tickWakeups,
    start(manager) {
      runs = manager
      timer = setInterval(() => {
        if (access.size) handleCommands()
      }, 175)
      schedule = setInterval(tickWakeups, 1000)
      timer.unref()
      schedule.unref()
    },
    close() {
      enabled = false
      clearInterval(timer)
      clearInterval(schedule)
    },
    reset: store.reset,
    authorize(job, attempt, executor) {
      if (executor.engine === "command") return null
      const token = executor.engine === "codex" ? store.authorize(job.runId) : null
      access.set(job.runId, { job, attempt, executor })
      return { token, bindDshAgent(agent) { dshAgents.set(agent, job.runId) } }
    },
    revoke(runId) { store.revoke(runId); access.delete(runId) },
    isDshAgentActive(agent) { return access.has(dshAgents.get(agent)) },
    agentTool(name, args, agent) { return runTool(dshAgents.get(agent), name, args) },
    rolePrompt(card, executor, capability) {
      const files = store.list("attachment", card.id)
      const parts = [executor.engine === "codex" ? null : executor.instructions]
      if (executor.engine !== "codex" && executor.skills?.length) {
        parts.push(`Role skills (read their instructions when relevant): ${executor.skills.join(", ")}`)
      }
      if (capability && executor.agentTools) {
        parts.push(`Current board task: ${card.id}. Use board_set_outcome with a handoff reason, board_read_project for related context, board_post_comment for discussion, and board_delegate only when delegation advances the request.`)
      }
      if (files.length) parts.push(`Task attachments (see the board or the materialized files provided below): ${files.map(file => file.name).join(", ")}`)
      return parts.filter(Boolean).join("\n\n")
    },
    files(cardId) { return store.list("attachment", cardId).map(file => ({ ...file, bytes: store.file(file.id) })) },
    file(id) {
      const record = store.get("attachment", id)
      if (!record) throw new BoardError(404, "找不到附件。")
      return { ...record, bytes: store.file(id) }
    },
    global(action, input) {
      if (action === "read-notification") {
        const record = store.get("notification", input.notificationId)
        if (!record) throw new BoardError(404, "找不到通知。")
        return store.save("notification", "", { ...record, read: true })
      }
      if (action === "read-all-notifications") {
        return storage.atomic(() => {
          for (const record of store.list("notification")) {
            if (!record.read) store.save("notification", "", { ...record, read: true })
          }
          return { read: true }
        })
      }
    },
    act(card, input) {
      const { action } = input
      if (action === "post-comment") return comment(card, input)
      if (action === "add-attachment") {
        if (typeof input.content !== "string" || input.content.length > Math.ceil(FILE_LIMIT / 3) * 4 ||
            !/^[A-Za-z0-9+/]+={0,2}$/.test(input.content)) throw new BoardError(400, "附件数据无效。")
        return attach(card, input, Buffer.from(input.content, "base64"))
      }
      if (action === "remove-attachment" || action === "remove-wakeup") {
        const kind = action === "remove-attachment" ? "attachment" : "wakeup"
        const record = store.get(kind, input.resourceId)
        if (!record || record.cardId !== card.id) throw new BoardError(404, "找不到资源。")
        return storage.atomic(() => {
          if (kind === "attachment") store.removeFile(record.id)
          return { removed: store.remove(kind, record.id) }
        })
      }
      if (action === "save-wakeup") return saveWakeup(card, input)
      if (action === "save-document" || action === "remove-document") {
        if (!card.project) throw new BoardError(409, "请先为任务设置项目。")
        const existing = input.resourceId ? store.get("document", input.resourceId) : null
        if (input.resourceId && existing?.project !== card.project) throw new BoardError(404, "找不到项目文档。")
        if (action === "remove-document") return { removed: Boolean(existing && store.remove("document", existing.id)) }
        return store.save("document", card.project, {
          id: existing?.id ?? randomUUID(), project: card.project, title: requireText(input.title, 120, "文档标题"),
          text: requireText(input.text, 24000, "文档内容"), updatedAt: Date.now(),
        })
      }
    },
  }
}
