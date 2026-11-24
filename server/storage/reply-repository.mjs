const MAX_REPLY_LENGTH = 16000

export function createReplyRepository(db) {
  const insertOne = db.prepare("INSERT INTO assistant_replies (card_id, run_id, text) VALUES (?, ?, ?)")
  const columns = "id, run_id AS runId, text"
  const selectByCard = db.prepare(`SELECT ${columns} FROM assistant_replies WHERE card_id = ? AND id > ? ORDER BY id`)
  const newer = db.prepare(`SELECT ${columns} FROM assistant_replies WHERE card_id = ? AND id > ? ORDER BY id LIMIT ?`)
  const older = db.prepare(`SELECT ${columns} FROM assistant_replies WHERE card_id = ? AND id < ? ORDER BY id DESC LIMIT ?`)
  const latest = db.prepare(`SELECT ${columns} FROM assistant_replies WHERE card_id = ? ORDER BY id DESC LIMIT ?`)
  const deleteByCard = db.prepare("DELETE FROM assistant_replies WHERE card_id = ?")

  return {
    add(cardId, runId, text) {
      insertOne.run(cardId, runId, String(text).slice(0, MAX_REPLY_LENGTH))
    },
    list(cardId, after = 0) {
      return selectByCard.all(cardId, after)
    },
    page(cardId, { before, after, limit, maxChars }) {
      const take = limit + 1
      const found = after !== undefined ? newer.all(cardId, after, take)
        : before !== undefined ? older.all(cardId, before, take)
        : latest.all(cardId, take)
      const rows = []
      let chars = 0
      for (const row of found) {
        if (rows.length === limit || (rows.length > 0 && chars + row.text.length > maxChars)) break
        rows.push(row)
        chars += row.text.length
      }
      const hasMore = found.length > rows.length
      if (after === undefined) rows.reverse()
      return { rows, hasMore, hasOlder: after === undefined && hasMore }
    },
    removeByCard(cardId) {
      deleteByCard.run(cardId)
    },
  }
}
