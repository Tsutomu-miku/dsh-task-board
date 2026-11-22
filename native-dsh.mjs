function turnResult(reason, output) {
  if (reason.kind === "completed") return { status: "succeeded", output }
  if (reason.kind === "aborted") return { status: "stopped", output }
  if (reason.kind === "interrupted") return { status: "interrupted", output }
  const error = reason.error?.code === "MISSING_CREDENTIAL"
    ? "请在 DSH 的模型设置中配置当前模型的凭据。"
    : reason.error?.message ?? `DSH 运行结束（${reason.kind}）。`
  return { status: "failed", output, error }
}

function stopped(signal) {
  if (signal.reason === "timeout") return { status: "failed", error: "DSH 运行超过 30 分钟，已请求停止。" }
  return { status: signal.reason === "shutdown" ? "interrupted" : "stopped" }
}

export async function runDsh(ctx, { workdir, prompt, session, requestId, interruptedRequests, signal: caller, onSession }) {
  const timeout = new AbortController()
  const deadline = setTimeout(() => timeout.abort("timeout"), 30 * 60 * 1000)
  const signal = AbortSignal.any([caller, timeout.signal])
  const { sessionController, sessions } = ctx
  let dispose
  let stop
  let output = ""
  try {
    if (signal.aborted) return stopped(signal)
    const sessionId = session ?? (await sessionController.create({ cwd: workdir })).sessionId
    onSession(sessionId)
    if (signal.aborted) return stopped(signal)
    const found = await sessionController.resolveAgent(sessionId)
    if (!("agent" in found)) return { status: "failed", error: found.error?.message ?? "DSH 会话不可用。" }
    const { agent } = found
    if (signal.aborted) return stopped(signal)
    if (agent.status !== "idle") return { status: "failed", error: "DSH 会话正在处理其他消息，请稍后继续。" }
    const interrupted = new Set(interruptedRequests)
    for (const message of [...agent.inbox.nextTurn, ...agent.inbox.nextStep]) {
      if (message.source.kind === "user" && interrupted.has(message.source.rpcId)) agent.inbox.remove(message.id)
    }

    let currentTurn
    let ownedTurn
    let ended = false
    let result
    let settle
    const completed = new Promise(resolve => { settle = resolve })
    const owned = message => message?.source?.kind === "user" && message.source.rpcId === requestId
    const pending = () => [...agent.inbox.nextTurn, ...agent.inbox.nextStep].find(owned)
    stop = () => {
      if (ended) return
      const item = pending()
      if (item && agent.inbox.remove(item.id)) {
        ended = true
        settle()
      } else if (currentTurn !== undefined && ownedTurn === currentTurn) {
        sessionController.cancel({ sessionId })
      }
    }
    dispose = ctx.on("session/event", (subject, event) => {
      if (subject !== agent.session || ended) return
      const { type, data } = event
      if (type === "turn/start") {
        currentTurn = data.turn
        // The upcoming turn claims the first ordinary inbox item.
        if (owned(agent.inbox.nextTurn[0])) ownedTurn = currentTurn
      } else if (type === "user/message" && owned(data)) {
        ownedTurn = currentTurn
      } else if (type === "assistant/message" && ownedTurn === data.turn) {
        const text = data.message.content.filter(part => part.type === "text").map(part => part.text).join("")
        if (text) output = text.slice(0, 16000)
      } else if (type === "turn/end" && ownedTurn === data.turn) {
        ended = true
        result = turnResult(data.reason, output)
        settle()
      }
    })
    signal.addEventListener("abort", stop, { once: true })
    await sessionController.prompt({ sessionId, requestId, mode: "queue", content: [{ type: "text", text: prompt }] }, signal)
    if (signal.aborted) stop()
    await Promise.race([completed, agent.whenIdle()])
    const orphaned = !ended && pending()
    if (orphaned) agent.inbox.remove(orphaned.id)
    await sessions.flush(agent.session)
    if (signal.aborted && result?.status !== "succeeded") return { ...stopped(signal), output }
    return result ?? { status: "failed", output, error: "DSH 会话已空闲，未收到这次请求的完成记录。" }
  } catch (error) {
    if (signal.aborted) return { ...stopped(signal), output }
    return { status: "failed", output, error: error.message ?? "DSH 运行失败。" }
  } finally {
    clearTimeout(deadline)
    if (stop) signal.removeEventListener("abort", stop)
    dispose?.()
  }
}
