const MAX_EVENT_MESSAGE_LENGTH = 16000

export function createEventRepository(db) {
  const insertOne = db.prepare(
    "INSERT INTO run_events (run_id, at, kind, message) VALUES (?, ?, ?, ?)"
  )
  const selectByRun = db.prepare(
    "SELECT seq, at, kind, message FROM run_events WHERE run_id = ? AND seq > ? ORDER BY seq"
  )
  const columns = "seq, at, kind, message"
  const latest = db.prepare(`SELECT ${columns} FROM run_events WHERE run_id = ? ORDER BY seq DESC LIMIT ?`)
  const older = db.prepare(`SELECT ${columns} FROM run_events WHERE run_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?`)
  const newer = db.prepare(`SELECT ${columns} FROM run_events WHERE run_id = ? AND seq > ? ORDER BY seq DESC LIMIT ?`)
  const command = db.prepare("SELECT substr(message, 1, 400) AS message FROM run_events WHERE run_id = ? AND kind = 'command' ORDER BY seq DESC LIMIT 1")
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
    activity(runId, { before, after, limit }) {
      const latestCommand = command.get(runId)?.message ?? null
      if (limit === 0) return { events: [], hasMore: false, latestCommand }
      const take = limit + 1
      const rows = before !== undefined ? older.all(runId, before, take)
        : after !== undefined ? newer.all(runId, after, take)
        : latest.all(runId, take)
      return { events: rows.slice(0, limit).reverse(), hasMore: rows.length > limit, latestCommand }
    },
    removeByRuns(runIds) {
      for (const runId of runIds) {
        deleteByRun.run(runId)
      }
    },
  }
}
