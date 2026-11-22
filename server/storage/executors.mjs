export function executorStore(db) {
  const all = db.prepare("SELECT data FROM executors ORDER BY rowid")
  const find = db.prepare("SELECT data FROM executors WHERE id = ?")
  const save = db.prepare("INSERT INTO executors VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data")
  const metadata = db.prepare("UPDATE board_settings SET default_executor = ? WHERE singleton = 1")
  const preferred = db.prepare("SELECT default_executor FROM board_settings WHERE singleton = 1")
  return {
    get(id) {
      const row = find.get(id)
      return row && JSON.parse(row.data)
    },
    list() { return all.all().map(row => JSON.parse(row.data)) },
    save(executor) { save.run(executor.id, JSON.stringify(executor)) },
    defaultId() { return preferred.get().default_executor },
    setDefault(id) { metadata.run(id) },
  }
}
