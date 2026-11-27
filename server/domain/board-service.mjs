import { WORKSPACE_HOST } from "../config.mjs"
import { assertPlainObject, BoardError } from "../errors.mjs"
import { createCardRepository } from "../storage/card-repository.mjs"
import { openDatabase } from "../storage/database.mjs"
import { createEventRepository } from "../storage/event-repository.mjs"
import { createExecutorRepository } from "../storage/executor-repository.mjs"
import { createReplyRepository } from "../storage/reply-repository.mjs"
import { createQueueRepository } from "../storage/queue-repository.mjs"
import { createBoardContext } from "./board-context.mjs"
import { createCardManager } from "./cards.mjs"
import { createCollaboration } from "./collaboration.mjs"
import { createExecutorManager, EXECUTOR_ACTIONS } from "./executors.mjs"
import { createRunManager } from "./runs.mjs"
import { createWorkspaces, gitDelivery } from "./workspaces.mjs"

export function openBoard({
  database, workdir, run, codexSandbox = "read-only", presets = async () => [], models = async () => [],
  parallelism, timeoutMs, maxTokens,
}) {
  const storage = openDatabase(database)
  const shutdown = new AbortController()
  let closePromise

  function assertOpen() {
    if (shutdown.signal.aborted) throw new BoardError(503, "看板正在关闭。")
  }

  try {
    const store = createCardRepository(storage.db)
    const events = createEventRepository(storage.db)
    const replies = createReplyRepository(storage.db)
    const queue = createQueueRepository(storage.db)
    const context = createBoardContext(storage.db, replies)
    const executors = createExecutorManager({
      store: createExecutorRepository(storage.db), codexSandbox, presets, models, workdir,
      inUse: id => store.list({ metadata: true }).some(card => card.executorId === id) || queue.list().some(message => message.executorId === id),
      atomic(operation) { assertOpen(); return storage.atomic(operation) },
    })
    const cards = createCardManager({ store, executors, replies, events, queue, storage, workdir })
    const collaboration = createCollaboration({ storage, cards, executors })
    const workspaces = createWorkspaces(database)
    const runs = createRunManager({
      cards, executors, events, replies, queue, storage, run, workspaces,
      collaboration, parallelism, timeoutMs, maxTokens,
    })

    storage.atomic(() => {
      executors.seed()
      for (const card of cards.list()) {
        cards.attachLegacyExecutor(card)
        runs.recover(card)
      }
    })
    collaboration.start(runs)
    runs.drain()

    return {
      read(after) {
        assertOpen()
        const revision = store.revision()
        if (after === revision) return { revision, unchanged: true }
        const delta = after !== undefined && after >= 1 && after < revision
        const snapshot = delta ? store.changes(after) : { cards: cards.list() }
        return {
          ...snapshot, revision, delta, workdir, workspaceHost: WORKSPACE_HOST,
          executors: executors.list(), defaultExecutor: executors.defaultId(), defaultSendMode: queue.defaultMode(),
          queue: runs.queueState(),
        }
      },
      events(runId, after) { assertOpen(); return events.list(runId, after) },
      activity(runId, page) { assertOpen(); return events.activity(runId, page) },
      context(name, args) { assertOpen(); return context.call(name, args) },
      hasAgentAccess(agent, name) { return !shutdown.signal.aborted && collaboration.hasDshTool(agent, name) },
      agentTool(name, args, agent) { assertOpen(); return collaboration.agentTool(name, args, agent) },
      conversation(cardId, after) {
        assertOpen()
        cards.get(cardId)
        const attachments = after ? [] : collaboration.attachments(cardId)
        return {
          replies: replies.list(cardId, after), preview: runs.preview(cardId), ...runs.controls(cardId),
          ...(attachments.length ? { attachments } : {}),
        }
      },
      file(id) { assertOpen(); return collaboration.file(id) },
      delivery(cardId, runId, summary = false) {
        assertOpen()
        const card = cards.get(cardId)
        const attempt = runId ? card.runs.find(run => run.id === runId) : card.runs[0]
        if (runId && !attempt) throw new BoardError(404, "找不到这次运行。")
        const workspace = attempt?.executor.workdir ?? executors.workdirFor(card.executorId) ?? card.workdir
        const first = card.runs.findLast(item => item.executor.workdir === workspace && item.baseCommit)
        const git = runId && attempt !== card.runs[0] ? attempt?.delivery ?? null
          : gitDelivery(workspace, { diff: !summary, baseCommit: runId ? attempt?.baseCommit : first?.baseCommit })
        return { git, hasWorktrees: workspaces.hasRecords(card), worktrees: summary ? [] : workspaces.list(card, runs.occupied) }
      },
      worktrees(cardId) { assertOpen(); return workspaces.list(cards.get(cardId), runs.occupied) },
      act(raw) {
        assertOpen()
        const input = assertPlainObject(raw)
        if (EXECUTOR_ACTIONS.has(input.action)) return executors.act(input)
        if (input.action === "create") {
          if (input.autoRun !== true) return cards.create(input)
          const card = storage.atomic(() => {
            const created = cards.create(input)
            runs.send(created, { prompt: created.prompt, mode: "queue" }, { defer: true })
            return created
          })
          runs.drain()
          return cards.get(card.id)
        }
        if (input.action === "set-default-send-mode") return runs.setDefaultMode(input.mode)

        const card = cards.get(input.id)
        if (input.action === "stop") return runs.stop(card, input.runId)
        if (input.action === "steer") return runs.steer(card, input)
        if (input.action === "send") return runs.send(card, input)
        if (input.action === "cancel-queued") {
          storage.atomic(() => {
            if (!queue.remove(input.messageId, card.id)) throw new BoardError(409, "This message has left the queue.")
            collaboration.removeMessageFiles(card.id, input.messageId)
          })
          runs.drain()
          return { canceled: input.messageId }
        }
        if (card.status === "running") throw new BoardError(409, "卡片正在执行。")
        if ((input.from !== undefined || ["run", "move"].includes(input.action)) && input.from !== card.status) {
          throw new BoardError(409, "卡片状态已更新，请刷新后重试。")
        }
        if (input.action === "run") return runs.start(card, input)
        if (input.action === "merge-worktree") {
          workspaces.merge(card, input.worktreeId, input.target, runs.occupied)
          cards.save(card)
          return card
        }
        if (input.action === "cleanup-worktree" || input.action === "delete") {
          if (input.action === "cleanup-worktree" && typeof input.worktreeId !== "string") {
            throw new BoardError(400, "缺少工作树编号。")
          }
          try {
            workspaces.cleanup(card, input.action === "delete" ? undefined : input.worktreeId,
              Array.isArray(input.confirmations) ? input.confirmations : [], runs.occupied)
          } finally { cards.save(card) }
          if (input.action === "delete") return cards.remove(card, () => collaboration.removeCardFiles(card.id))
          return card
        }
        if (input.action === "archive") {
          card.archived = input.archived === true
          if (card.archived && card.status !== "done") throw new BoardError(409, "请先验收任务，再归档。")
          if (card.archived && queue.list().some(message => message.cardId === card.id && !message.error)) {
            throw new BoardError(409, "请先取消待执行消息。")
          }
          cards.save(card)
          if (!card.archived) runs.drain()
          return card
        }
        if (card.archived) throw new BoardError(409, "请先恢复归档任务。")
        let result
        if (input.action === "move") result = cards.moveManually(card, input.status, input.blockedReason)
        else if (input.action === "update") result = cards.update(card, input)
        else throw new BoardError(400, "无效的看板操作。")
        runs.drain()
        return result
      },
      close() {
        if (closePromise) return closePromise
        shutdown.abort()
        closePromise = Promise.all([collaboration.close(), runs.close()]).finally(() => storage.close())
        return closePromise
      },
    }
  } catch (error) {
    storage.close()
    throw error
  }
}
