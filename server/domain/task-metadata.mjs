import { assertUuid, BoardError, requireText } from "../errors.mjs"

export function optionalText(value, limit, label) {
  return value === null || value === "" ? null : requireText(value, limit, label)
}

export function boundedNumber(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new BoardError(400, `${label}必须是 ${min}–${max} 的整数。`)
  }
  return value
}

export function pullRequest(value) {
  const link = optionalText(value, 2048, "PR 链接")
  if (link === null) return null
  let url
  try { url = new URL(link) } catch { throw new BoardError(400, "PR 链接无效。") }
  if (url.origin !== "https://github.com" || url.username || url.password ||
      !/^\/[\w.-]+\/[\w.-]+\/pull\/[1-9]\d*\/?$/.test(url.pathname)) {
    throw new BoardError(400, "请填写 GitHub PR 的 HTTPS 链接。")
  }
  return url.origin + url.pathname.replace(/\/$/, "")
}

export function editTaskMetadata(card, input, list) {
  for (const [key, limit, label] of [
    ["project", 80, "项目"], ["blockedReason", 2000, "阻塞原因"],
  ]) {
    if (input[key] !== undefined) card[key] = optionalText(input[key], limit, label)
  }
  if (input.priority !== undefined) card.priority = boundedNumber(input.priority, 0, 4, "优先级")
  if (input.labels !== undefined) {
    if (!Array.isArray(input.labels) || input.labels.length > 20) throw new BoardError(400, "最多填写 20 个标签。")
    card.labels = [...new Set(input.labels.map(label => requireText(label, 40, "标签")))]
  }
  if (input.workspaceMode !== undefined) {
    if (!["shared", "isolated"].includes(input.workspaceMode)) throw new BoardError(400, "请选择有效的工作区模式。")
    card.workspaceMode = input.workspaceMode
  }
  if (input.prUrl !== undefined) {
    const link = pullRequest(input.prUrl)
    if (link !== card.prUrl) card.pullRequest = null
    card.prUrl = link
  }
  if (input.parentId === undefined && input.stage === undefined && input.blockedBy === undefined) return
  if (input.parentId !== undefined) card.parentId = input.parentId === null ? null : assertUuid(input.parentId, "父任务")
  if (input.stage !== undefined) card.stage = boundedNumber(input.stage, 0, 100, "阶段")
  if (!card.parentId && card.stage) throw new BoardError(400, "只有子任务可以设置阶段。")
  if (input.blockedBy !== undefined) {
    if (!Array.isArray(input.blockedBy) || input.blockedBy.length > 50) throw new BoardError(400, "最多填写 50 个依赖。")
    card.blockedBy = [...new Set(input.blockedBy.map(id => assertUuid(id, "依赖任务")))]
  }

  const graph = new Map(list().map(item => [item.id, item]))
  graph.set(card.id, card)
  function assertAcyclic(edges) {
    const visiting = new Set()
    const done = new Set()
    function visit(id) {
      if (done.has(id)) return
      if (visiting.has(id)) throw new BoardError(409, "父子关系、阶段或依赖形成循环。")
      const task = graph.get(id)
      if (!task) throw new BoardError(404, "找不到父任务或依赖任务。")
      visiting.add(id)
      for (const edge of edges(task)) visit(edge)
      visiting.delete(id)
      done.add(id)
    }
    for (const id of graph.keys()) visit(id)
  }
  assertAcyclic(task => task.parentId ? [task.parentId] : [])
  assertAcyclic(task => [...(task.blockedBy ?? []), ...stagePredecessors(task, graph.values()).map(item => item.id)])
}

function stagePredecessors(card, all) {
  if (!card.parentId || !card.stage) return []
  return [...all].filter(item => item.parentId === card.parentId && (item.stage ?? 0) < card.stage)
}

export function waitingFor(card, all) {
  const deps = new Set(card.blockedBy ?? [])
  for (const item of stagePredecessors(card, all)) deps.add(item.id)
  return all.filter(item => deps.has(item.id) && item.status !== "done")
}
