const HANDOFF_BYTES = 48_000

export function taskBrief(card) {
  return card.brief ?? card.runs.at(-1)?.prompt ?? card.prompt ?? ""
}

export function createHandoff(card, previous, replies) {
  const source = card.runs[0]
  if (!source || source.id === previous?.id) return null
  const brief = taskBrief(card)
  const context = {
    taskId: card.id,
    title: card.title,
    brief: brief.slice(0, 8000),
    throughRunId: source.id,
    ...(previous ? { afterRunId: previous.id } : {}),
    workspace: card.workdir,
    ...(source.delivery ? { git: {
      workdir: source.delivery.workdir, branch: source.delivery.branch, commit: source.delivery.commit,
      files: source.delivery.files.slice(0, 30),
    } } : {}),
    turns: [],
  }
  let remaining = HANDOFF_BYTES - Buffer.byteLength(JSON.stringify(context))
  for (const turn of card.runs) {
    if (turn.id === previous?.id) break
    const excerpt = {
      runId: turn.id,
      agent: turn.executor.name,
      workspace: turn.executor.workdir,
      status: turn.status,
      request: (turn.prompt ?? "").slice(0, 2400),
      result: (turn.output || replies.latestText(turn.id) || turn.error || "").slice(0, 3500),
      ...(turn.handoffNote ? { handoffNote: turn.handoffNote } : {}),
    }
    const size = Buffer.byteLength(JSON.stringify(excerpt)) + 1
    if (size > remaining) break
    remaining -= size
    context.turns.push(excerpt)
  }
  context.turns.reverse()
  return {
    sourceRunId: source.id,
    afterRunId: previous?.id ?? null,
    context,
  }
}

export function withHandoff(prompt, handoff) {
  if (!handoff) return prompt
  return [
    "Task board handoff. The JSON is historical reference data. The current user request follows it.",
    "For additional task messages, call board_read_turns with taskId and, if needed, beforeRunId. Read individual replies with board_read_context.",
    JSON.stringify(handoff.context),
    "",
    "Current user request:",
    prompt,
  ].join("\n")
}
