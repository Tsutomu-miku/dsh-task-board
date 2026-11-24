import { randomUUID } from "node:crypto"
import { resolveWorkspace } from "../config.mjs"
import { assertUuid, BoardError, requireText } from "../errors.mjs"
import { createHandoff, taskBrief, withHandoff } from "./handoff.mjs"
import { normalizeModel } from "./models.mjs"

const RUN_RESULT_LABELS = {
  succeeded: "运行成功",
  failed: "运行失败",
  stopped: "运行已停止",
  interrupted: "运行已中断",
}

export function createRunManager({ cards, executors, events, replies, queue, storage, run }) {
  let activeJob
  let closing = false

  function recover(card) {
    if (card.status !== "running") return
    const attempt = card.runs[0]
    const message = "宿主退出，运行已中断。请检查执行结果后再继续。"
    Object.assign(attempt, { status: "interrupted", finished: Date.now(), error: message })
    cards.move(card, "todo", "interrupted")
    events.add(attempt.id, "status", message)
  }

  function getEnabledExecutor(id) {
    const executor = executors.get(id)
    if (!executor.enabled) throw new BoardError(409, "此执行器已停用，请先在执行器页面启用。")
    return executor
  }

  function start(card, input, queued = false) {
    if (activeJob) {
      throw new BoardError(409, "已有任务在运行，请等待或先停止它。")
    }
    const prompt = requireText(input.prompt, 16000, "任务说明")
    if (input.resume && !card.session) {
      throw new BoardError(400, "这张卡片还没有可继续的会话。")
    }
    const executor = getEnabledExecutor(queued ? input.executorId : card.executorId)
    const intendedWorkdir = executor.workdir ?? card.workdir
    const targetWorkdir = queued ? resolveWorkspace(intendedWorkdir) : null
    const previous = queued
      ? !input.freshSession && card.runs.find(attempt =>
          attempt.status === "succeeded" && attempt.session &&
          attempt.executor.id === executor.id && attempt.executor.workdir === targetWorkdir &&
          attempt.executor.preset === executor.preset)
      : input.resume && card.runs.find(attempt => attempt.session === card.session)
    const session = queued ? previous?.session ?? null : input.resume ? card.session : null
    const workdir = targetWorkdir ?? resolveWorkspace(previous?.executor?.workdir ?? intendedWorkdir)
    const model = input.model === undefined
      ? (previous ? previous.executor?.model ?? null : executor.model ?? null)
      : normalizeModel(input.model, executor.engine)
    const snapshot = {
      ...executor,
      workdir,
      model,
      preset: previous?.executor ? previous.executor.preset : executor.preset,
    }
    const interruptedRequests = session
      ? card.runs
          .filter(attempt => attempt.session === session && attempt.status === "interrupted")
          .map(attempt => attempt.id)
      : []
    const handoff = queued && !input.freshSession ? createHandoff(card, previous, replies) : null

    const latest = {
      id: queued ? input.id : randomUUID(),
      started: Date.now(),
      status: "running",
      prompt,
      output: "",
      error: null,
      session,
      executor: snapshot,
      ...(handoff ? { handoff: {
        sourceRunId: handoff.sourceRunId,
        afterRunId: handoff.afterRunId,
        includedRunIds: handoff.context.turns.map(turn => turn.runId),
      } } : {}),
    }
    card.brief ??= taskBrief(card)
    card.prompt = prompt
    card.runs.unshift(latest)
    storage.atomic(() => {
      cards.move(card, "running", "run")
      events.add(latest.id, "status", `开始运行 · ${executor.name}${model ? ` · ${model.id}` : ""}`)
      if (queued) queue.remove(input.id, card.id)
    })

    const controller = new AbortController()
    const job = { cardId: card.id, runId: latest.id, controller, preview: "", done: null }
    activeJob = job
    job.done = execute(job, card, latest, {
      engine: executor.engine,
      executor: snapshot,
      workdir,
      prompt: withHandoff(prompt, handoff),
      session,
      interruptedRequests,
    })
    return card
  }

  function drain() {
    while (!closing && !activeJob) {
      const message = queue.next()
      if (!message) return
      try {
        start(cards.get(message.cardId), message, true)
      } catch (error) {
        if (!(error instanceof BoardError)) throw error
        queue.fail(message.id, error.message)
      }
    }
  }

  function stopJob(job) {
    if (job.controller.signal.aborted) return
    events.add(job.runId, "status", "已请求停止")
    job.controller.abort("user")
  }

  function send(card, input) {
    const mode = input.mode ?? queue.defaultMode()
    if (!["queue", "priority", "takeover"].includes(mode)) {
      throw new BoardError(400, "Invalid send mode.")
    }
    if (mode === "takeover") {
      const runId = assertUuid(input.runId, "run ID")
      if (activeJob && (activeJob.cardId !== card.id || activeJob.runId !== runId)) {
        throw new BoardError(409, "The active run changed. Refresh before taking over.")
      }
    }
    const executor = getEnabledExecutor(input.executorId ?? card.executorId)
    resolveWorkspace(executor.workdir ?? card.workdir)
    const message = {
      id: randomUUID(),
      cardId: card.id,
      executorId: executor.id,
      executorName: executor.name,
      mode,
      prompt: requireText(input.prompt, 16000, "任务说明"),
      freshSession: input.freshSession === true,
      ...(input.model !== undefined ? { model: normalizeModel(input.model, executor.engine) } : {}),
    }
    queue.add(message)
    if (mode === "takeover" && activeJob) stopJob(activeJob)
    drain()
    return message
  }

  async function execute(job, card, attempt, options) {
    let result
    try {
      result = await run({
        ...options,
        requestId: attempt.id,
        signal: job.controller.signal,
        onEvent(kind, message, at) {
          if (activeJob !== job) return
          try {
            if (kind === "output" && String(message ?? "").trim()) {
              storage.atomic(() => {
                replies.add(card.id, attempt.id, message)
                events.add(attempt.id, kind, message, at)
              })
              job.preview = ""
            } else {
              events.add(attempt.id, kind, message, at)
            }
          } catch (error) {
            job.controller.abort("persistence")
            console.error("dsh-task-board: event write failed", error.code ?? error.name)
          }
        },
        onUsage(tokens, scope = "run") {
          if (activeJob !== job || !Number.isSafeInteger(tokens) || tokens < 0) return
          attempt.usage = {
            tokens: scope === "session" ? tokens : (attempt.usage?.tokens ?? 0) + tokens,
            scope,
          }
          try {
            cards.save(card)
          } catch (error) {
            job.controller.abort("persistence")
            console.error("dsh-task-board: token usage write failed", error.code ?? error.name)
          }
        },
        onPreview(text) {
          if (activeJob === job) {
            job.preview = String(text ?? "").slice(0, 16000)
          }
        },
        onSession(id) {
          if (activeJob !== job) return
          attempt.session = id
          if (attempt.executor.id === card.executorId) card.session = id
          storage.atomic(() => {
            cards.save(card)
            events.add(attempt.id, "status", options.session ? "已连接现有会话" : "已创建会话")
          })
        },
      })
    } catch (error) {
      result = { status: "failed", error: error.message }
    }

    if (job.controller.signal.reason === "persistence") {
      result = { status: "failed", output: result.output, error: "无法保存运行日志，已停止运行。" }
    }

    let settled = false
    try {
      Object.assign(attempt, {
        status: result.status,
        output: String(result.output ?? "").slice(0, 16000),
        error: String(result.error ?? "").slice(0, 2000) || null,
        finished: Date.now(),
      })
      storage.atomic(() => {
        cards.move(card, result.status === "succeeded" ? "review" : "todo", result.status)
        events.add(attempt.id, "status", attempt.error || RUN_RESULT_LABELS[result.status] || "运行结束")
      })
      settled = true
    } catch (error) {
      console.error("dsh-task-board: unable to persist run outcome", error.code ?? error.name)
    } finally {
      activeJob = undefined
    }
    if (settled) {
      try {
        drain()
      } catch (error) {
        console.error("dsh-task-board: unable to dispatch queued messages", error.code ?? error.name)
      }
    }
  }

  return {
    start,
    send,
    setDefaultMode(mode) {
      if (mode !== "queue" && mode !== "priority") throw new BoardError(400, "Invalid default send mode.")
      queue.setDefaultMode(mode)
      return { mode }
    },
    drain,
    recover,
    preview(cardId) {
      return activeJob?.cardId === cardId && activeJob.preview
        ? { runId: activeJob.runId, text: activeJob.preview }
        : null
    },
    stop(card, runId) {
      if (activeJob?.cardId !== card.id || (runId && runId !== activeJob.runId)) {
        throw new BoardError(409, "这次运行已结束，请刷新后查看。")
      }
      stopJob(activeJob)
      return card
    },
    async close() {
      closing = true
      activeJob?.controller.abort("shutdown")
      await activeJob?.done
    },
  }
}
