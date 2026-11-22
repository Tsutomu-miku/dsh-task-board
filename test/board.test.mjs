import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { openBoard } from "../board.mjs"
import { codexArgs } from "../runner.mjs"

const tick = () => new Promise(resolve => setImmediate(resolve))

test("profile storage fences other hosts and retains transitions, results and session identity", async () => {
  const dir = await mkdtemp(join(tmpdir(), "task-board-test-"))
  const config = { workdir: dir, database: join(dir, "board.sqlite") }
  const calls = []
  let board
  try {
    board = openBoard({ ...config, run(options) {
      return new Promise(done => {
        calls.push({ options, done })
        options.signal.addEventListener("abort", () => done({ status: "stopped" }), { once: true })
      })
    } })
    assert.throws(() => openBoard(config), /locked/)
    const create = engine => board.act({ action: "create", title: "测试", prompt: "运行检查", engine })
    const task = create("codex")
    const other = create("dsh")
    const act = (action, fields) => board.act({ action, id: task.id, ...fields })
    const read = () => board.read().cards[0]
    assert.equal(act("run", { from: "todo", prompt: "运行检查" }).status, "running")
    assert.throws(() => board.act({ action: "run", id: other.id, from: "todo", prompt: "检查" }), /已有任务/)
    assert.throws(() => act("move", { from: "todo", status: "done" }), /正在执行/)
    await tick()
    const session = "11111111-1111-4111-8111-111111111111"
    calls[0].options.onSession(session)
    assert.equal(read().session, session)
    calls[0].done({ status: "succeeded", output: "通过" })
    await tick()
    assert.equal(read().status, "review")
    assert.throws(() => act("move", { from: "todo", status: "done" }), /状态已更新/)
    act("run", { from: "review", prompt: "继续", resume: true })
    await tick()
    assert.equal(calls[1].options.session, session)
    act("stop")
    await tick()
    assert.equal(read().runs[0].status, "stopped")
    act("move", { from: "todo", status: "done" })
    await board.close()
    board = openBoard(config)
    assert.equal(read().status, "done")
    assert.equal(read().runs[1].output, "通过")
    assert.deepEqual(read().history.map(item => item.to), ["todo", "running", "review", "running", "todo", "done"])
  } finally {
    await board?.close()
    await rm(dir, { recursive: true, force: true })
  }
})

test("Codex arguments only resume the stored session", () => {
  const session = "11111111-1111-4111-8111-111111111111"
  assert.deepEqual(codexArgs(session, "read-only"), [
    "exec", "--json", "--sandbox", "read-only", "--skip-git-repo-check", "resume", "--json", session, "-",
  ])
  assert.throws(() => codexArgs("--last", "read-only"), /无效/)
})
