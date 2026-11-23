export function createCardRepository(db) {
  const selectOne = db.prepare("SELECT data FROM cards WHERE id = ?")
  const selectAll = db.prepare("SELECT data FROM cards ORDER BY created, rowid")
  const upsertOne = db.prepare(
    "INSERT INTO cards (id, created, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data"
  )
  const deleteOne = db.prepare("DELETE FROM cards WHERE id = ?")

  return {
    get(id) {
      const row = selectOne.get(id)
      return row ? JSON.parse(row.data) : null
    },
    list() {
      return selectAll.all().map(row => JSON.parse(row.data))
    },
    save(card) {
      upsertOne.run(card.id, card.created, JSON.stringify(card))
    },
    remove(id) {
      deleteOne.run(id)
    },
  }
}
