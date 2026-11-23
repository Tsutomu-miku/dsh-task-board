import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { openBoard } from "../server/domain/board-service.mjs"
import { followDshPreview } from "../server/runners/dsh/preview.mjs"

const tick = () => new Promise(resolve => setImmediate(resolve))

test("conversation keeps committed replies, isolates previews and resumes the same session after restart", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dsh-board-conversation-"))
  const calls = []
  const options = {
    database: join(dir, "board.sqlite"),
    workdir: dir,
    run(callbacks) {
      return new Promise(resolve => {
        calls.push({ callbacks, resolve })
        callbacks.signal.addEventListener("abort", () => resolve({ status: "interrupted" }), { once: true })
      })
    },
  }
  let board = openBoard(options)
  try {
    const active = board.act({ action: "create", title: "任务", prompt: "第一条" })
    const other = board.act({ action: "create", title: "另一任务", prompt: "另一条" })
    const attempt = board.act({ action: "run", id: active.id, from: "todo", prompt: "第一条" }).runs[0]
    calls[0].callbacks.onSession("session-original")
    calls[0].callbacks.onPreview("正在输")
    assert.deepEqual(board.conversation(active.id).preview, { runId: attempt.id, text: "正在输" })
    assert.deepEqual(board.conversation(other.id), { replies: [], preview: null })
    calls[0].callbacks.onEvent("output", "第一段回复")
    calls[0].callbacks.onEvent("tool", "tool-name")
    assert.equal(board.conversation(active.id).preview, null)
    calls[0].callbacks.onEvent("output", "第二段回复")
    calls[0].resolve({ status: "succeeded", output: "第二段回复" })
    await tick()
    await board.close()
    board = openBoard(options)
    assert.deepEqual(board.conversation(active.id).replies.map(row => row.text), ["第一段回复", "第二段回复"])
    assert.equal(board.read().cards[0].runs[0].prompt, "第一条")
    board.act({ action: "run", id: active.id, from: "review", prompt: "追问", resume: true })
    assert.equal(calls[1].callbacks.session, "session-original")
    assert.equal(board.read().cards[0].runs[0].prompt, "追问")
  } finally {
    await board.close()
    await rm(dir, { recursive: true, force: true })
  }
})

test("DSH previews accept attempt text only for the task's agent and turn", () => {
  const agent = {}
  const result = []
  let receive
  const ctx = { on(_name, callback) { receive = callback; return () => {} } }
  followDshPreview(ctx, agent, turn => turn === 2, text => result.push(text))
  const emit = (source, frame) => receive({ agent: source, frame })
  const start = (source, turn, attemptId) => emit(source, { type: "start", turn, attemptId })
  const chunk = (source, attemptId, type, text) => emit(source, { type: "chunk", attemptId, chunk: { type, text } })
  start({}, 2, "foreign")
  chunk({}, "foreign", "text-delta", "foreign message")
  start(agent, 1, "other-turn")
  chunk(agent, "other-turn", "text-delta", "other turn")
  start(agent, 2, "owned")
  chunk(agent, "owned", "reasoning-delta", "internal")
  chunk(agent, "owned", "text-delta", "par")
  chunk(agent, "owned", "text-delta", "tial")
  emit(agent, { type: "end", attemptId: "owned" })
  assert.deepEqual(result, ["", "par", "partial", ""])
})
