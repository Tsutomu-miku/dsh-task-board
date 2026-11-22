import { BoardError } from "../errors.mjs"
import { cardStore } from "../storage/cards.mjs"
import { openDatabase } from "../storage/database.mjs"
import { executorStore } from "../storage/executors.mjs"
import { runEventStore } from "../storage/run-events.mjs"
import { manageCards } from "./cards.mjs"
import { executorActions, manageExecutors } from "./executors.mjs"
import { manageRuns } from "./runs.mjs"

export function openBoard({ database, workdir, run, codexSandbox = "read-only", presets = async () => [], models = async () => [] }) {
  const storage = openDatabase(database)
  let closing = false
  function checkOpen() {
    if (closing) throw new BoardError(503, "看板正在关闭。")
  }
  try {
    const events = runEventStore(storage.db)
    const executors = manageExecutors({ store: executorStore(storage.db), codexSandbox, presets, models, workdir,
      atomic: operation => { checkOpen(); return storage.atomic(operation) } })
    const cards = manageCards({ store: cardStore(storage.db), executors, workdir })
    const runs = manageRuns({ cards, executors, events, storage, run })
    storage.atomic(() => {
      executors.seed()
      for (const card of cards.list()) {
        cards.attachLegacyExecutor(card)
        runs.recover(card)
      }
    })

    return {
      read() {
        checkOpen()
        return { workdir, cards: cards.list(), executors: executors.list(), defaultExecutor: executors.defaultId() }
      },
      events(id) { checkOpen(); return events.list(id) },
      act(input) {
        checkOpen()
        if (executorActions.has(input.action)) return executors.act(input)
        if (input.action === "create") return cards.create(input)
        const card = cards.get(input.id)
        if (input.action === "stop") return runs.stop(card, input.runId)
        if (card.status === "running") throw new BoardError(409, "卡片正在执行。")
        if (input.from !== card.status) throw new BoardError(409, "卡片状态已更新，请刷新后重试。")
        if (input.action === "run") return runs.start(card, input)
        if (input.action === "move") return cards.moveManually(card, input.status)
        throw new BoardError(400, "无效的看板操作。")
      },
      async close() {
        if (closing) return
        closing = true
        try { await runs.close() } finally { storage.close() }
      },
    }
  } catch (error) {
    storage.close()
    throw error
  }
}
