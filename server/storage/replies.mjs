export function replyStore(db) {
  const insert = db.prepare("INSERT INTO assistant_replies (card_id, run_id, text) VALUES (?, ?, ?)")
  const read = db.prepare("SELECT id, run_id AS runId, text FROM assistant_replies WHERE card_id = ? ORDER BY id")
  return {
    add(cardId, runId, text) { insert.run(cardId, runId, String(text).slice(0, 16000)) },
    list(cardId) { return read.all(cardId) },
  }
}
