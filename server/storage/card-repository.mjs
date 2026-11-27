export function createCardRepository(db) {
  const selectOne = db.prepare("SELECT data FROM cards WHERE id = ?")
  const selectAll = db.prepare("SELECT id, data FROM cards ORDER BY created, rowid")
  const upsertOne = db.prepare(`INSERT INTO cards (id, created, data) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data WHERE cards.data <> excluded.data`)
  const deleteOne = db.prepare("DELETE FROM cards WHERE id = ?")
  const selectRuns = db.prepare("SELECT data FROM board_runs WHERE card_id = ? ORDER BY ordinal DESC")
  const saveRun = db.prepare(`INSERT INTO board_runs (id, card_id, ordinal, data) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data WHERE board_runs.data <> excluded.data`)
  const removeRuns = db.prepare("DELETE FROM board_runs WHERE card_id = ?")
  const revisions = db.prepare("SELECT revision FROM board_revision")
  const changed = db.prepare(`SELECT c.id, c.data, changes.card_id AS cardId FROM board_card_changes AS changes
    LEFT JOIN cards AS c ON c.id = changes.card_id WHERE changes.revision > ? ORDER BY c.created, c.rowid`)

  function hydrate(id, data) {
    return { ...JSON.parse(data), runs: selectRuns.all(id).map(row => JSON.parse(row.data)) }
  }

  return {
    get(id) {
      const row = selectOne.get(id)
      return row ? hydrate(id, row.data) : null
    },
    list({ metadata = false } = {}) {
      return selectAll.all().map(row => metadata ? JSON.parse(row.data) : hydrate(row.id, row.data))
    },
    revision: () => revisions.get().revision,
    changes(after) {
      const rows = changed.all(after)
      return {
        cards: rows.filter(row => row.id).map(row => hydrate(row.id, row.data)),
        removed: rows.filter(row => !row.id).map(row => row.cardId),
      }
    },
    save(card) {
      const { runs, ...metadata } = card
      upsertOne.run(card.id, card.created, JSON.stringify(metadata))
      // Settled records are immutable. Save the newest record and legacy snapshots only on recovery.
      for (let index = 0; index < Math.min(runs.length, 1); index++) {
        const run = runs[index]
        saveRun.run(run.id, card.id, runs.length - index, JSON.stringify(run))
      }
    },
    saveHistory(card) {
      for (const [index, run] of card.runs.entries()) {
        saveRun.run(run.id, card.id, card.runs.length - index, JSON.stringify(run))
      }
    },
    remove(id) {
      removeRuns.run(id)
      deleteOne.run(id)
    },
  }
}
