import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { openBoard } from "../server/domain/board-service.mjs"

const advance = () => new Promise(resolve => setImmediate(resolve))

async function fixture(t) {
  const workdir = await mkdtemp(join(tmpdir(), "board-send-"))
  const calls = []
  const config = {
    workdir,
    database: join(workdir, "board.sqlite"),
    run(options) {
      return new Promise(done => {
        calls.push({ options, done })
        options.signal.addEventListener("abort", () => {
          if (options.signal.reason === "shutdown") done({ status: "interrupted" })
        }, { once: true })
      })
    },
  }
  let board = openBoard(config)
  t.after(async () => {
    await board.close()
    await rm(workdir, { force: true, recursive: true })
  })
  const task = board.act({ action: "create", title: "Plugin bug", prompt: "Original task", executorId: "local-codex" })
  return {
    get board() { return board },
    task,
    calls,
    send(prompt, overrides) {
      return board.act({ action: "send", id: task.id, prompt, ...overrides })
    },
    async finish(index, output) {
      calls[index].done({ status: "succeeded", output })
      await advance()
    },
    async restart() {
      await board.close()
      board = openBoard(config)
    },
  }
}

test("default send mode persists, pending messages can be canceled, and priority goes to the front without stopping a run", async t => {
  const f = await fixture(t)
  assert.equal(f.board.read().defaultSendMode, "queue")
  f.send("current")
  const regular = f.send("first queued")
  const canceled = f.send("cancel me")
  f.board.act({ action: "set-default-send-mode", mode: "priority" })
  const priority = f.send("next by default")
  const first = f.send("jump to front", { mode: "priority" })
  assert.throws(() => f.board.act({ action: "set-default-send-mode", mode: "takeover" }), /Invalid default/)
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0].options.signal.aborted, false)
  f.board.act({ action: "cancel-queued", id: f.task.id, messageId: canceled.id })
  assert.deepEqual(f.board.read().queue.map(item => item.id), [first.id, priority.id, regular.id])

  await f.finish(0)
  assert.equal(f.calls[1].options.requestId, first.id)
  await f.restart()
  assert.equal(f.board.read().defaultSendMode, "priority")
  assert.equal(f.calls[2].options.requestId, priority.id)
  await f.finish(2)
  assert.equal(f.calls[3].options.requestId, regular.id)
  assert.deepEqual(f.board.read().queue, [])
})

test("takeover waits for the active run to settle, transfers committed work, and resumes the right native session when switched back", async t => {
  const f = await fixture(t)
  const first = f.send("Find the root cause")
  const codexSession = "11111111-1111-4111-8111-111111111111"
  f.calls[0].options.onSession(codexSession)
  await f.finish(0, "Identified the root cause")

  const active = f.send("Continue investigating")
  assert.equal(f.calls[1].options.session, codexSession)
  assert.equal(f.calls[1].options.prompt, "Continue investigating")
  assert.throws(() => f.send("stale", { executorId: "local-dsh", mode: "takeover", runId: first.id }), /active run changed/i)
  const takeover = f.send("Apply the fix", { executorId: "local-dsh", mode: "takeover", runId: active.id })
  const followup = f.send("Verify the fix", { executorId: "local-codex", mode: "priority" })
  assert.equal(f.calls.length, 2)
  assert.equal(f.calls[1].options.signal.reason, "user")
  f.calls[1].options.onEvent("output", "Reproduced and recorded the exact failure")
  f.calls[1].done({ status: "stopped" })
  await advance()

  const dsh = f.calls[2].options
  assert.equal(dsh.requestId, takeover.id)
  assert.equal(dsh.engine, "dsh")
  assert.equal(dsh.session, null)
  assert.match(dsh.prompt, /Original task/)
  assert.match(dsh.prompt, /Reproduced and recorded the exact failure/)
  assert.ok(dsh.prompt.endsWith("Current user request:\nApply the fix"))
  dsh.onSession("dsh-session")
  await f.finish(2, "Fixed and tested")

  const back = f.calls[3].options
  assert.equal(back.requestId, followup.id)
  assert.equal(back.session, codexSession)
  assert.match(back.prompt, /Fixed and tested/)
  assert.doesNotMatch(back.prompt, /Identified the root cause/)

  const card = f.board.read().cards[0]
  assert.equal(card.executorId, "local-codex")
  assert.equal(card.brief, "Original task")
  assert.deepEqual(card.runs[0].handoff, {
    sourceRunId: takeover.id, afterRunId: first.id, includedRunIds: [active.id, takeover.id],
  })
  assert.equal(card.runs[0].prompt, "Verify the fix")
  const latest = f.board.context("board_read_turns", { taskId: f.task.id, limit: 2 })
  assert.deepEqual(latest.turns.map(turn => turn.request), ["Apply the fix", "Verify the fix"])
  const history = f.board.context("board_read_turns", { taskId: f.task.id, beforeRunId: latest.beforeRunId })
  assert.deepEqual(history.turns.map(turn => turn.request), ["Find the root cause", "Continue investigating"])
})

test("a queued message that cannot start remains visible and does not block later messages", async t => {
  const f = await fixture(t)
  f.send("current")
  const disabled = f.send("waiting for DSH", { executorId: "local-dsh" })
  const next = f.send("waiting for Codex")
  await f.board.act({ action: "toggle-executor", id: "local-dsh", enabled: false })
  await f.finish(0)
  assert.equal(f.calls[1].options.requestId, next.id)
  assert.equal(f.board.read().queue[0].id, disabled.id)
  assert.match(f.board.read().queue[0].error, /已停用/)
})
