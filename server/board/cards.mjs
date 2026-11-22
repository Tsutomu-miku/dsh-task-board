import { randomUUID } from "node:crypto"
import { BoardError, text } from "../errors.mjs"
import { builtinExecutor } from "./executors.mjs"

const movable = new Set(["todo", "review", "done"])

export function manageCards({ store, executors, workdir }) {
  function move(card, status, cause) {
    if (card.status !== status) {
      card.history.push({ from: card.status, to: status, cause, at: Date.now() })
      card.status = status
    }
    store.save(card)
    return card
  }
  return {
    list: store.list,
    save: store.save,
    move,
    get(id) {
      const card = typeof id === "string" && store.get(id)
      if (!card) throw new BoardError(404, "找不到这张卡片。")
      return card
    },
    create(input) {
      const id = input.executorId ?? (input.engine ? builtinExecutor(input.engine) : executors.defaultId())
      if (!id) throw new BoardError(409, "请先添加并启用执行器。")
      const executor = executors.get(id)
      if (!executor.enabled) throw new BoardError(409, "请选择已启用的执行器。")
      const created = Date.now()
      const card = {
        id: randomUUID(), title: text(input.title, 120, "标题"), prompt: text(input.prompt, 16000, "任务说明"),
        engine: executor.engine, executorId: id, workdir: executor.workdir ?? workdir,
        status: "todo", created, session: null, runs: [],
        history: [{ from: null, to: "todo", cause: "created", at: created }],
      }
      store.save(card)
      return card
    },
    moveManually(card, status) {
      if (!movable.has(status)) throw new BoardError(400, "请选择有效的目标状态。")
      return move(card, status, "manual")
    },
    attachLegacyExecutor(card) {
      if (card.executorId && card.runs.every(attempt => attempt.executor)) return
      card.executorId ??= builtinExecutor(card.engine)
      const snapshot = { ...executors.get(builtinExecutor(card.engine)), workdir: card.workdir }
      for (const attempt of card.runs) attempt.executor ??= snapshot
      store.save(card)
    },
  }
}
