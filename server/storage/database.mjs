import { DatabaseSync } from "node:sqlite"

const SCHEMA_SQL = `
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = FULL;

  PRAGMA busy_timeout = 2000;

  CREATE TABLE IF NOT EXISTS board_resources (
    kind TEXT NOT NULL, id TEXT NOT NULL, scope TEXT NOT NULL, data TEXT NOT NULL,
    PRIMARY KEY (kind, id)
  );
  CREATE INDEX IF NOT EXISTS board_resources_by_scope ON board_resources (kind, scope);
  CREATE TABLE IF NOT EXISTS board_files (id TEXT PRIMARY KEY, body BLOB NOT NULL);
  CREATE TABLE IF NOT EXISTS board_capabilities (run_id TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL);
  CREATE TABLE IF NOT EXISTS board_commands (
    id TEXT PRIMARY KEY, run_id TEXT NOT NULL, action TEXT NOT NULL, data TEXT NOT NULL, result TEXT
  );

  CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    created INTEGER NOT NULL,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS board_runs (
    id TEXT PRIMARY KEY, card_id TEXT NOT NULL, ordinal INTEGER NOT NULL, data TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS board_runs_order ON board_runs(card_id, ordinal);
  CREATE TABLE IF NOT EXISTS board_revision (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), revision INTEGER NOT NULL);
  INSERT OR IGNORE INTO board_revision VALUES (1, 1);
  CREATE TABLE IF NOT EXISTS board_card_changes (card_id TEXT PRIMARY KEY, revision INTEGER NOT NULL);

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

function installRevisionTriggers(db) {
  const tracked = {
    cards: "id", board_runs: "card_id", executors: null, board_settings: null,
    board_dispatch_settings: null, queued_messages: null, board_resources: null,
  }
  for (const [table, cardColumn] of Object.entries(tracked)) {
    for (const operation of ["INSERT", "UPDATE", "DELETE"]) {
      const row = operation === "DELETE" ? "OLD" : "NEW"
      const changes = cardColumn ? `
        INSERT INTO board_card_changes (card_id, revision)
        SELECT ${row}.${cardColumn}, revision FROM board_revision WHERE singleton = 1
        ON CONFLICT(card_id) DO UPDATE SET revision = excluded.revision;
      ` : ""
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS board_revision_${table}_${operation.toLowerCase()}
        AFTER ${operation} ON ${table} BEGIN
          UPDATE board_revision SET revision = revision + 1 WHERE singleton = 1;
          ${changes}
        END;
      `)
    }
  }
}

function migrateRuns(db) {
  db.exec("BEGIN IMMEDIATE")
  try {
    db.exec(`
      INSERT INTO board_runs (id, card_id, ordinal, data)
      SELECT json_extract(turn.value, '$.id'), cards.id,
        json_array_length(cards.data, '$.runs') - turn.key, turn.value
      FROM cards, json_each(cards.data, '$.runs') AS turn
      WHERE json_type(cards.data, '$.runs') = 'array';
      UPDATE cards SET data = json_remove(
        CASE WHEN json_extract(data, '$.brief') IS NULL THEN
          json_set(data, '$.brief', coalesce(json_extract(data, '$.runs[#-1].prompt'), json_extract(data, '$.prompt'), ''))
        ELSE data END, '$.runs'
      ) WHERE json_type(data, '$.runs') = 'array';
      COMMIT;
    `)
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
}

export function openDatabase(filename) {
  // Hold an exclusive lock on a sibling file so normal board transactions can commit
  // while still fencing concurrent DSH hosts against writing to the same profile DB.
  const lease = new DatabaseSync(`${filename}.lock`)
  let db
  try {
    lease.exec("PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE")
    db = new DatabaseSync(filename)
    db.exec(SCHEMA_SQL)
    installRevisionTriggers(db)
    migrateRuns(db)
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
