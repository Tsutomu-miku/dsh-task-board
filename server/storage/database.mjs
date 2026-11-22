import { DatabaseSync } from "node:sqlite"

export function openDatabase(filename) {
  // Keep the lifetime lock separate so ordinary board transactions can commit.
  const lease = new DatabaseSync(`${filename}.lock`)
  let db
  try {
    lease.exec("PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE")
    db = new DatabaseSync(filename)
    db.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS cards (id TEXT PRIMARY KEY, created INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS executors (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS board_settings (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), default_executor TEXT);
      INSERT OR IGNORE INTO board_settings VALUES (1, 'local-dsh');
      CREATE TABLE IF NOT EXISTS run_events (seq INTEGER PRIMARY KEY, run_id TEXT NOT NULL, at INTEGER NOT NULL, kind TEXT NOT NULL, message TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS run_events_by_run ON run_events (run_id, seq);`)
  } catch (error) {
    db?.close()
    lease.close()
    throw error
  }
  return {
    db,
    atomic(operation) {
      db.exec("BEGIN IMMEDIATE")
      try {
        const result = operation()
        db.exec("COMMIT")
        return result
      } catch (error) {
        db.exec("ROLLBACK")
        throw error
      }
    },
    close() {
      try { db.close() } finally { lease.close() }
    },
  }
}
