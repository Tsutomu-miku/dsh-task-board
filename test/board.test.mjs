import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { openBoard } from "../server/domain/board-service.mjs"
import { codexArgs } from "../server/runners/codex/runner.mjs"

const tick = () => new Promise(resolve => setImmediate(resolve))

test("profile storage fences other hosts and retains transitions, results and session identity", async () => {
  const dir = await mkdtemp(join(tmpdir(), "task-board-test-"))
  const config = { workdir: dir, database: join(dir, "board.sqlite") }
  const calls = []
  let board
  try {
    board = openBoard({
      ...config,
      run(options) {
        return new Promise(done => {
          calls.push({ options, done })
          options.signal.addEventListener("abort", () => done({ status: "stopped" }), { once: true })
        })
      },
    })
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

test("cards support per-card workdir, editing metadata, and cascading deletion when idle", async () => {
  const dir = await mkdtemp(join(tmpdir(), "task-board-crud-"))
  const sub = join(dir, "sub-project")
  await mkdir(sub)
  const board = openBoard({
    database: join(dir, "board.sqlite"),
    workdir: dir,
    async run({ onSession, onEvent }) {
      onSession("session-dsh")
      onEvent("output", "已完成分析")
      return { status: "succeeded", output: "已完成分析" }
    },
  })

  try {
    const created = board.act({ action: "create", title: "初始标题", prompt: "初始说明", workdir: sub })
    assert.equal(created.workdir, sub)

    board.act({ action: "run", id: created.id, from: "todo", prompt: "初始说明" })
    await tick()
    const runId = board.read().cards[0].runs[0].id
    assert.equal(board.conversation(created.id).replies.length, 1)
    assert.ok(board.events(runId).length > 0)

    const updated = board.act({
      action: "update",
      id: created.id,
      from: "review",
      title: "更新后标题",
      prompt: "更新后说明",
      executorId: "local-codex",
      workdir: dir,
    })
    assert.equal(updated.title, "更新后标题")
    assert.equal(updated.engine, "codex")
    assert.equal(updated.session, null)
    assert.equal(updated.workdir, dir)

    board.act({ action: "delete", id: created.id, from: "review" })
    assert.equal(board.read().cards.length, 0)
    assert.equal(board.events(runId).length, 0)
    assert.throws(() => board.conversation(created.id), /找不到/)
  } finally {
    await board.close()
    await rm(dir, { recursive: true, force: true })
  }
})

test("Codex arguments only resume the stored session", () => {
  const session = "11111111-1111-4111-8111-111111111111"
  assert.deepEqual(codexArgs(session, "read-only"), [
    "exec", "--json", "--sandbox", "read-only", "--skip-git-repo-check", "resume", "--json", session, "-",
  ])
  assert.deepEqual(codexArgs(session, "danger-full-access"), [
    "exec", "--json", "--sandbox", "danger-full-access", "--skip-git-repo-check",
    "-c", 'approval_policy="never"', "resume", "--json", session, "-",
  ])
  assert.throws(() => codexArgs("--last", "read-only"), /无效/)
})
