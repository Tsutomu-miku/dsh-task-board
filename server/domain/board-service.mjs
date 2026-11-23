import { WORKSPACE_HOST } from "../config.mjs"
import { BoardError } from "../errors.mjs"
import { createCardRepository } from "../storage/card-repository.mjs"
import { openDatabase } from "../storage/database.mjs"
import { createEventRepository } from "../storage/event-repository.mjs"
import { createExecutorRepository } from "../storage/executor-repository.mjs"
import { createReplyRepository } from "../storage/reply-repository.mjs"
import { createCardManager } from "./cards.mjs"
import { createExecutorManager, EXECUTOR_ACTIONS } from "./executors.mjs"
import { createRunManager } from "./runs.mjs"

export function openBoard({
  database,
  workdir,
  run,
  codexSandbox = "read-only",
  presets = async () => [],
  models = async () => [],
}) {
  const storage = openDatabase(database)
  let closing = false

  function assertOpen() {
    if (closing) throw new BoardError(503, "看板正在关闭。")
  }

  try {
    const events = createEventRepository(storage.db)
    const replies = createReplyRepository(storage.db)
    const executors = createExecutorManager({
      store: createExecutorRepository(storage.db),
      codexSandbox,
      presets,
      models,
      workdir,
      atomic(operation) {
        assertOpen()
        return storage.atomic(operation)
      },
    })
    const cards = createCardManager({
      store: createCardRepository(storage.db),
      executors,
      replies,
      events,
      storage,
      workdir,
    })
    const runs = createRunManager({ cards, executors, events, replies, storage, run })

    storage.atomic(() => {
      executors.seed()
      for (const card of cards.list()) {
        cards.attachLegacyExecutor(card)
        runs.recover(card)
      }
    })

    const cardActions = {
      run: (card, input) => runs.start(card, input),
      move: (card, input) => cards.moveManually(card, input.status),
      update: (card, input) => cards.update(card, input),
      delete: card => cards.remove(card),
    }

    return {
      read() {
        assertOpen()
        return {
          workdir,
          workspaceHost: WORKSPACE_HOST,
          cards: cards.list(),
          executors: executors.list(),
          defaultExecutor: executors.defaultId(),
        }
      },

      events(runId) {
        assertOpen()
        return events.list(runId)
      },

      conversation(cardId) {
        assertOpen()
        cards.get(cardId)
        return { replies: replies.list(cardId), preview: runs.preview(cardId) }
      },

      act(input) {
        assertOpen()
        if (EXECUTOR_ACTIONS.has(input.action)) return executors.act(input)
        if (input.action === "create") return cards.create(input)

        const card = cards.get(input.id)
        if (input.action === "stop") return runs.stop(card, input.runId)
        if (card.status === "running") throw new BoardError(409, "卡片正在执行。")

        const handler = cardActions[input.action]
        if (!handler) throw new BoardError(400, "无效的看板操作。")
        if (input.from !== undefined && input.from !== card.status) {
          throw new BoardError(409, "卡片状态已更新，请刷新后重试。")
        }
        if ((input.action === "run" || input.action === "move") && input.from !== card.status) {
          throw new BoardError(409, "卡片状态已更新，请刷新后重试。")
        }
        return handler(card, input)
      },

      async close() {
        if (closing) return
        closing = true
        try {
          await runs.close()
        } finally {
          storage.close()
        }
      },
    }
  } catch (error) {
    storage.close()
    throw error
  }
}
