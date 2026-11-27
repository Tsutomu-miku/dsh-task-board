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
import { readPullRequest } from "./pull-requests.mjs"
import { createRunManager } from "./runs.mjs"
import { createWorkspaces, gitDelivery } from "./workspaces.mjs"

export function openBoard({
  database, workdir, run, codexSandbox = "read-only", presets = async () => [], models = async () => [],
  parallelism, timeoutMs, maxTokens, inspectPullRequest = readPullRequest,
}) {
  const storage = openDatabase(database)
  const shutdown = new AbortController()
  const checks = new Map()
  let refreshTimer
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
    const runs = createRunManager({
      cards, executors, events, replies, queue, storage, run, workspaces: createWorkspaces(database),
      collaboration, parallelism, timeoutMs, maxTokens,
    })

    storage.atomic(() => {
      collaboration.reset()
      executors.seed()
      for (const card of cards.list()) {
        cards.attachLegacyExecutor(card)
        runs.recover(card)
      }
    })
    collaboration.start(runs)
    runs.drain()

    async function refreshPullRequest(card) {
      if (!card.prUrl) throw new BoardError(409, "请先关联 GitHub PR。")
      const existing = checks.get(card.id)
      if (existing?.url === card.prUrl) return existing.promise
      const url = card.prUrl
      const promise = (async () => {
        const info = await inspectPullRequest(url, shutdown.signal)
        assertOpen()
        const current = cards.get(card.id)
        if (current.prUrl !== url) throw new BoardError(409, "关联的 PR 已更改。")
        current.pullRequest = info
        // The run manager holds the authoritative in-progress record.
        const job = runs.job(card.id)
        if (job) Object.assign(job.card, { pullRequest: info })
        cards.save(current)
        collaboration.tickWakeups()
        return info
      })()
      checks.set(card.id, { url, promise })
      try { return await promise }
      finally { if (checks.get(card.id)?.promise === promise) checks.delete(card.id) }
    }

    const lastPrAttempt = new Map()
    function checkWakeupPullRequests() {
      for (const rule of collaboration.store.list("wakeup")) {
        if (!rule.enabled || rule.condition !== "ci-success" || checks.has(rule.cardId)) continue
        if (Date.now() - (lastPrAttempt.get(rule.cardId) ?? 0) < 60_000) continue
        lastPrAttempt.set(rule.cardId, Date.now())
        void Promise.resolve().then(() => refreshPullRequest(cards.get(rule.cardId))).catch(error => {
          if (!shutdown.signal.aborted) collaboration.notify(rule.cardId, "wakeup", error.message)
        })
      }
    }
    refreshTimer = setInterval(checkWakeupPullRequests, 5000)
    refreshTimer.unref()

    return {
      read(after) {
        assertOpen()
        const revision = store.revision()
        if (after === revision) return { revision, unchanged: true }
        const delta = after !== undefined && after >= 1 && after < revision
        const snapshot = delta ? store.changes(after) : { cards: cards.list() }
        const notifications = collaboration.store.list("notification")
        return {
          ...snapshot, revision, delta, workdir, workspaceHost: WORKSPACE_HOST,
          executors: executors.list(), defaultExecutor: executors.defaultId(), defaultSendMode: queue.defaultMode(),
          queue: queue.list(), notifications: notifications.slice(0, 50),
          unreadNotifications: notifications.filter(item => !item.read).length,
        }
      },
      events(runId, after) { assertOpen(); return events.list(runId, after) },
      activity(runId, page) { assertOpen(); return events.activity(runId, page) },
      context(name, args) { assertOpen(); return context.call(name, args) },
      hasAgentAccess(agent) { return !shutdown.signal.aborted && collaboration.isDshAgentActive(agent) },
      agentTool(name, args, agent) { assertOpen(); return collaboration.agentTool(name, args, agent) },
      conversation(cardId, after) {
        assertOpen()
        cards.get(cardId)
        return { replies: replies.list(cardId, after), preview: runs.preview(cardId), ...runs.controls(cardId) }
      },
      detail(cardId) { assertOpen(); return collaboration.detail(cards.get(cardId)) },
      file(id) { assertOpen(); return collaboration.file(id) },
      delivery(cardId, runId) {
        assertOpen()
        const card = cards.get(cardId)
        const attempt = runId ? card.runs.find(run => run.id === runId) : card.runs[0]
        if (runId && !attempt) throw new BoardError(404, "找不到这次运行。")
        const workspace = attempt?.executor.workdir ?? card.workdir
        const first = card.runs.findLast(item => item.executor.workdir === workspace && item.baseCommit)
        const git = runId && attempt !== card.runs[0] ? attempt?.delivery ?? null
          : gitDelivery(workspace, { diff: true, baseCommit: runId ? attempt?.baseCommit : first?.baseCommit })
        return { git, pullRequest: card.pullRequest }
      },
      act(raw) {
        assertOpen()
        const input = assertPlainObject(raw)
        if (EXECUTOR_ACTIONS.has(input.action)) return executors.act(input)
        if (input.action === "create") return cards.create(input)
        if (input.action === "set-default-send-mode") return runs.setDefaultMode(input.mode)
        const global = collaboration.global(input.action, input)
        if (global) return global

        const card = cards.get(input.id)
        if (input.action === "stop") return runs.stop(card, input.runId)
        if (input.action === "steer") return runs.steer(card, input)
        if (input.action === "approve") return runs.approve(card, input)
        if (input.action === "send") return runs.send(card, input)
        if (input.action === "refresh-pr") return refreshPullRequest(card)
        if (input.action === "cancel-queued") {
          if (!queue.remove(input.messageId, card.id)) throw new BoardError(409, "This message has left the queue.")
          return { canceled: input.messageId }
        }
        const resource = collaboration.act(card, input)
        if (resource) return resource
        if (card.status === "running") throw new BoardError(409, "卡片正在执行。")
        if ((input.from !== undefined || ["run", "move"].includes(input.action)) && input.from !== card.status) {
          throw new BoardError(409, "卡片状态已更新，请刷新后重试。")
        }
        if (input.action === "run") return runs.start(card, input)
        if (input.action === "delete") return cards.remove(card, () => collaboration.store.removeScope(card.id))
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
        if (input.action === "move") result = cards.moveManually(card, input.status)
        else if (input.action === "update") result = cards.update(card, input)
        else throw new BoardError(400, "无效的看板操作。")
        runs.drain()
        collaboration.tickWakeups()
        return result
      },
      close() {
        if (closePromise) return closePromise
        shutdown.abort()
        clearInterval(refreshTimer)
        collaboration.close()
        closePromise = Promise.allSettled([runs.close(), ...[...checks.values()].map(check => check.promise)])
          .finally(() => storage.close())
        return closePromise
      },
    }
  } catch (error) {
    storage.close()
    throw error
  }
}
