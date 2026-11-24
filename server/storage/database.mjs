import { DatabaseSync } from "node:sqlite"

const SCHEMA_SQL = `
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = FULL;

  CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    created INTEGER NOT NULL,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS executors (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS board_settings (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    default_executor TEXT
  );
  INSERT OR IGNORE INTO board_settings VALUES (1, 'local-dsh');

  CREATE TABLE IF NOT EXISTS board_dispatch_settings (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    default_send_mode TEXT NOT NULL DEFAULT 'queue' CHECK (default_send_mode IN ('queue', 'priority'))
  );
  INSERT OR IGNORE INTO board_dispatch_settings (singleton) VALUES (1);

  CREATE TABLE IF NOT EXISTS run_events (
    seq INTEGER PRIMARY KEY,
    run_id TEXT NOT NULL,
    at INTEGER NOT NULL,
    kind TEXT NOT NULL,
    message TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS run_events_by_run ON run_events (run_id, seq);
  CREATE INDEX IF NOT EXISTS run_commands_by_run ON run_events (run_id, seq) WHERE kind = 'command';

  CREATE TABLE IF NOT EXISTS assistant_replies (
    id INTEGER PRIMARY KEY,
    card_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    text TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS assistant_replies_by_card ON assistant_replies (card_id, id);
  CREATE INDEX IF NOT EXISTS assistant_replies_by_run ON assistant_replies (run_id, id);

  CREATE TABLE IF NOT EXISTS queued_messages (
    position INTEGER PRIMARY KEY,
    id TEXT NOT NULL UNIQUE,
    card_id TEXT NOT NULL,
    priority INTEGER NOT NULL,
    message TEXT NOT NULL,
    error TEXT
  );
  CREATE INDEX IF NOT EXISTS queued_messages_by_card ON queued_messages (card_id);
`

export function openDatabase(filename) {
  // Hold an exclusive lock on a sibling file so normal board transactions can commit
  // while still fencing concurrent DSH hosts against writing to the same profile DB.
  const lease = new DatabaseSync(`${filename}.lock`)
  let db
  try {
    lease.exec("PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE")
    db = new DatabaseSync(filename)
    db.exec(SCHEMA_SQL)
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
      try {
        db.close()
      } finally {
        lease.close()
      }
    },
  }
}
