const MAX_EVENT_MESSAGE_LENGTH = 16000

export function createEventRepository(db) {
  const insertOne = db.prepare(
    "INSERT INTO run_events (run_id, at, kind, message) VALUES (?, ?, ?, ?)"
  )
  const selectByRun = db.prepare(
    "SELECT seq, at, kind, message FROM run_events WHERE run_id = ? AND seq > ? ORDER BY seq"
  )
  const deleteByRun = db.prepare("DELETE FROM run_events WHERE run_id = ?")

  return {
    add(runId, kind, message, at = Date.now()) {
      const text = String(message ?? "")
      insertOne.run(runId, at, kind, text.length > MAX_EVENT_MESSAGE_LENGTH
        ? `${text.slice(0, MAX_EVENT_MESSAGE_LENGTH)}\n…（单条事件过长，已截断）`
        : text)
    },
    list(runId, after = 0) {
      return selectByRun.all(runId, after)
    },
    removeByRuns(runIds) {
      for (const runId of runIds) {
        deleteByRun.run(runId)
      }
    },
  }
}
