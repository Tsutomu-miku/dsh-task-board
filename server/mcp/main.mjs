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
import { boardDatabasePath } from "../storage/board-path.mjs"
import { createReplyRepository } from "../storage/reply-repository.mjs"

const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"))
const { values } = parseArgs({ options: { "profile-dir": { type: "string" } } })
const profileDir = values["profile-dir"] ?? join(process.env.DSH_HOME || join(homedir(), ".dsh"), "profiles", "web")
const database = new DatabaseSync(boardDatabasePath(profileDir), { readOnly: true })
const context = createBoardContext(database, createReplyRepository(database))
const server = new Server({ name: manifest.name, version: manifest.version }, { capabilities: { tools: {} } })
server.onclose = () => database.close()

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: BOARD_CONTEXT_TOOLS.map(tool => ({ ...tool, annotations: { readOnlyHint: true, openWorldHint: false } })),
}))
server.setRequestHandler(CallToolRequestSchema, ({ params }) => {
  try {
    const value = context.call(params.name, params.arguments)
    return { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value }
  } catch (error) {
    return { isError: true, content: [{ type: "text", text: error.message }] }
  }
})
await server.connect(new StdioServerTransport())
