export function runEventStore(db) {
  const insert = db.prepare("INSERT INTO run_events (run_id, at, kind, message) VALUES (?, ?, ?, ?)")
  const read = db.prepare("SELECT seq, at, kind, message FROM run_events WHERE run_id = ? ORDER BY seq DESC LIMIT 250")
  const prune = db.prepare(`DELETE FROM run_events WHERE run_id = ? AND seq < (
    SELECT seq FROM run_events WHERE run_id = ? ORDER BY seq DESC LIMIT 1 OFFSET 249)`)
  return {
    add(runId, kind, message) {
      insert.run(runId, Date.now(), kind, String(message ?? "").slice(0, 2000))
      prune.run(runId, runId)
    },
    list(runId) { return read.all(runId).reverse() },
  }
}
