import { createHash, randomUUID } from "node:crypto"
import { BoardError } from "../errors.mjs"

const tokenHash = token => createHash("sha256").update(token).digest("hex")

export function createWorkflowRepository(db) {
  const read = db.prepare("SELECT data FROM board_resources WHERE kind = 'attachment' AND id = ?")
  const list = db.prepare("SELECT data FROM board_resources WHERE kind = 'attachment' AND scope = ? ORDER BY rowid")
  const readFile = db.prepare("SELECT body FROM board_files WHERE id = ?")
  const deleteFiles = db.prepare("DELETE FROM board_files WHERE id IN (SELECT id FROM board_resources WHERE scope = ? AND kind = 'attachment')")
  const deleteAttachments = db.prepare("DELETE FROM board_resources WHERE kind = 'attachment' AND scope = ?")
  const addCapability = db.prepare("INSERT INTO board_capabilities (run_id, token) VALUES (?, ?)")
  const removeCapability = db.prepare("DELETE FROM board_capabilities WHERE run_id = ?")
  const tokenExists = db.prepare("SELECT run_id FROM board_capabilities WHERE token = ?")

  return {
    getAttachment(id) {
      const row = read.get(id)
      return row ? JSON.parse(row.data) : null
    },
    attachments(cardId) { return list.all(cardId).map(row => JSON.parse(row.data)) },
    removeCardFiles(cardId) { deleteFiles.run(cardId); deleteAttachments.run(cardId) },
    file(id) { return readFile.get(id)?.body },
    authorize(runId) {
      const token = randomUUID() + randomUUID()
      addCapability.run(runId, tokenHash(token))
      return token
    },
    runForToken(token) {
      if (typeof token !== "string" || token.length !== 72) throw new BoardError(403, "该运行没有看板写权限。")
      const runId = tokenExists.get(tokenHash(token))?.run_id
      if (!runId) throw new BoardError(403, "看板授权已失效。")
      return runId
    },
    revoke(runId) { removeCapability.run(runId) },
    reset() { db.exec("DELETE FROM board_capabilities; DELETE FROM board_commands;") },
  }
}

export function createToolCommands(db) {
  const authorized = db.prepare("SELECT run_id FROM board_capabilities WHERE token = ?")
  const insert = db.prepare("INSERT INTO board_commands (id, run_id, action, data) VALUES (?, ?, ?, ?)")
  const list = db.prepare("SELECT id, run_id, action, data FROM board_commands WHERE result IS NULL ORDER BY rowid LIMIT 25")
  const finish = db.prepare("UPDATE board_commands SET result = ? WHERE id = ?")
  const result = db.prepare("SELECT result FROM board_commands WHERE id = ?")
  const remove = db.prepare("DELETE FROM board_commands WHERE id = ?")
  return {
    submit(token, action, input) {
      const run = typeof token === "string" && authorized.get(tokenHash(token))
      if (!run) throw new BoardError(403, "看板授权已失效。")
      const id = randomUUID()
      const data = JSON.stringify(input)
      if (data.length > 32_000) throw new BoardError(400, "工具参数过长。")
      insert.run(id, run.run_id, action, data)
      return id
    },
    pending: () => list.all(),
    finish(id, value) { finish.run(JSON.stringify(value), id) },
    result(id) {
      const row = result.get(id)
      return row?.result ? JSON.parse(row.result) : null
    },
    remove(id) { remove.run(id) },
  }
}
