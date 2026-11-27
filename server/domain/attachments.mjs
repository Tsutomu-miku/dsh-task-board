import { randomUUID } from "node:crypto"
import { assertPlainObject, BoardError } from "../errors.mjs"

export const MAX_FILE_COUNT = 4
export const MAX_FILE_BYTES = 4 * 1024 * 1024
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024

function imageMime(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png"
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return "image/jpeg"
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp"
  return null
}

export function parseMessageAttachments(input) {
  if (input === undefined) return []
  if (!Array.isArray(input) || input.length > MAX_FILE_COUNT) throw new BoardError(400, "每条消息最多可添加 4 个附件。")
  let total = 0
  return input.map(raw => {
    const { name, data } = assertPlainObject(raw)
    if (typeof name !== "string" || !name.trim() || name.length > 180 || /[/\\\u0000-\u001f\u007f]/u.test(name) ||
        typeof data !== "string" || !data || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
      throw new BoardError(400, "附件文件名或内容格式有误。")
    }
    if (data.length > Math.ceil(MAX_FILE_BYTES / 3) * 4) throw new BoardError(413, "单个附件不能超过 4 MB。")
    const bytes = Buffer.from(data, "base64")
    if (bytes.toString("base64") !== data) throw new BoardError(400, "附件内容格式有误。")
    total += bytes.length
    if (bytes.length > MAX_FILE_BYTES || total > MAX_ATTACHMENT_BYTES) throw new BoardError(413, "单个附件最多 4 MB，每条消息最多 8 MB。")
    const mime = imageMime(bytes)
    return { id: randomUUID(), name: name.trim().toWellFormed(), size: bytes.length, inline: Boolean(mime),
      mime: mime ?? "application/octet-stream", author: "user", bytes }
  })
}
