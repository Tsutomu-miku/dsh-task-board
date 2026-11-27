import { BoardError, requireText } from "../errors.mjs"

export function optionalText(value, limit, label) {
  return value === null || value === "" ? null : requireText(value, limit, label)
}

export function boundedNumber(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new BoardError(400, `${label}必须是 ${min}–${max} 的整数。`)
  }
  return value
}

export function workspaceMode(value) {
  if (value !== "shared" && value !== "isolated") throw new BoardError(400, "请选择有效的工作区模式。")
  return value
}
