// The Harness publishes transient text before saving the final assistant message.
export function followDshPreview(ctx, agent, ownsTurn, onPreview) {
  let attempt
  let text = ""
  return ctx.on("agent/assistant-stream", ({ agent: source, frame }) => {
    if (source !== agent) return
    if (frame.type === "start") {
      if (!ownsTurn(frame.turn)) return
      attempt = frame.attemptId
      text = ""
      onPreview("")
    } else if (frame.attemptId === attempt && frame.type === "end") {
      attempt = undefined
      onPreview("")
    } else if (frame.attemptId === attempt && frame.type === "chunk" && frame.chunk.type === "text-delta") {
      text = (text + frame.chunk.text).slice(0, 16000)
      onPreview(text)
    }
  })
}
