import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { openBoard } from "../server/domain/board-service.mjs"
import { followDshPreview } from "../server/runners/dsh/preview.mjs"
import { runDsh } from "../server/runners/dsh/runner.mjs"

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
    const eventTime = Date.now()
    calls[0].callbacks.onEvent("output", "第一段回复", eventTime)
    calls[0].callbacks.onEvent("command", "pwd", eventTime)
    calls[0].callbacks.onEvent("tool", "tool-name", eventTime + 1)
    calls[0].callbacks.onUsage(110)
    calls[0].callbacks.onUsage(35)
    assert.deepEqual(board.read().cards[0].runs[0].usage, { tokens: 145, scope: "run" })
    assert.equal(board.conversation(active.id).preview, null)
    const before = board.events(attempt.id)
    assert.deepEqual(before.slice(-3).map(({ kind, at }) => [kind, at]), [
      ["output", eventTime], ["command", eventTime], ["tool", eventTime + 1],
    ])
    for (let i = 0; i < 260; i++) calls[0].callbacks.onEvent("tool_result", `result-${i}`)
    const updates = board.events(attempt.id, before[before.length - 1].seq)
    assert.deepEqual(board.activity(attempt.id, { limit: 0 }), { events: [], hasMore: false, latestCommand: "pwd" })
    const latest = board.activity(attempt.id, { limit: 20 })
    assert.equal(latest.hasMore, true)
    assert.deepEqual(latest.events.map(row => row.message), updates.slice(-20).map(row => row.message))
    const previous = board.activity(attempt.id, { limit: 20, before: latest.events[0].seq })
    assert.equal(previous.events.at(-1).seq + 1, latest.events[0].seq)
    const delta = board.activity(attempt.id, { limit: 20, after: updates[10].seq })
    assert.deepEqual(delta.events, latest.events)
    assert.equal(delta.hasMore, true)
    assert.equal(updates.length, 260)
    assert.deepEqual(updates.map(row => row.message), Array.from({ length: 260 }, (_, i) => `result-${i}`))
    const firstReply = board.conversation(active.id).replies[0]
    calls[0].callbacks.onEvent("output", "第二段回复")
    assert.deepEqual(board.conversation(active.id, firstReply.id).replies.map(row => row.text), ["第二段回复"])
    calls[0].resolve({ status: "succeeded", output: "第二段回复" })
    await tick()
    await board.close()
    board = openBoard(options)
    assert.equal(board.events(attempt.id).find(row => row.kind === "tool")?.message, "tool-name")
    assert.deepEqual(board.conversation(active.id).replies.map(row => row.text), ["第一段回复", "第二段回复"])
    assert.equal(board.read().cards[0].runs[0].prompt, "第一条")
    assert.deepEqual(board.read().cards[0].runs[0].usage, { tokens: 145, scope: "run" })
    board.act({ action: "run", id: active.id, from: "review", prompt: "追问", resume: true })
    assert.equal(calls[1].callbacks.session, "session-original")
    assert.equal(board.read().cards[0].runs[0].prompt, "追问")
    assert.equal(board.read().cards[0].runs[0].usage, undefined)
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

test("DSH reports shell commands and token usage only for the owned turn", async () => {
  const agent = { status: "idle", session: {}, inbox: { nextTurn: [], nextStep: [] }, whenIdle() {} }
  const events = []
  const usage = []
  const listeners = new Map()
  const ctx = {
    on(name, callback) {
      listeners.set(name, callback)
      return () => listeners.delete(name)
    },
    sessions: { async flush() {} },
    sessionController: {
      async resolveAgent() { return { agent } },
      async prompt() {
        let time = 1000
        const emit = (type, data) => listeners.get("session/event")(agent.session, { type, data, time: time++ })
        emit("turn/start", { turn: 3 })
        emit("user/message", { source: { kind: "user", rpcId: "owned" } })
        const shell = { name: "bash", arguments: '{"command":"pwd"}' }
        emit("tool/call", { ...shell, turn: 2, callId: "foreign" })
        emit("tool/call", { ...shell, turn: 3, callId: "shell" })
        emit("tool/call", { name: "bash", arguments: "{bad json", turn: 3, callId: "invalid" })
        emit("assistant/message", {
          turn: 3,
          message: { content: [] },
          usage: { inputTokens: 150, outputTokens: 20, cacheReadTokens: 50, cacheWriteTokens: 10 },
        })
        emit("assistant/message", {
          turn: 3,
          message: { content: [{ type: "text", text: "完成" }] },
          usage: { inputTokens: 120, outputTokens: 10, totalTokens: 130 },
        })
        emit("turn/end", { turn: 3, reason: { kind: "completed" } })
      },
    },
  }
  const result = await runDsh(ctx, {
    executor: {}, session: "session", requestId: "owned", interruptedRequests: [],
    signal: new AbortController().signal, onSession() {}, onPreview() {},
    onEvent: (...event) => events.push(event),
    onUsage: tokens => usage.push(tokens),
  })
  assert.deepEqual(result, { status: "succeeded", output: "完成" })
  assert.deepEqual(events, [
    ["status", "DSH 已接收任务", 1001],
    ["command", "pwd", 1003],
    ["tool", "bash\n{bad json", 1004],
    ["output", "完成", 1006],
  ])
  assert.deepEqual(usage, [230, 130])
})
