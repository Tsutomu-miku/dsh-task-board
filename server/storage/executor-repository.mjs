export function createExecutorRepository(db) {
  const selectAll = db.prepare("SELECT data FROM executors ORDER BY rowid")
  const selectOne = db.prepare("SELECT data FROM executors WHERE id = ?")
  const upsertOne = db.prepare(
    "INSERT INTO executors (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data"
  )
  const updateDefault = db.prepare("UPDATE board_settings SET default_executor = ? WHERE singleton = 1")
  const selectDefault = db.prepare("SELECT default_executor FROM board_settings WHERE singleton = 1")

  return {
    get(id) {
      const row = selectOne.get(id)
      return row ? JSON.parse(row.data) : null
    },
    list() {
      return selectAll.all().map(row => JSON.parse(row.data))
    },
    save(executor) {
      upsertOne.run(executor.id, JSON.stringify(executor))
    },
    defaultId() {
      return selectDefault.get()?.default_executor ?? null
    },
    setDefault(id) {
      updateDefault.run(id)
    },
  }
}
