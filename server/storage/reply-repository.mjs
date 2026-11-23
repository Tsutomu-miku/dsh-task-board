const MAX_REPLY_LENGTH = 16000

export function createReplyRepository(db) {
  const insertOne = db.prepare("INSERT INTO assistant_replies (card_id, run_id, text) VALUES (?, ?, ?)")
  const selectByCard = db.prepare("SELECT id, run_id AS runId, text FROM assistant_replies WHERE card_id = ? ORDER BY id")
  const deleteByCard = db.prepare("DELETE FROM assistant_replies WHERE card_id = ?")

  return {
    add(cardId, runId, text) {
      insertOne.run(cardId, runId, String(text).slice(0, MAX_REPLY_LENGTH))
    },
    list(cardId) {
      return selectByCard.all(cardId)
    },
    removeByCard(cardId) {
      deleteByCard.run(cardId)
    },
  }
}
