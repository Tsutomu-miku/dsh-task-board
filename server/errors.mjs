export class BoardError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function text(value, limit, label) {
  if (typeof value !== "string" || !value.trim() || value.length > limit) {
    throw new BoardError(400, `${label}需填写，且最多 ${limit} 个字符。`)
  }
  return value.trim()
}
