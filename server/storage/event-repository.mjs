const MAX_EVENT_MESSAGE_LENGTH = 2000

export function createEventRepository(db) {
  const insertOne = db.prepare(
    "INSERT INTO run_events (run_id, at, kind, message) VALUES (?, ?, ?, ?)"
  )
  const selectByRun = db.prepare(
    "SELECT seq, at, kind, message FROM run_events WHERE run_id = ? ORDER BY seq DESC LIMIT 250"
  )
  const pruneOld = db.prepare(`
    DELETE FROM run_events
    WHERE run_id = ?
      AND seq < (
        SELECT seq FROM run_events
        WHERE run_id = ?
        ORDER BY seq DESC
        LIMIT 1 OFFSET 249
      )
  `)
  const deleteByRun = db.prepare("DELETE FROM run_events WHERE run_id = ?")

  return {
    add(runId, kind, message) {
      insertOne.run(runId, Date.now(), kind, String(message ?? "").slice(0, MAX_EVENT_MESSAGE_LENGTH))
      pruneOld.run(runId, runId)
    },
    list(runId) {
      return selectByRun.all(runId).reverse()
    },
    removeByRuns(runIds) {
      for (const runId of runIds) {
        deleteByRun.run(runId)
      }
    },
  }
}
