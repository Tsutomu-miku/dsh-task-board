#!/usr/bin/env node
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { parseArgs } from "node:util"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { BOARD_CONTEXT_TOOLS, createBoardContext } from "../domain/board-context.mjs"
import { BOARD_RUN_TOOLS } from "../domain/collaboration.mjs"
import { callRunCallback, RUN_PORT_ENV, RUN_TOKEN_ENV } from "../domain/run-callback.mjs"
import { boardDatabasePath } from "../storage/board-path.mjs"
import { createReplyRepository } from "../storage/reply-repository.mjs"

const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"))
const { values } = parseArgs({ options: { "profile-dir": { type: "string" }, "run-access": { type: "boolean" }, "allow-delegate": { type: "boolean" } } })
const profileDir = values["profile-dir"] ?? join(process.env.DSH_HOME || join(homedir(), ".dsh"), "profiles", "web")
const filename = boardDatabasePath(profileDir)
const token = values["run-access"] ? process.env[RUN_TOKEN_ENV] : undefined
const port = Number(process.env[RUN_PORT_ENV])
delete process.env[RUN_TOKEN_ENV]
delete process.env[RUN_PORT_ENV]
const canWrite = /^[a-f0-9]{64}$/.test(token ?? "") && Number.isInteger(port) && port > 0 && port <= 65535
const database = new DatabaseSync(filename, { readOnly: true })
database.exec("PRAGMA busy_timeout = 2000")
const context = createBoardContext(database, createReplyRepository(database))
const writeTools = canWrite ? BOARD_RUN_TOOLS.filter(tool => tool.name !== "board_delegate" || values["allow-delegate"]) : []
const server = new Server({ name: manifest.name, version: manifest.version }, { capabilities: { tools: {} } })
const closed = new AbortController()
server.onclose = () => { closed.abort(); database.close() }

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: [
    ...BOARD_CONTEXT_TOOLS.map(tool => ({ ...tool, annotations: { readOnlyHint: true, openWorldHint: false } })),
    ...writeTools.map(tool => ({ ...tool, annotations: { readOnlyHint: false, openWorldHint: false } })),
  ],
}))

function invoke(name, args, signal) {
  if (!writeTools.some(tool => tool.name === name)) return context.call(name, args)
  return callRunCallback(port, token, name, args ?? {}, AbortSignal.any([signal, closed.signal, AbortSignal.timeout(10_000)]))
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
