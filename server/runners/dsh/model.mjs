export async function applyDshModel(ctx, agent, model, signal) {
  if (!model) return
  const config = {
    provider: model.provider,
    model: model.id,
    ...(model.effort ? { reasoningEffort: model.effort } : {}),
  }
  const resolved = await ctx.llm.resolveCallConfig(config)
  signal.throwIfAborted()
  if (agent.status !== "idle") {
    throw new Error("DSH 会话正在处理其他消息，请稍后再换模型。")
  }

  const selection = {
    provider: resolved.provider,
    model: resolved.model,
    ...(model.effort && resolved.reasoningEffort ? { reasoningEffort: resolved.reasoningEffort } : {}),
  }
  if (typeof agent.model?.select === "function") {
    agent.model.select(selection)
    return
  }

  // Fallback for DSH 0.2.1-rc.5: apply session-local selection without mutating global default.
  const agents = ctx.sessionController.agents
  if (typeof agents?.selectForNextRequest !== "function") {
    throw new Error("这个 DSH 版本不支持看板的会话级模型选择。")
  }
  agents.selectForNextRequest(agent, selection)
}
