import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { test } from "node:test"
import { openBoard } from "../server/domain/board-service.mjs"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { fileURLToPath } from "node:url"

function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
}

async function fixture(t, config = {}) {
  const root = await mkdtemp(join(tmpdir(), "board-workflow-"))
  const profile = join(root, "profile")
  const data = join(profile, "task-board")
  const repo = join(root, "repo")
  await mkdir(data, { recursive: true })
  await mkdir(repo)
  git(repo, "init", "-b", "main")
  await writeFile(join(repo, "tracked.txt"), "baseline\n")
  git(repo, "add", ".")
  git(repo, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "Initial")
  const calls = []
  const options = {
    database: join(data, "board.sqlite"), workdir: repo,
    run(input) {
      return new Promise(done => {
        calls.push({ input, done })
        input.signal.addEventListener("abort", () => done({ status: "stopped" }), { once: true })
      })
    },
    ...config,
  }
  let board = openBoard(options)
  t.after(async () => {
    await board.close()
    await rm(root, { recursive: true, force: true })
  })
  return {
    root, repo, profile, calls,
    get board() { return board },
    create(title, fields = {}) { return board.act({ action: "create", title, prompt: `${title} brief`, ...fields }) },
    send(card, prompt = card.prompt) { return board.act({ action: "send", id: card.id, prompt }) },
    async finish(index, output = "OK") { calls[index].done({ status: "succeeded", output }); await delay(0) },
    async restart() { await board.close(); board = openBoard(options) },
  }
}

test("same-repository cards run in separate Git worktrees and preserve task brief and delivery across restart", async t => {
  const f = await fixture(t)
  const first = f.create("First")
  const second = f.create("Second")
  const revision = f.board.read().revision
  f.send(first, "Follow-up on first")
  f.send(second)
  assert.equal(f.calls.length, 2)
  const [a, b] = f.calls.map(call => call.input.workdir)
  assert.notEqual(a, b)
  assert.notEqual(a, f.repo)
  assert.equal(git(a, "branch", "--show-current"), `board/${first.id}`)
  await writeFile(join(a, "tracked.txt"), "first change\n")
  assert.equal(await readFile(join(b, "tracked.txt"), "utf8"), "baseline\n")
  assert.equal(await readFile(join(f.repo, "tracked.txt"), "utf8"), "baseline\n")
  await f.finish(0)
  await f.finish(1)
  const gitInfo = f.board.delivery(first.id).git
  assert.match(gitInfo.diff, /\+first change/)
  assert.ok(gitInfo.files.some(file => file.includes("tracked.txt")))
  f.board.act({ action: "update", id: first.id, from: "review", title: "Retitled" })
  await f.restart()
  const diff = f.board.read(revision)
  assert.equal(diff.delta, true)
  assert.equal(diff.cards.find(card => card.id === first.id).brief, "First brief")
  assert.equal(f.board.read(diff.revision).unchanged, true)
  f.send(first)
  assert.equal(f.calls[2].input.workdir, a)
  await f.finish(2)
  f.board.act({ action: "move", id: first.id, from: "review", status: "done" })
  f.board.act({ action: "archive", id: first.id, archived: true })
  assert.throws(() => f.send(first), /归档/)
  f.board.act({ action: "archive", id: first.id, archived: false })
  assert.ok(f.board.read().cards.some(card => card.id === first.id && !card.archived))
})

test("stage barriers dispatch after acceptance and reject stage-dependency cycles", async t => {
  const f = await fixture(t)
  const parent = f.create("Parent")
  const first = f.create("Stage one", { parentId: parent.id, stage: 1 })
  const second = f.create("Stage two", { parentId: parent.id, stage: 2 })
  assert.throws(() => f.board.act({ action: "update", id: first.id, blockedBy: [second.id] }), /循环/)
  f.send(second)
  f.send(first)
  assert.equal(f.calls.length, 1)
  await f.finish(0)
  assert.equal(f.calls.length, 1)
  f.board.act({ action: "move", id: first.id, from: "review", status: "done" })
  assert.equal(f.calls.length, 2)
  assert.equal(f.calls[1].input.cardId, second.id)
  await f.finish(1)
})

