import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { DatabaseSync } from "node:sqlite"
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
  const first = f.create("First", { workspaceMode: "isolated" })
  const second = f.create("Second", { workspaceMode: "isolated" })
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
  assert.deepEqual(gitInfo.files, ["tracked.txt"])
  assert.equal(gitInfo.fileCount, 1)
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

test("new tasks use the shared directory and ignore retired orchestration fields", async t => {
  const f = await fixture(t)
  const original = f.create("Existing")
  assert.equal(f.calls.length, 0)
  await writeFile(join(f.repo, "tracked.txt"), "existing edits\n")

  const first = f.create("First", { autoRun: true, executorId: "local-codex" })
  assert.equal(first.workspaceMode, "shared")
  assert.equal(first.status, "running")
  assert.equal(f.calls[0].input.workdir, f.repo)
  assert.equal(f.calls[0].input.prompt, "First brief")
  assert.equal(await readFile(join(f.calls[0].input.workdir, "tracked.txt"), "utf8"), "existing edits\n")

  const next = f.create("Next", { autoRun: true, blockedBy: [original.id], stage: 9, priority: 4 })
  assert.equal(next.status, "todo")
  assert.equal(next.blockedBy, undefined)
  const [queued] = f.board.read().queue
  assert.equal(queued.cardId, next.id)

  await f.restart()
  assert.equal(f.calls[1].input.requestId, queued.id)
  assert.equal(f.calls[1].input.prompt, "Next brief")
  assert.equal(f.board.read().cards.find(card => card.id === original.id).status, "todo")
  assert.deepEqual(f.board.read().queue, [])
  await f.finish(1)
})

test("DSH exposes scoped outcomes and delegates to an opted-in executor on the same card", async t => {
  const f = await fixture(t)
  const dsh = await f.board.act({ action: "save-executor", id: "local-dsh", name: "DSH", agentTools: true,
    instructions: "Review carefully." })
  const codex = await f.board.act({ action: "save-executor", id: "local-codex", name: "Codex", agentTools: true })
  const task = f.create("Work", { executorId: dsh.id })
  f.send(task)
  const agent = {}
  f.calls[0].input.boardAccess.bindDshAgent(agent)
  assert.equal(f.board.hasAgentAccess(agent, "board_delegate"), true)
  assert.equal(f.board.hasAgentAccess(agent, "board_read_project"), false)
  assert.throws(() => f.board.agentTool("board_set_outcome", {}, {}), /没有看板写权限/)
  assert.match(f.calls[0].input.rolePrompt, /Review carefully/)
  assert.match(f.calls[0].input.rolePrompt, /local-codex/)
  const handoff = f.board.agentTool("board_delegate", { executorId: codex.id, prompt: "Review" }, agent)
  assert.equal(handoff.cardId, task.id)
  assert.equal(f.calls.length, 1)
  f.board.agentTool("board_set_outcome", { status: "todo", reason: "Ready for reviewer" }, agent)
  await f.finish(0)
  assert.equal(f.calls[1].input.requestId, handoff.messageId)
  assert.match(f.calls[1].input.prompt, /Ready for reviewer/)
  assert.throws(() => f.board.agentTool("board_set_outcome", {}, agent), /没有看板写权限/)
  await f.finish(1)
})

test("historical attachments and removed executors survive without keeping their creation features", async t => {
  const f = await fixture(t)
  const task = f.create("Old card")
  const db = new DatabaseSync(join(f.profile, "task-board", "board.sqlite"))
  const old = { id: "old-command", engine: "command", name: "Old command", enabled: true }
  db.prepare("INSERT INTO executors VALUES (?, ?)").run(old.id, JSON.stringify(old))
  db.prepare("UPDATE board_settings SET default_executor = ?").run(old.id)
  db.prepare("INSERT INTO board_resources VALUES ('attachment', ?, ?, ?)").run("file", task.id, JSON.stringify({
    id: "file", cardId: task.id, name: "log.txt", size: 3, mime: "text/plain",
  }))
  db.prepare("INSERT INTO board_files VALUES (?, ?)").run("file", Buffer.from("abc"))
  db.prepare("UPDATE cards SET data = json_set(data, '$.executorId', ?, '$.engine', ?) WHERE id = ?").run(old.id, old.engine, task.id)
  db.close()

  await f.restart()
  assert.equal(f.board.read().cards[0].executorId, old.id)
  assert.equal(f.board.read().defaultExecutor, "local-dsh")
  assert.equal(f.board.read().executors.some(row => row.id === old.id), false)
  assert.equal(f.board.conversation(task.id).attachments[0].name, "log.txt")
  assert.equal(Buffer.from(f.board.file("file").bytes).toString(), "abc")
  assert.throws(() => f.send(task), /执行器不可用/)
  f.board.act({ action: "update", id: task.id, executorId: "local-codex" })
  f.send(task)
  assert.equal(f.calls[0].input.attachments[0].name, "log.txt")
  await f.finish(0)
})

test("Codex MCP advertises only allowed writes and preserves a blocked outcome across restart", async t => {
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
    const { tools } = await connection.listTools()
    assert.ok(tools.some(tool => tool.name === "board_set_outcome"))
    assert.equal(tools.some(tool => tool.name === "board_delegate"), false)
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
  await f.restart()
  assert.equal(f.board.read().cards[0].blockedReason, "Wait for commit")
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
