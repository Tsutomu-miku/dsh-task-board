import { randomUUID } from "node:crypto"
import { resolveWorkspace } from "../config.mjs"
import { assertUuid, BoardError, requireText } from "../errors.mjs"
import { createHandoff, taskBrief, withHandoff } from "./handoff.mjs"
import { normalizeModel } from "./models.mjs"
import { containsPath, gitDelivery } from "./workspaces.mjs"

const RESULT_LABELS = {
  succeeded: "运行成功", failed: "运行失败", stopped: "运行已停止", interrupted: "运行已中断",
}

export function createRunManager({
  cards, executors, events, replies, queue, storage, run, workspaces, collaboration,
  parallelism = 4, timeoutMs = 60 * 60_000, maxTokens = 0,
}) {
  const jobs = new Map()
  let closing = false

  function recover(card) {
    if (card.status !== "running") return
    const attempt = card.runs[0]
    const error = "宿主退出，运行已中断。请检查执行结果后再继续。"
    if (attempt) {
      Object.assign(attempt, { status: "interrupted", finished: Date.now(), error })
      events.add(attempt.id, "status", error)
    }
    cards.move(card, "todo", "interrupted")
  }

  function getEnabledExecutor(id) {
    const executor = executors.get(id)
    if (!executor.enabled) throw new BoardError(409, "此执行器已停用，请先在执行器页面启用。")
    return executor
  }

  function dispatchPlan(card, input, queued) {
    const executor = getEnabledExecutor(queued ? input.executorId : card.executorId)
    const resume = queued
      ? !input.freshSession && card.runs.find(attempt => attempt.status === "succeeded" &&
          attempt.session && attempt.executor.id === executor.id && attempt.executor.preset === executor.preset)
      : input.resume && card.runs.find(attempt => attempt.session === card.session)
    const intended = executor.workdir ?? card.workdir
    const source = resolveWorkspace(!queued && resume ? resume.sourceWorkdir ?? resume.executor.workdir : intended)
    const legacy = Boolean(resume && (resume.legacyWorkspace || !resume.sourceWorkdir) &&
      (!queued || resume.executor.workdir === source))
    const workspace = workspaces.plan(card, source, legacy)
    return { executor, source, workspace, legacy }
  }

  function available(card, workspace) {
    return !card.archived && card.status !== "running" &&
      jobs.size < parallelism && ![...jobs.values()].some(job =>
        job.cardId === card.id || containsPath(job.lock, workspace.lock) || containsPath(workspace.lock, job.lock))
  }

  function start(card, input, queued = false, planned = dispatchPlan(card, input, queued)) {
    const { executor, workspace, source, legacy } = planned
    if (!available(card, workspace)) {
      throw new BoardError(409, "已有任务占用工作目录，或并发名额已满。")
    }
    const prompt = requireText(input.prompt, 16000, "任务说明")
    if (input.resume && !card.session) throw new BoardError(400, "这张卡片还没有可继续的会话。")
    const workdir = workspaces.prepare(workspace)
    const previous = queued
      ? !input.freshSession && card.runs.find(attempt =>
          attempt.status === "succeeded" && attempt.session &&
          attempt.executor.id === executor.id && attempt.executor.workdir === workdir &&
          attempt.executor.preset === executor.preset)
      : input.resume && card.runs.find(attempt => attempt.session === card.session && attempt.executor.workdir === workdir)
    if (input.resume && !previous) throw new BoardError(409, "会话工作区已变更，请启动新会话。")
    const session = previous?.session ?? null
    const model = input.model === undefined
      ? (previous ? previous.executor?.model ?? null : executor.model ?? null)
      : normalizeModel(input.model, executor.engine)
    const { instructions, ...publicExecutor } = executor
    const snapshot = { ...publicExecutor, workdir, model, preset: previous?.executor ? previous.executor.preset : executor.preset }
    const interruptedRequests = session
      ? card.runs.filter(attempt => attempt.session === session && attempt.status === "interrupted").map(attempt => attempt.id)
      : []
    const handoff = queued && !input.freshSession ? createHandoff(card, previous, replies) : null
    const latest = {
      id: queued ? input.id : randomUUID(),
      started: Date.now(), status: "running", prompt, output: "", error: null, session, executor: snapshot,
      sourceWorkdir: source, dispatchDepth: queued ? input.dispatchDepth ?? 0 : 0,
      ...(legacy ? { legacyWorkspace: true } : {}),
      baseCommit: gitDelivery(workdir)?.commit,
      ...(handoff ? { handoff: {
        sourceRunId: handoff.sourceRunId, afterRunId: handoff.afterRunId,
        includedRunIds: handoff.context.turns.map(turn => turn.runId),
      } } : {}),
    }

    card.brief ??= taskBrief(card)
    card.prompt = prompt
    card.blockedReason = null
    card.runs.unshift(latest)
    const job = { cardId: card.id, card, runId: latest.id, controller: new AbortController(), lock: workspace.lock, preview: "" }
    const access = storage.atomic(() => {
      cards.move(card, "running", "run")
      events.add(latest.id, "status", `开始运行 · ${executor.name}${model ? ` · ${model.id}` : ""}`)
      if (queued) queue.remove(input.id, card.id)
      return collaboration.authorize(job, latest, executor)
    })
    jobs.set(card.id, job)
    job.done = execute(job, card, latest, {
      engine: executor.engine, executor: { ...executor, ...snapshot }, cardId: card.id,
      workdir, sourceWorkdir: source, session, interruptedRequests,
      prompt: withHandoff(prompt, handoff), rolePrompt: collaboration.rolePrompt(card, executor),
      boardAccess: access,
      attachments: collaboration.files(card.id),
    })
    return card
  }

  function drain() {
    if (closing || jobs.size >= parallelism) return
    const pending = queue.pending()
    const visited = new Set()
    for (const message of pending) {
      if (jobs.size >= parallelism) break
      if (visited.has(message.cardId)) continue
      try {
        const card = cards.get(message.cardId)
        visited.add(card.id)
        if (card.archived || card.status === "running") continue
        const plan = dispatchPlan(card, message, true)
        if (available(card, plan.workspace)) start(card, message, true, plan)
      } catch (error) {
        if (!(error instanceof BoardError)) throw error
        queue.fail(message.id, error.message)
        visited.delete(message.cardId)
      }
    }
  }

  function stopJob(job) {
    if (job.controller.signal.aborted) return
    events.add(job.runId, "status", "已请求停止")
    job.controller.abort("user")
  }

  function send(card, input, { defer = false, depth = 0 } = {}) {
    if (card.archived) throw new BoardError(409, "请先恢复归档任务。")
    const mode = input.mode ?? queue.defaultMode()
    if (!["queue", "priority", "takeover"].includes(mode)) throw new BoardError(400, "Invalid send mode.")
    const job = jobs.get(card.id)
    if (mode === "takeover" && assertUuid(input.runId, "run ID") !== job?.runId) {
      throw new BoardError(409, "The active run changed. Refresh before taking over.")
    }
    const executor = getEnabledExecutor(input.executorId ?? card.executorId)
    resolveWorkspace(executor.workdir ?? card.workdir)
    const message = {
      id: randomUUID(), cardId: card.id, executorId: executor.id, executorName: executor.name,
      mode, prompt: requireText(input.prompt, 16000, "任务说明"), freshSession: input.freshSession === true,
      ...(depth ? { dispatchDepth: depth } : {}),
      ...(input.model !== undefined ? { model: normalizeModel(input.model, executor.engine) } : {}),
    }
    queue.add(message)
    if (mode === "takeover") stopJob(job)
    if (!defer) drain()
    return message
  }

  async function execute(job, card, attempt, options) {
    let result
    const deadline = setTimeout(() => job.controller.abort("timeout"), options.executor.timeoutMs ?? timeoutMs)
    deadline.unref()
    try {
      result = await run({
        ...options, requestId: attempt.id, signal: job.controller.signal,
        onControls(controls) { job.controls = controls },
        onEvent(kind, message, at) {
          if (jobs.get(card.id) !== job) return
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
          if (jobs.get(card.id) !== job || !Number.isSafeInteger(tokens) || tokens < 0) return
          attempt.usage = { tokens: scope === "session" ? tokens : (attempt.usage?.tokens ?? 0) + tokens, scope }
          try {
            cards.save(card)
            const budget = options.executor.maxTokens ?? maxTokens
            const priorUsage = scope === "session" && options.session ? card.runs.slice(1)
              .filter(prior => prior.session === options.session && prior.usage).map(prior => prior.usage) : []
            const baseline = priorUsage.find(usage => usage.scope === "session")?.tokens ??
              priorUsage.reduce((total, usage) => total + usage.tokens, 0)
            if (budget > 0 && attempt.usage.tokens - baseline >= budget) job.controller.abort("budget")
          } catch (error) {
            job.controller.abort("persistence")
            console.error("dsh-task-board: token usage write failed", error.code ?? error.name)
          }
        },
        onPreview(text) {
          if (jobs.get(card.id) === job) job.preview = String(text ?? "").slice(0, 16000)
        },
        onSession(id) {
          if (jobs.get(card.id) !== job) return
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

    clearTimeout(deadline)
    const failures = {
      timeout: "运行超过时间限制，已停止。", budget: "运行达到 Token 预算，已停止。",
      persistence: "无法保存运行日志，已停止运行。",
    }
    const failure = failures[job.controller.signal.reason]
    if (failure) result = { status: "failed", output: result?.output, error: failure }
    result ??= { status: "failed", error: "执行器未返回结果。" }
    let settled = false
    try {
      Object.assign(attempt, {
        status: result.status, output: String(result.output ?? "").slice(0, 16000),
        error: String(result.error ?? "").slice(0, 2000) || null, finished: Date.now(),
        delivery: gitDelivery(options.workdir, { baseCommit: attempt.baseCommit }),
      })
      storage.atomic(() => {
        collaboration.revoke(attempt.id)
        const state = job.outcome?.status === "blocked" ? "blocked"
          : result.status === "succeeded" ? job.outcome?.status ?? "review" : "todo"
        card.blockedReason = state === "blocked" ? job.outcome.reason : null
        if (job.outcome?.reason) attempt.handoffNote = job.outcome.reason
        cards.move(card, state, result.status)
        events.add(attempt.id, "status", attempt.error || RESULT_LABELS[result.status] || "运行结束")
      })
      settled = true
    } catch (error) {
      console.error("dsh-task-board: unable to persist run outcome", error.code ?? error.name)
    } finally {
      jobs.delete(card.id)
    }
    if (settled) {
      try { drain() } catch (error) {
        console.error("dsh-task-board: unable to dispatch queued messages", error.code ?? error.name)
      }
    }
  }

  function current(card, runId) {
    const job = jobs.get(card.id)
    if (!job || (runId && runId !== job.runId)) throw new BoardError(409, "这次运行已结束，请刷新后查看。")
    return job
  }

  return {
    start, send, drain, recover,
    job(cardId) { return jobs.get(cardId) },
    setDefaultMode(mode) {
      if (mode !== "queue" && mode !== "priority") throw new BoardError(400, "Invalid default send mode.")
      queue.setDefaultMode(mode)
      return { mode }
    },
    preview(cardId) {
      const job = jobs.get(cardId)
      return job?.preview ? { runId: job.runId, text: job.preview } : null
    },
    controls(cardId) {
      const job = jobs.get(cardId)
      return job?.controls?.steer ? { canSteer: true } : {}
    },
    async steer(card, input) {
      const job = current(card, assertUuid(input.runId, "run ID"))
      if (!job.controls?.steer) throw new BoardError(409, "当前运行暂时无法接收纠偏。")
      const message = requireText(input.prompt, 16000, "纠偏消息")
      await job.controls.steer(message)
      events.add(job.runId, "status", `已发送纠偏：${message}`)
      return { sent: true }
    },
    stop(card, runId) {
      stopJob(current(card, runId))
      return card
    },
    async close() {
      closing = true
      const active = [...jobs.values()]
      for (const job of active) job.controller.abort("shutdown")
      await Promise.all(active.map(job => job.done))
    },
  }
}
