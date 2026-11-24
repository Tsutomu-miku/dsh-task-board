import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { openBoard } from "../server/domain/board-service.mjs"
import { boardDatabasePath } from "../server/storage/board-path.mjs"

const server = fileURLToPath(new URL("../server/mcp/main.mjs", import.meta.url))

test("two MCP clients can page through the same board while DSH writes replies", async () => {
  const profile = await mkdtemp(`${tmpdir()}/dsh-board-mcp-`)
  const database = boardDatabasePath(profile)
  await mkdir(dirname(database))
  let callbacks
  const board = openBoard({
    database,
    workdir: profile,
    async run(options) {
      callbacks = options
      return new Promise(resolve => options.signal.addEventListener("abort",
        () => resolve({ status: "interrupted" }), { once: true }))
    },
  })
  const clients = [new Client({ name: "first-agent", version: "1" }), new Client({ name: "second-agent", version: "1" })]
  try {
    await Promise.all(clients.map(client => client.connect(new StdioClientTransport({
      command: process.execPath,
      args: [server, "--profile-dir", profile],
    }))))
    const [first, second] = clients
    assert.deepEqual((await first.listTools()).tools.map(tool => [tool.name, tool.annotations.readOnlyHint]), [
      ["board_list_tasks", true], ["board_read_context", true],
    ])
    const task = board.act({ action: "create", title: "Shared work", prompt: "Implement the agreed plan" })
    board.act({ action: "create", title: "Another item", prompt: "Other task" })
    const run = board.act({ action: "run", id: task.id, from: "todo", prompt: task.prompt }).runs[0]
    const tools = {
      list: (client, args) => client.callTool({ name: "board_list_tasks", arguments: args }),
      context: (client, args) => client.callTool({ name: "board_read_context", arguments: { taskId: task.id, ...args } }),
    }

    const listPage = (await tools.list(first, { limit: 1 })).structuredContent
    assert.equal(listPage.tasks[0].title, "Another item")
    assert.equal(listPage.tasks[0].prompt, undefined)
    assert.equal((await tools.list(first, { before: listPage.nextCursor })).structuredContent.tasks[0].id, task.id)
    assert.equal((await tools.list(second, { status: "running", query: "SHARED" })).structuredContent.tasks[0].id, task.id)

    for (const text of ["first reply", "b".repeat(16000), "c".repeat(16000)]) callbacks.onEvent("output", text)
    const latest = (await tools.context(first, {})).structuredContent
    assert.equal(latest.task.prompt, task.prompt)
    assert.equal(latest.latestRun.id, run.id)
    assert.deepEqual(latest.replies.map(row => row.text.length), [16000])
    const earlier = (await tools.context(second, { beforeReply: latest.beforeReply })).structuredContent
    assert.deepEqual(earlier.replies.map(row => row.text.length), [11, 16000])

    callbacks.onEvent("output", "continue here")
    const incremental = (await tools.context(second, { afterReply: latest.afterReply })).structuredContent
    assert.deepEqual(incremental.replies.map(row => row.text), ["continue here"])
    const invalid = await tools.context(second, { beforeReply: 1, afterReply: 1 })
    assert.equal(invalid.isError, true)
    assert.equal((await tools.context(second, { limit: 100 })).isError, true)
  } finally {
    await Promise.allSettled(clients.map(client => client.close()))
    await board.close()
    await rm(profile, { recursive: true, force: true })
  }
})
