import { randomUUID } from "node:crypto"
import { BoardError, text } from "../errors.mjs"
import { resolveWorkspace } from "./executors.mjs"
import { normalizeModel } from "./models.mjs"

const labels = { succeeded: "运行成功", failed: "运行失败", stopped: "运行已停止", interrupted: "运行已中断" }

export function manageRuns({ cards, executors, events, replies, storage, run }) {
  let active

  function recover(card) {
    if (card.status !== "running") return
    const attempt = card.runs[0]
    const message = "宿主退出，运行已中断。请检查执行结果后再继续。"
    Object.assign(attempt, { status: "interrupted", finished: Date.now(), error: message })
    cards.move(card, "todo", "interrupted")
    events.add(attempt.id, "status", message)
  }

  function start(card, input) {
    if (active) throw new BoardError(409, "已有任务在运行，请等待或先停止它。")
    const prompt = text(input.prompt, 16000, "任务说明")
    if (input.resume && !card.session) throw new BoardError(400, "这张卡片还没有可继续的会话。")
    const executor = executors.get(card.executorId)
    if (!executor.enabled) throw new BoardError(409, "此执行器已停用，请先在执行器页面启用。")
    const session = input.resume ? card.session : null
    const previous = session && card.runs.find(attempt => attempt.session === session)
    const workdir = resolveWorkspace(previous?.executor?.workdir ?? executor.workdir ?? card.workdir)
    const model = input.model === undefined
      ? (previous ? previous.executor?.model ?? null : executor.model ?? null)
      : normalizeModel(input.model, executor.engine)
    const snapshot = { ...executor, workdir, model, preset: previous?.executor ? previous.executor.preset : executor.preset }
    const interruptedRequests = session ? card.runs
      .filter(attempt => attempt.session === session && attempt.status === "interrupted")
      .map(attempt => attempt.id) : []
    const latest = { id: randomUUID(), started: Date.now(), status: "running", prompt, output: "", error: null, session, executor: snapshot }
    card.prompt = prompt
    card.runs.unshift(latest)
    storage.atomic(() => {
      cards.move(card, "running", "run")
      events.add(latest.id, "status", `开始运行 · ${executor.name}${model ? ` · ${model.id}` : ""}`)
    })

    const controller = new AbortController()
    const job = { cardId: card.id, runId: latest.id, controller, preview: "", done: null }
    active = job
    job.done = execute(job, card, latest, { engine: executor.engine, executor: snapshot, workdir, prompt, session, interruptedRequests })
    return card
  }

  async function execute(job, card, attempt, options) {
    let result
    try {
      result = await run({ ...options, requestId: attempt.id, signal: job.controller.signal,
        onEvent(kind, message) {
          if (active !== job) return
          try {
            if (kind === "output" && String(message ?? "").trim()) {
              storage.atomic(() => {
                replies.add(card.id, attempt.id, message)
                events.add(attempt.id, kind, message)
              })
              job.preview = ""
            } else events.add(attempt.id, kind, message)
          } catch (error) {
            job.controller.abort("persistence")
            console.error("dsh-task-board: event write failed", error.code ?? error.name)
          }
        },
        onPreview(text) {
          if (active === job) job.preview = String(text ?? "").slice(0, 16000)
        },
        onSession(id) {
          if (active !== job) return
          attempt.session = id
          card.session = id
          storage.atomic(() => {
            cards.save(card)
            events.add(attempt.id, "status", options.session ? "已连接现有会话" : "已创建会话")
          })
        },
      })
    } catch (error) { result = { status: "failed", error: error.message } }
    if (job.controller.signal.reason === "persistence") result = { status: "failed", output: result.output, error: "无法保存运行日志，已停止运行。" }
    try {
      Object.assign(attempt, {
        status: result.status,
        output: String(result.output ?? "").slice(0, 16000),
        error: String(result.error ?? "").slice(0, 2000) || null,
        finished: Date.now(),
      })
      storage.atomic(() => {
        cards.move(card, result.status === "succeeded" ? "review" : "todo", result.status)
        events.add(attempt.id, "status", attempt.error || labels[result.status] || "运行结束")
      })
    } catch (error) {
      console.error("dsh-task-board: unable to persist run outcome", error.code ?? error.name)
    } finally { active = undefined }
  }

  return {
    start,
    recover,
    preview(cardId) {
      return active?.cardId === cardId && active.preview ? { runId: active.runId, text: active.preview } : null
    },
    stop(card, runId) {
      if (active?.cardId !== card.id || (runId && runId !== active.runId)) {
        throw new BoardError(409, "这次运行已结束，请刷新后查看。")
      }
      if (!active.controller.signal.aborted) {
        active.controller.abort("user")
        events.add(active.runId, "status", "已请求停止")
      }
      return card
    },
    async close() {
      active?.controller.abort("shutdown")
      await active?.done
    },
  }
}
