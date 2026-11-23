import { BoardError, requireText } from "../errors.mjs"

export function normalizeModel(value, engine) {
  if (value == null) return null
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new BoardError(400, "请选择有效的模型。")
  }
  return {
    id: requireText(value.id, 180, "模型"),
    ...(engine === "dsh" ? { provider: requireText(value.provider, 120, "DSH 模型提供商") } : {}),
    ...(value.effort == null ? {} : { effort: requireText(value.effort, 80, "推理强度") }),
  }
}

export function sameModel(left, right) {
  return left?.id === right?.id && left?.provider === right?.provider && left?.effort === right?.effort
}

export function validateModel(selection, models) {
  if (!selection) return
  const match = models.find(model => model.id === selection.id && model.provider === selection.provider)
  if (!match) {
    throw new BoardError(400, "这个模型当前不可用，请刷新目录后重新选择。")
  }
  if (selection.effort && !match.efforts.some(effort => effort.id === selection.effort)) {
    throw new BoardError(400, "这个模型当前不支持所选推理强度。")
  }
}
