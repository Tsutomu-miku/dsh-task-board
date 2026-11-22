export function cardStore(db) {
  const read = db.prepare("SELECT data FROM cards WHERE id = ?")
  const all = db.prepare("SELECT data FROM cards ORDER BY created, rowid")
  const upsert = db.prepare("INSERT INTO cards VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data")
  return {
    get(id) {
      const row = read.get(id)
      return row && JSON.parse(row.data)
    },
    list() { return all.all().map(row => JSON.parse(row.data)) },
    save(card) { upsert.run(card.id, card.created, JSON.stringify(card)) },
  }
}
