import { createHash, randomUUID } from "node:crypto"
import { BoardError } from "../errors.mjs"

const tokenHash = token => createHash("sha256").update(token).digest("hex")

export function createWorkflowRepository(db) {
  const read = db.prepare("SELECT data FROM board_resources WHERE kind = ? AND id = ?")
  const list = db.prepare("SELECT data FROM board_resources WHERE kind = ? AND scope = ? ORDER BY rowid DESC")
  const save = db.prepare(`INSERT INTO board_resources (kind, id, scope, data) VALUES (?, ?, ?, ?)
    ON CONFLICT(kind, id) DO UPDATE SET data = excluded.data`)
  const remove = db.prepare("DELETE FROM board_resources WHERE kind = ? AND id = ?")
  const readFile = db.prepare("SELECT body FROM board_files WHERE id = ?")
  const insertFile = db.prepare("INSERT INTO board_files (id, body) VALUES (?, ?)")
  const addCapability = db.prepare("INSERT INTO board_capabilities (run_id, token) VALUES (?, ?)")
  const removeCapability = db.prepare("DELETE FROM board_capabilities WHERE run_id = ?")
  const tokenExists = db.prepare("SELECT run_id FROM board_capabilities WHERE token = ?")

  return {
    save(kind, scope, record) {
      save.run(kind, record.id, scope, JSON.stringify(record))
      return record
    },
    get(kind, id) {
      const row = read.get(kind, id)
      return row ? JSON.parse(row.data) : null
    },
    list(kind, scope = "") {
      return list.all(kind, scope).map(row => JSON.parse(row.data))
    },
    remove(kind, id) { return remove.run(kind, id).changes !== 0 },
    removeScope(scope) {
      db.prepare("DELETE FROM board_files WHERE id IN (SELECT id FROM board_resources WHERE scope = ? AND kind = 'attachment')").run(scope)
      db.prepare("DELETE FROM board_resources WHERE scope = ? OR (kind IN ('notification', 'wakeup') AND json_extract(data, '$.cardId') = ?)").run(scope, scope)
    },
    file(id) { return readFile.get(id)?.body },
    addFile(id, body) { insertFile.run(id, body) },
    removeFile(id) { db.prepare("DELETE FROM board_files WHERE id = ?").run(id) },
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
    reset() {
      db.exec("DELETE FROM board_capabilities; DELETE FROM board_commands;")
    },
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
