import type { ModelChoice, ModelSelection } from "../types/board"

export const modelKey = (model: ModelSelection) => JSON.stringify([model.provider ?? null, model.id])

export function groupModels(models: ModelChoice[]) {
  const groups = new Map<string, ModelChoice[]>()
  for (const model of models) {
    const name = model.providerName ?? model.provider ?? ""
    const group = groups.get(name)
    if (group) group.push(model)
    else groups.set(name, [model])
  }
  return groups
}

const EFFORT_LABELS: Record<string, string> = {
  none: "关闭",
  minimal: "极低",
  low: "低",
  medium: "中",
  high: "高",
  xhigh: "很高",
  max: "最高",
  ultra: "超高",
}

export function effortLabel(effort: { id: string; name: string }, chinese: boolean) {
  return chinese ? EFFORT_LABELS[effort.id] ?? effort.name : effort.name
}
