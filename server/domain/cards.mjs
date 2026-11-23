import { randomUUID } from "node:crypto"
import { resolveWorkspace } from "../config.mjs"
import { BoardError, requireText } from "../errors.mjs"
import { builtinExecutorId } from "./executors.mjs"

const MOVABLE_STATUSES = new Set(["todo", "review", "done"])

export function createCardManager({ store, executors, replies, events, storage, workdir }) {
  function move(card, status, cause) {
    if (card.status !== status) {
      card.history.push({ from: card.status, to: status, cause, at: Date.now() })
      card.status = status
    }
    store.save(card)
    return card
  }

  function get(id) {
    const card = typeof id === "string" ? store.get(id) : null
    if (!card) throw new BoardError(404, "找不到这张卡片。")
    return card
  }

  function create(input) {
    const id = input.executorId ?? (input.engine ? builtinExecutorId(input.engine) : executors.defaultId())
    if (!id) throw new BoardError(409, "请先添加并启用执行器。")
    const executor = executors.get(id)
    if (!executor.enabled) throw new BoardError(409, "请选择已启用的执行器。")

    const rawWorkdir = typeof input.workdir === "string" ? input.workdir.trim() : ""
    const resolvedWorkdir = rawWorkdir ? resolveWorkspace(rawWorkdir) : (executor.workdir ?? workdir)
    const created = Date.now()
    const card = {
      id: randomUUID(),
      title: requireText(input.title, 120, "标题"),
      prompt: requireText(input.prompt, 16000, "任务说明"),
      engine: executor.engine,
      executorId: id,
      workdir: resolvedWorkdir,
      status: "todo",
      created,
      session: null,
      runs: [],
      history: [{ from: null, to: "todo", cause: "created", at: created }],
    }
    store.save(card)
    return card
  }

  function update(card, input) {
    if (input.title !== undefined) {
      card.title = requireText(input.title, 120, "标题")
    }
    if (input.prompt !== undefined) {
      card.prompt = requireText(input.prompt, 16000, "任务说明")
    }
    if (input.executorId !== undefined && input.executorId !== card.executorId) {
      const executor = executors.get(input.executorId)
      if (!executor.enabled) throw new BoardError(409, "请选择已启用的执行器。")
      // Changing executor resets the active session pointer if engine changes
      if (executor.engine !== card.engine) {
        card.session = null
      }
      card.executorId = executor.id
      card.engine = executor.engine
    }
    if (input.workdir !== undefined) {
      const rawWorkdir = typeof input.workdir === "string" ? input.workdir.trim() : ""
      const executor = executors.get(card.executorId)
      card.workdir = rawWorkdir ? resolveWorkspace(rawWorkdir) : (executor.workdir ?? workdir)
    }
    store.save(card)
    return card
  }

  function remove(card) {
    const runIds = card.runs.map(run => run.id)
    storage.atomic(() => {
      replies.removeByCard(card.id)
      events.removeByRuns(runIds)
      store.remove(card.id)
    })
    return { deleted: card.id }
  }

  function moveManually(card, status) {
    if (!MOVABLE_STATUSES.has(status)) throw new BoardError(400, "请选择有效的目标状态。")
    return move(card, status, "manual")
  }

  function attachLegacyExecutor(card) {
    if (card.executorId && card.runs.every(attempt => attempt.executor)) return
    card.executorId ??= builtinExecutorId(card.engine)
    const snapshot = { ...executors.get(builtinExecutorId(card.engine)), workdir: card.workdir }
    for (const attempt of card.runs) {
      attempt.executor ??= snapshot
    }
    store.save(card)
  }

  return {
    list: store.list,
    save: store.save,
    get,
    move,
    create,
    update,
    remove,
    moveManually,
    attachLegacyExecutor,
  }
}
