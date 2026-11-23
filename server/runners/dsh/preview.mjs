// Subscribes to transient DSH assistant text deltas scoped strictly to one agent + turn.
export function followDshPreview(ctx, agent, ownsTurn, onPreview) {
  let attemptId
  let text = ""

  return ctx.on("agent/assistant-stream", ({ agent: source, frame }) => {
    if (source !== agent) return
    if (frame.type === "start") {
      if (!ownsTurn(frame.turn)) return
      attemptId = frame.attemptId
      text = ""
      onPreview("")
    } else if (frame.attemptId === attemptId && frame.type === "end") {
      attemptId = undefined
      onPreview("")
    } else if (frame.attemptId === attemptId && frame.type === "chunk" && frame.chunk.type === "text-delta") {
      text = (text + frame.chunk.text).slice(0, 16000)
      onPreview(text)
    }
  })
}
