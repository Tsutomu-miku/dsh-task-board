#!/usr/bin/env node
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { setTimeout as delay } from "node:timers/promises"
import { parseArgs } from "node:util"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { BOARD_CONTEXT_TOOLS, createBoardContext } from "../domain/board-context.mjs"
import { BOARD_RUN_TOOLS } from "../domain/collaboration.mjs"
import { boardDatabasePath } from "../storage/board-path.mjs"
import { createReplyRepository } from "../storage/reply-repository.mjs"
import { createToolCommands, createWorkflowRepository } from "../storage/workflow-repository.mjs"

const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"))
const { values } = parseArgs({ options: { "profile-dir": { type: "string" }, "run-access": { type: "boolean" } } })
const profileDir = values["profile-dir"] ?? join(process.env.DSH_HOME || join(homedir(), ".dsh"), "profiles", "web")
const filename = boardDatabasePath(profileDir)
const token = values["run-access"] ? process.env.DSH_TASK_BOARD_RUN_ACCESS : undefined
delete process.env.DSH_TASK_BOARD_RUN_ACCESS
const database = new DatabaseSync(filename, { readOnly: !token })
database.exec("PRAGMA busy_timeout = 2000")
const context = createBoardContext(database, createReplyRepository(database))
if (token) createWorkflowRepository(database).runForToken(token)
const commands = token ? createToolCommands(database) : null
const server = new Server({ name: manifest.name, version: manifest.version }, { capabilities: { tools: {} } })
const closed = new AbortController()
server.onclose = () => { closed.abort(); database.close() }

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: [
    ...BOARD_CONTEXT_TOOLS.map(tool => ({ ...tool, annotations: { readOnlyHint: true, openWorldHint: false } })),
    ...(commands ? BOARD_RUN_TOOLS.map(tool => ({
      ...tool, annotations: { readOnlyHint: tool.name === "board_read_project", openWorldHint: false },
    })) : []),
  ],
}))

async function invoke(name, args, signal) {
  if (!commands || !BOARD_RUN_TOOLS.some(tool => tool.name === name)) return context.call(name, args)
  const id = commands.submit(token, name, args ?? {})
  const deadline = AbortSignal.any([signal, closed.signal, AbortSignal.timeout(10_000)])
  try {
    while (!deadline.aborted) {
      const result = commands.result(id)
      if (result?.error) throw new Error(result.error)
      if (result) return result.value
      await delay(100, undefined, { signal: deadline })
    }
    throw new Error("Board host did not respond.")
  } finally {
    if (!closed.signal.aborted) commands.remove(id)
  }
}

server.setRequestHandler(CallToolRequestSchema, async ({ params }, { signal }) => {
  try {
    const value = await invoke(params.name, params.arguments, signal)
    return { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value }
  } catch (error) {
    return { isError: true, content: [{ type: "text", text: error.message }] }
  }
})
await server.connect(new StdioServerTransport())
