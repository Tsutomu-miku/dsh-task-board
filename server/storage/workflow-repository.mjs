export function createWorkflowRepository(db) {
  const read = db.prepare("SELECT data FROM board_resources WHERE kind IN ('attachment', 'message_attachment') AND id = ?")
  const legacy = db.prepare("SELECT data FROM board_resources WHERE kind = 'attachment' AND scope = ? ORDER BY rowid")
  const readFile = db.prepare("SELECT body FROM board_files WHERE id = ?")
  const insert = db.prepare("INSERT INTO board_resources (kind, id, scope, data) VALUES ('message_attachment', ?, ?, ?)")
  const insertFile = db.prepare("INSERT INTO board_files (id, body) VALUES (?, ?)")
  const cardFiles = "scope = ? AND kind IN ('attachment', 'message_attachment')"
  const messageFiles = "scope = ? AND kind = 'message_attachment' AND json_extract(data, '$.runId') = ?"
  const deleteFiles = predicate => db.prepare(`DELETE FROM board_files WHERE id IN (SELECT id FROM board_resources WHERE ${predicate})`)
  const deleteRecords = predicate => db.prepare(`DELETE FROM board_resources WHERE ${predicate}`)
  const deleteCardFiles = deleteFiles(cardFiles)
  const deleteCardRecords = deleteRecords(cardFiles)
  const deleteMessageFiles = deleteFiles(messageFiles)
  const deleteMessageRecords = deleteRecords(messageFiles)

  return {
    getAttachment(id) {
      const row = read.get(id)
      return row ? JSON.parse(row.data) : null
    },
    addMessageFiles(cardId, runId, files) {
      return files.map(({ bytes, ...metadata }) => {
        insert.run(metadata.id, cardId, JSON.stringify({ ...metadata, runId }))
        insertFile.run(metadata.id, bytes)
        return metadata
      })
    },
    attachments(cardId) { return legacy.all(cardId).map(row => JSON.parse(row.data)) },
    removeCardFiles(cardId) { deleteCardFiles.run(cardId); deleteCardRecords.run(cardId) },
    removeMessageFiles(cardId, runId) { deleteMessageFiles.run(cardId, runId); deleteMessageRecords.run(cardId, runId) },
    file(id) { return readFile.get(id)?.body },
  }
}
