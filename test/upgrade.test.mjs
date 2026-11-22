import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { test } from "node:test"
import { openBoard } from "../server/board/service.mjs"

const tick = () => new Promise(resolve => setImmediate(resolve))

test("upgrading v0.2 preserves cards, sessions and output, and marks unfinished runs interrupted", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dsh-board-upgrade-"))
  const database = join(dir, "board.sqlite")
  const old = new DatabaseSync(database)
  old.exec("CREATE TABLE cards (id TEXT PRIMARY KEY, created INTEGER NOT NULL, data TEXT NOT NULL)")
  const write = old.prepare("INSERT INTO cards VALUES (?, ?, ?)")
  const completed = { id: "done", title: "Completed", engine: "codex", workdir: dir, status: "done", session: "saved-session", history: [],
    runs: [{ id: "completed", session: "saved-session", status: "succeeded", output: "old result" }] }
  const interrupted = { id: "active", title: "Active", engine: "dsh", workdir: dir, status: "running", session: "dsh-session", history: [],
    runs: [{ id: "crashed", session: "dsh-session", status: "running", output: "partial output" }] }
  for (const [index, card] of [completed, interrupted].entries()) {
    const created = Date.now() + index
    write.run(card.id, created, JSON.stringify({ ...card, created }))
  }
  old.close()
  let board
  try {
    const options = { database, workdir: dir, codexSandbox: "workspace-write" }
    board = openBoard(options)
    const state = board.read()
    assert.equal(state.cards[0].executorId, "local-codex")
    assert.equal(state.cards[0].runs[0].executor.sandbox, "workspace-write")
    assert.equal(state.cards[0].session, "saved-session")
    assert.equal(state.cards[0].runs[0].output, "old result")
    assert.equal(state.cards[1].executorId, "local-dsh")
    assert.equal(state.cards[1].status, "todo")
    assert.equal(state.cards[1].runs[0].status, "interrupted")
    assert.equal(state.cards[1].runs[0].output, "partial output")
    await board.close()
    board = openBoard(options)
    assert.equal(board.events("crashed").length, 1)
    assert.deepEqual(board.read(), state)
  } finally {
    await board?.close()
    await rm(dir, { recursive: true, force: true })
  }
})

test("named executors persist settings and run snapshots, including events and resume directory", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dsh-board-executors-"))
  const alternate = join(dir, "alternate")
  await mkdir(alternate)
  const calls = []
  const board = openBoard({ database: join(dir, "board.sqlite"), workdir: dir, run(options) {
    return new Promise(resolve => { calls.push({ options, resolve }) })
  } })
  try {
    const executor = await board.act({ action: "save-executor", engine: "codex", name: "Review", workdir: dir, sandbox: "workspace-write" })
    await board.act({ action: "set-default-executor", id: executor.id })
    const card = board.act({ action: "create", title: "Task", prompt: "Run" })
    assert.equal(card.executorId, executor.id)
    const first = board.act({ action: "run", id: card.id, from: "todo", prompt: "Run" }).runs[0]
    await assert.rejects(board.act({ action: "save-executor", id: executor.id, engine: "dsh", name: "Wrong engine" }), /类型固定/)
    calls[0].options.onSession("old-session")
    calls[0].options.onEvent("tool", "tool started")
    assert.equal(board.events(first.id).at(-1).message, "tool started")
    calls[0].resolve({ status: "succeeded", output: "complete" })
    await tick()
    await board.act({ action: "toggle-executor", id: executor.id, enabled: false })
    assert.notEqual(board.read().defaultExecutor, executor.id)
    assert.throws(() => board.act({ action: "run", id: card.id, from: "review", prompt: "Run" }), /已停用/)
    await board.act({ action: "save-executor", id: executor.id, engine: "codex", name: "Renamed", workdir: alternate, sandbox: "read-only" })
    await board.act({ action: "toggle-executor", id: executor.id, enabled: true })
    board.act({ action: "run", id: card.id, from: "review", prompt: "Resume", resume: true })
    try {
      assert.equal(calls[1].options.workdir, dir)
      assert.equal(calls[1].options.executor.sandbox, "read-only")
      assert.equal(calls[1].options.session, "old-session")
      assert.throws(() => board.act({ action: "stop", id: card.id, runId: first.id }), /已结束/)
    } finally { calls[1].resolve({ status: "succeeded" }) }
    await tick()
    assert.equal(board.read().cards[0].runs[1].executor.name, "Review")
    assert.equal(board.read().cards[0].runs[1].executor.sandbox, "workspace-write")
  } finally {
    for (const call of calls) call.resolve({ status: "stopped" })
    await board.close()
    await rm(dir, { recursive: true, force: true })
  }
})
