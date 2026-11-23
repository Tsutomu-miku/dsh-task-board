export const UUID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

export class BoardError extends Error {
  constructor(status, message) {
    super(message)
    this.name = "BoardError"
    this.status = status
  }
}

export function requireText(value, limit, label) {
  if (typeof value !== "string" || !value.trim() || value.length > limit) {
    throw new BoardError(400, `${label}需填写，且最多 ${limit} 个字符。`)
  }
  return value.trim()
}

export function assertPlainObject(value, message = "请求数据有误。") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BoardError(400, message)
  }
  return value
}

export function assertUuid(value, label) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new BoardError(400, `无效的${label}。`)
  }
  return value
}