test("DSH tools are run-scoped, can mark blocked and delegate, and share threaded comments and project documents", async t => {
  const f = await fixture(t)
  const dsh = await f.board.act({ action: "save-executor", id: "local-dsh", name: "DSH", agentTools: true })
  const codex = await f.board.act({ action: "save-executor", id: "local-codex", name: "Codex", agentTools: true })
  const parent = f.create("Parent", { executorId: dsh.id, project: "Plugin" })
  const thread = f.board.act({ action: "post-comment", id: parent.id, text: "Initial review" })
  f.board.act({ action: "save-document", id: parent.id, title: "Shared", text: "Project notes" })
  const image = f.board.act({ action: "add-attachment", id: parent.id, name: "log.txt", mime: "text/plain", content: "YWJj" })
  assert.equal(Buffer.from(f.board.file(image.id).bytes).toString(), "abc")
  f.send(parent)
  assert.equal(f.calls[0].input.attachments[0].name, "log.txt")
  const agent = {}
  f.calls[0].input.boardAccess.bindDshAgent(agent)
  assert.throws(() => f.board.agentTool("board_read_project", {}, {}), /没有看板写权限/)
  const context = f.board.agentTool("board_read_project", {}, agent)
  assert.equal(context.documents[0].text, "Project notes")
  f.board.agentTool("board_post_comment", { parentId: thread.id, text: "Agent follow-up" }, agent)
  const handoff = f.board.agentTool("board_delegate", { title: "Review child", executorId: codex.id, prompt: "Review" }, agent)
  assert.equal(f.calls[1].input.cardId, handoff.cardId)
  assert.equal(f.board.read().cards.find(card => card.id === handoff.cardId).parentId, parent.id)
  f.board.agentTool("board_set_outcome", { status: "blocked", reason: "Await review confirmation" }, agent)
  await f.finish(0)
  await f.finish(1)
  assert.equal(f.board.read().cards.find(card => card.id === parent.id).blockedReason, "Await review confirmation")
  assert.equal(f.board.detail(parent.id).comments[1].parentId, thread.id)
  assert.ok(f.board.read().notifications.some(item => item.kind === "blocked"))
  assert.throws(() => f.board.agentTool("board_set_outcome", {}, agent), /没有看板写权限/)
})

test("Codex MCP performs a scoped write and the wakeup state survives restart", async t => {
  const f = await fixture(t)
  const task = f.create("MCP", { executorId: "local-codex" })
  f.send(task)
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../server/mcp/main.mjs", import.meta.url)), "--profile-dir", f.profile, "--run-access"],
    env: { DSH_TASK_BOARD_RUN_ACCESS: f.calls[0].input.boardAccess.token },
  })
  const connection = new Client({ name: "workflow-test", version: "1.0.0" })
  await connection.connect(transport)
  try {
    const result = await connection.callTool({
      name: "board_set_outcome", arguments: { status: "blocked", reason: "Wait for commit" },
    })
    assert.equal(result.isError, undefined)
    assert.equal(result.structuredContent.accepted, true)
  } finally {
    await connection.close()
  }
  await f.finish(0)
  assert.equal(f.board.read().cards[0].status, "blocked")
  f.board.act({ action: "save-wakeup", id: task.id, condition: "time", executorId: "local-codex",
    at: Date.now() - 1000, prompt: "Wake up" })
  await f.restart()
  await delay(1200)
  assert.equal(f.calls.length, 2)
  assert.match(f.calls[1].input.prompt, /Wake up/)
  assert.equal(f.board.detail(task.id).wakeups[0].enabled, false)
  await f.finish(1)
})

test("dispatch enforces reported token budgets", async t => {
  const f = await fixture(t, { maxTokens: 10 })
  const task = f.create("Budget")
  f.send(task)
  f.calls[0].input.onUsage(11)
  assert.equal(f.calls[0].input.signal.reason, "budget")
  await delay(0)
  assert.match(f.board.read().cards[0].runs[0].error, /Token/)
})
