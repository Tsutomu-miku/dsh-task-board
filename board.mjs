import { randomUUID } from "node:crypto"
import { DatabaseSync } from "node:sqlite"

export class BoardError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function text(value, limit, label) {
  if (typeof value !== "string" || !value.trim() || value.length > limit) {
    throw new BoardError(400, `${label}需填写，且最多 ${limit} 个字符。`)
  }
  return value.trim()
}

const movable = new Set(["todo", "review", "done"])

export function openBoard({ database, workdir, run }) {
  // Keep ownership in a separate SQLite file so reads and writes on the board
  // can commit while a second host using the same profile is fenced out.
  const lease = new DatabaseSync(`${database}.lock`)
  let db
  try {
    lease.exec("PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE")
    db = new DatabaseSync(database)
    db.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS cards (id TEXT PRIMARY KEY, created INTEGER NOT NULL, data TEXT NOT NULL);`)
  } catch (error) {
    db?.close()
    lease.close()
    throw error
  }
  const read = db.prepare("SELECT data FROM cards WHERE id = ?")
  const all = db.prepare("SELECT data FROM cards ORDER BY created, rowid")
  const upsert = db.prepare("INSERT INTO cards VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data")
  const save = card => upsert.run(card.id, card.created, JSON.stringify(card))
  const list = () => all.all().map(row => JSON.parse(row.data))
  let active
  let closing = false

  function move(card, status, cause) {
    if (card.status !== status) {
      card.history.push({ from: card.status, to: status, cause, at: Date.now() })
      card.status = status
    }
    save(card)
    return card
  }

  try {
    for (const card of list()) {
      if (card.status !== "running") continue
      Object.assign(card.runs[0], { status: "interrupted", finished: Date.now(), error: "宿主退出，运行已中断。请检查执行结果后再继续。" })
      move(card, "todo", "interrupted")
    }
  } catch (error) {
    db.close()
    lease.close()
    throw error
  }

  function start(card, input) {
    if (active) throw new BoardError(409, "已有任务在运行，请等待或先停止它。")
    const prompt = text(input.prompt, 16000, "任务说明")
    if (input.resume && !card.session) throw new BoardError(400, "这张卡片还没有可继续的会话。")
    const previousSession = input.resume ? card.session : null
    const interruptedRequests = previousSession ? card.runs
      .filter(run => run.session === previousSession && run.status === "interrupted")
      .map(run => run.id) : []
    const latest = { id: randomUUID(), started: Date.now(), status: "running", prompt, output: "", error: null, session: previousSession }
    card.prompt = prompt
    card.runs.unshift(latest)
    move(card, "running", "run")
    const controller = new AbortController()
    const job = { cardId: card.id, controller, done: null }
    active = job
    job.done = Promise.resolve().then(() => run({
      engine: card.engine, workdir: card.workdir, prompt, session: previousSession, requestId: latest.id, signal: controller.signal,
      interruptedRequests,
      onSession(session) {
        latest.session = session
        card.session = session
        save(card)
      },
    })).catch(error => ({ status: "failed", error: error.message })).then(result => {
      Object.assign(latest, {
        status: result.status,
        output: String(result.output ?? "").slice(0, 16000),
        error: String(result.error ?? "").slice(0, 2000) || null,
        finished: Date.now(),
      })
      move(card, result.status === "succeeded" ? "review" : "todo", result.status)
    }).finally(() => { active = undefined })
    job.done.catch(error => console.error("dsh-task-board: unable to persist run outcome", error.code ?? error.name))
    return card
  }

  return {
    read() { return { workdir, cards: list() } },
    act(input) {
      if (closing) throw new BoardError(503, "看板正在关闭。")
      if (input.action === "create") {
        if (input.engine !== "dsh" && input.engine !== "codex") throw new BoardError(400, "请选择 DSH 或 Codex。")
        const created = Date.now()
        const card = {
          id: randomUUID(), title: text(input.title, 120, "标题"), prompt: text(input.prompt, 16000, "任务说明"),
          engine: input.engine, workdir, status: "todo", created, session: null, runs: [],
          history: [{ from: null, to: "todo", cause: "created", at: created }],
        }
        save(card)
        return card
      }
      const row = typeof input.id === "string" && read.get(input.id)
      if (!row) throw new BoardError(404, "找不到这张卡片。")
      const card = JSON.parse(row.data)
      if (input.action === "stop") {
        if (active?.cardId !== card.id) throw new BoardError(409, "这张卡片没有正在运行的任务。")
        active.controller.abort("user")
        return card
      }
      if (card.status === "running") throw new BoardError(409, "卡片正在执行。")
      if (input.from !== card.status) throw new BoardError(409, "卡片状态已更新，请刷新后重试。")
      if (input.action === "run") return start(card, input)
      if (input.action !== "move" || !movable.has(input.status)) throw new BoardError(400, "请选择有效的目标状态。")
      return move(card, input.status, "manual")
    },
    async close() {
      if (closing) return
      closing = true
      active?.controller.abort("shutdown")
      try { await active?.done } finally {
        db.close()
        lease.close()
      }
    },
  }
}
