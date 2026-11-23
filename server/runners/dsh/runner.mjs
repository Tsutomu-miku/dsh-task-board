import { applyDshModel } from "./model.mjs"
import { followDshPreview } from "./preview.mjs"

const RUN_TIMEOUT_MS = 30 * 60 * 1000

function mapTurnResult(reason, output) {
  if (reason.kind === "completed") return { status: "succeeded", output }
  if (reason.kind === "aborted") return { status: "stopped", output }
  if (reason.kind === "interrupted") return { status: "interrupted", output }
  const error = reason.error?.code === "MISSING_CREDENTIAL"
    ? "请在 DSH 的模型设置中配置当前模型的凭据。"
    : reason.error?.message ?? `DSH 运行结束（${reason.kind}）。`
  return { status: "failed", output, error }
}

function mapAbortedResult(signal) {
  if (signal.reason === "timeout") {
    return { status: "failed", error: "DSH 运行超过 30 分钟，已请求停止。" }
  }
  return { status: signal.reason === "shutdown" ? "interrupted" : "stopped" }
}

export async function runDsh(ctx, {
  workdir,
  executor,
  prompt,
  session,
  requestId,
  interruptedRequests,
  signal: callerSignal,
  onSession,
  onEvent,
  onPreview,
}) {
  const timeout = new AbortController()
  const deadline = setTimeout(() => timeout.abort("timeout"), RUN_TIMEOUT_MS)
  const signal = AbortSignal.any([callerSignal, timeout.signal])
  const { sessionController, sessions } = ctx

  let disposeEvents
  let disposePreview
  let stopHandler
  let output = ""

  try {
    if (signal.aborted) return mapAbortedResult(signal)

    const sessionId = session ?? (await sessionController.create({
      cwd: workdir,
      agentPreset: executor.preset ?? undefined,
    })).sessionId
    onSession(sessionId)
    if (signal.aborted) return mapAbortedResult(signal)

    const found = await sessionController.resolveAgent(sessionId)
    if (!("agent" in found)) {
      return { status: "failed", error: found.error?.message ?? "DSH 会话不可用。" }
    }
    const { agent } = found
    if (signal.aborted) return mapAbortedResult(signal)
    if (agent.status !== "idle") {
      return { status: "failed", error: "DSH 会话正在处理其他消息，请稍后继续。" }
    }

    if (executor.model) {
      await applyDshModel(ctx, agent, executor.model, signal)
    }

    const interrupted = new Set(interruptedRequests)
    for (const message of [...agent.inbox.nextTurn, ...agent.inbox.nextStep]) {
      if (message.source.kind === "user" && interrupted.has(message.source.rpcId)) {
        agent.inbox.remove(message.id)
      }
    }

    let currentTurn
    let ownedTurn
    let ended = false
    let result
    let settle
    const toolNames = new Map()
    const completed = new Promise(resolve => { settle = resolve })

    const isOwnedMessage = message => message?.source?.kind === "user" && message.source.rpcId === requestId
    const findPending = () => [...agent.inbox.nextTurn, ...agent.inbox.nextStep].find(isOwnedMessage)

    stopHandler = () => {
      if (ended) return
      const item = findPending()
      if (item && agent.inbox.remove(item.id)) {
        ended = true
        settle()
      } else if (currentTurn !== undefined && ownedTurn === currentTurn) {
        sessionController.cancel({ sessionId })
      }
    }

    disposeEvents = ctx.on("session/event", (subject, event) => {
      if (subject !== agent.session || ended) return
      const { type, data } = event
      if (type === "turn/start") {
        currentTurn = data.turn
        if (isOwnedMessage(agent.inbox.nextTurn[0])) ownedTurn = currentTurn
      } else if (type === "user/message" && isOwnedMessage(data)) {
        ownedTurn = currentTurn
        onEvent("status", "DSH 已接收任务")
      } else if (type === "assistant/message" && ownedTurn === data.turn) {
        const text = data.message.content.filter(part => part.type === "text").map(part => part.text).join("")
        if (text) {
          output = text.slice(0, 16000)
          onEvent("output", text)
        }
      } else if (type === "tool/call" && ownedTurn === data.turn) {
        toolNames.set(data.callId, data.name)
        onEvent("tool", [data.name, data.arguments].filter(Boolean).join("\n"))
      } else if (type === "tool/result" && ownedTurn === data.turn) {
        const message = data.message
        const name = toolNames.get(message?.toolCallId) ?? "工具"
        const blocks = message?.content ?? []
        const text = blocks.filter(part => part.type === "text").map(part => part.text).join("\n")
        const other = blocks.some(part => part.type !== "text") ? "包含非文本结果，可在 DSH 原生会话中查看。" : ""
        const failed = Boolean(data.error || message?.isError)
        onEvent(failed ? "error" : "tool_result", [
          `${name} ${failed ? "失败" : "完成"}`,
          data.error?.reason ?? data.error?.code,
          text,
          other,
        ].filter(Boolean).join("\n"))
        toolNames.delete(message?.toolCallId)
      } else if (type === "turn/end" && ownedTurn === data.turn) {
        ended = true
        result = mapTurnResult(data.reason, output)
        settle()
      }
    })

    disposePreview = followDshPreview(ctx, agent, turn => !ended && ownedTurn === turn, onPreview)
    signal.addEventListener("abort", stopHandler, { once: true })

    await sessionController.prompt({
      sessionId,
      requestId,
      mode: "queue",
      content: [{ type: "text", text: prompt }],
    }, signal)

    if (signal.aborted) stopHandler()
    await Promise.race([completed, agent.whenIdle()])

    const orphaned = !ended && findPending()
    if (orphaned) agent.inbox.remove(orphaned.id)
    await sessions.flush(agent.session)

    if (signal.aborted && result?.status !== "succeeded") {
      return { ...mapAbortedResult(signal), output }
    }
    return result ?? { status: "failed", output, error: "DSH 会话已空闲，未收到这次请求的完成记录。" }
  } catch (error) {
    if (signal.aborted) return { ...mapAbortedResult(signal), output }
    return { status: "failed", output, error: error.message ?? "DSH 运行失败。" }
  } finally {
    clearTimeout(deadline)
    if (stopHandler) signal.removeEventListener("abort", stopHandler)
    disposePreview?.()
    disposeEvents?.()
  }
}
