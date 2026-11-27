export function createQueueRepository(db) {
  const insert = db.prepare("INSERT INTO queued_messages (id, card_id, priority, message) VALUES (?, ?, ?, ?)")
  const remove = db.prepare("DELETE FROM queued_messages WHERE id = ? AND card_id = ?")
  const removeCard = db.prepare("DELETE FROM queued_messages WHERE card_id = ?")
  const markFailed = db.prepare("UPDATE queued_messages SET error = ? WHERE id = ?")
  const order = "priority DESC, CASE WHEN priority = 0 THEN position ELSE -position END"
  const select = db.prepare(`SELECT message, error FROM queued_messages ORDER BY error IS NOT NULL, ${order}`)
  const next = db.prepare(`SELECT message FROM queued_messages WHERE error IS NULL ORDER BY ${order}`)
  const defaultMode = db.prepare("SELECT default_send_mode AS mode FROM board_dispatch_settings WHERE singleton = 1")
  const setDefaultMode = db.prepare("UPDATE board_dispatch_settings SET default_send_mode = ? WHERE singleton = 1")

  return {
    defaultMode() {
      return defaultMode.get().mode
    },
    setDefaultMode(mode) {
      setDefaultMode.run(mode)
    },
    add(message) {
      const priority = { queue: 0, priority: 1, takeover: 2 }[message.mode]
      insert.run(message.id, message.cardId, priority, JSON.stringify(message))
    },
    list() {
      return select.all().map(row => ({ ...JSON.parse(row.message), error: row.error }))
    },
    pending() {
      return next.all().map(row => JSON.parse(row.message))
    },
    remove(id, cardId) {
      return remove.run(id, cardId).changes !== 0
    },
    removeByCard(cardId) {
      removeCard.run(cardId)
    },
    fail(id, error) {
      markFailed.run(error, id)
    },
  }
}
