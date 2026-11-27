import { randomBytes } from "node:crypto"
import { assertPlainObject, BoardError, requireText } from "../errors.mjs"
import { createWorkflowRepository } from "../storage/workflow-repository.mjs"
import { openRunCallback } from "./run-callback.mjs"

const OUTPUT_STATES = ["blocked", "review", "todo"]
const OUTCOME = "board_set_outcome"
const DELEGATE = "board_delegate"

export const BOARD_RUN_TOOLS = [
  {
    name: OUTCOME,
    description: "Set the current run's outcome: blocked when awaiting help, review for delivery, or todo for work still in progress.",
    inputSchema: {
      type: "object", additionalProperties: false, required: ["status", "reason"],
      properties: { status: { type: "string", enum: OUTPUT_STATES }, reason: { type: "string" } },
    },
  },
  {
    name: DELEGATE,
    description: "Queue another opted-in executor on the same task. Pass one of the executor IDs provided in the task instructions.",
    inputSchema: {
      type: "object", additionalProperties: false, required: ["executorId", "prompt"],
      properties: { executorId: { type: "string" }, prompt: { type: "string" } },
    },
  },
]

export function createCollaboration({ storage, cards, executors }) {
  const store = createWorkflowRepository(storage.db)
  const access = new Map()
  const tokens = new Map()
  const dshAgents = new WeakMap()
  let runs
  let callback
  let enabled = true

  function active(runId) {
    const entry = access.get(runId)
    if (!enabled || !entry || entry.job.controller.signal.aborted || runs.job(entry.job.cardId) !== entry.job) return null
    return entry
  }

  function runTool(runId, name, raw) {
    const entry = active(runId)
    if (!entry) throw new BoardError(403, "该运行没有看板写权限。")
    const { job, attempt, executor } = entry
    const input = assertPlainObject(raw ?? {})
    if (name === OUTCOME) {
      if (!OUTPUT_STATES.includes(input.status)) throw new BoardError(400, "无效的运行结论。")
      job.outcome = { status: input.status, reason: requireText(input.reason, 2000, "交接说明") }
      return { accepted: true, outcome: job.outcome }
    }
    if (name !== DELEGATE) throw new BoardError(404, "未知的看板工具。")
    if (!executor.agentTools) throw new BoardError(403, "当前执行器尚未启用自动交接。")
    if (job.delegated || attempt.dispatchDepth >= 5) throw new BoardError(409, "该轮已交接或已达到 5 层交接上限。")
    const target = executors.get(input.executorId)
    if (!target.enabled || !target.agentTools || target.id === executor.id) {
      throw new BoardError(403, "请选择另一位允许自动交接的执行器。")
    }
    const card = cards.get(job.cardId)
    const message = runs.send(card, { executorId: target.id, prompt: input.prompt, mode: "priority" }, {
      defer: true, depth: (attempt.dispatchDepth ?? 0) + 1,
    })
    job.delegated = true
    // The active card remains locked until its current run records an outcome.
    return { cardId: card.id, messageId: message.id }
  }

  return {
    start(manager) { runs = manager },
    close() {
      enabled = false
      access.clear()
      tokens.clear()
      return callback?.close()
    },
    authorize(job, attempt, executor) {
      const token = executor.engine === "codex" ? randomBytes(32).toString("hex") : null
      if (token) {
        callback ??= openRunCallback(key => active(tokens.get(key)),
          (key, name, args) => runTool(tokens.get(key), name, args))
        tokens.set(token, job.runId)
      }
      access.set(job.runId, { job, attempt, executor, token })
      return { token, port: token ? callback.port : null, canDelegate: executor.agentTools === true,
        bindDshAgent(agent) { dshAgents.set(agent, job.runId) } }
    },
    revoke(runId) {
      const token = access.get(runId)?.token
      if (token) tokens.delete(token)
      access.delete(runId)
    },
    hasDshTool(agent, name) {
      const entry = active(dshAgents.get(agent))
      return Boolean(entry && (name === OUTCOME || (name === DELEGATE && entry.executor.agentTools)))
    },
    agentTool(name, args, agent) { return runTool(dshAgents.get(agent), name, args) },
    rolePrompt(card, executor, includeInstructions) {
      const parts = [
        includeInstructions ? executor.instructions : null,
        `Board task ${card.id}. If blocked, delivering, or leaving work pending, call board_set_outcome with the corresponding status and a concise reason.`,
      ]
      if (executor.agentTools) {
        const targets = executors.list().filter(item => item.enabled && item.agentTools && item.id !== executor.id)
          .map(item => ({ id: item.id, name: item.name, engine: item.engine }))
        if (targets.length) parts.push(`Only hand off when it advances this task. Available board_delegate targets: ${JSON.stringify(targets)}`)
      }
      return parts.filter(Boolean).join("\n\n")
    },
    attachments: store.attachments,
    addMessageFiles: store.addMessageFiles,
    removeMessageFiles: store.removeMessageFiles,
    files(attachments = []) {
      return attachments.flatMap(record => {
        const bytes = store.file(record.id)
        return bytes ? [{ ...record, bytes }] : []
      })
    },
    file(id) {
      const record = store.getAttachment(id)
      const bytes = record && store.file(id)
      if (!bytes) throw new BoardError(404, "找不到附件。")
      return { ...record, bytes }
    },
    removeCardFiles: store.removeCardFiles,
  }
}
