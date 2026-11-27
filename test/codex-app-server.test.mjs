import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { runCodexApp } from "../server/runners/codex/app-server.mjs"

const appServer = `#!/usr/bin/env node
const { createInterface } = require("node:readline")
const threadId = "6553cdfe-dc51-4abd-b48a-172b71fee577"
const turn = { id: "turn-1" }
const send = value => process.stdout.write(JSON.stringify(value) + "\\n")
const reply = (id, result) => send({ id, result })
const news = (method, params) => send({ method, params: { threadId, turnId: turn.id, ...params } })
let steered = false
let permitted = false
function finish() {
  if (!steered || !permitted) return
  news("item/agentMessage/delta", { itemId: "message-1", delta: "Applied " })
  news("item/completed", { item: { id: "message-1", type: "agentMessage", text: "Applied correction" } })
  news("thread/tokenUsage/updated", { tokenUsage: { total: { totalTokens: 50 } } })
  news("turn/completed", { turn: { ...turn, status: "completed" } })
}
createInterface({ input: process.stdin }).on("line", line => {
  const { id, method, params, result } = JSON.parse(line)
  if (method === "initialize") reply(id, {})
  if (method === "thread/start") reply(id, { thread: { id: threadId } })
  if (method === "turn/start") {
    reply(id, { turn })
    news("turn/started", { turn })
    send({ id: "request-1", method: "item/commandExecution/requestApproval", params: { threadId, turnId: turn.id, command: "git status" } })
  }
  if (method === "turn/steer") {
    steered = params.expectedTurnId === turn.id && params.input[0].text === "Check the diff"
    reply(id, { turnId: turn.id })
    finish()
  }
  if (id === "request-1" && result?.decision === "accept") { permitted = true; finish() }
})
`

test("Codex App Server accepts steering and explicit approval on the same turn", { timeout: 15000 }, async t => {
  const workdir = await mkdtemp(join(tmpdir(), "board-codex-app-"))
  t.after(() => rm(workdir, { force: true, recursive: true }))
  await writeFile(join(workdir, "codex"), appServer, { mode: 0o700 })
  const controller = new AbortController()
  const events = []
  const usage = []
  const sessions = []
  const previews = []
  const approvals = []
  let controls
  let resolveApproval
  const pending = new Promise(resolve => { resolveApproval = resolve })
  t.after(() => controller.abort("shutdown"))
  const result = runCodexApp({
    workdir, prompt: "Start", executor: { sandbox: "read-only", approvalPolicy: "on-request",
      env: { PATH: `${workdir}:${process.env.PATH}` } },
    tempDir: join(workdir, "tmp"),
    contextServer: { command: process.execPath, args: ["unused.mjs"] },
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
    onSession: id => sessions.push(id), onEvent: (kind, event) => events.push([kind, event]),
    onUsage: (tokens, scope) => usage.push([tokens, scope]), onPreview: preview => previews.push(preview),
    onControls: handlers => { controls = handlers }, onApproval: approval => {
      approvals.push(approval)
      if (approval) resolveApproval()
    },
  })
  await Promise.race([pending, result])
  assert.match(approvals[0]?.summary ?? "", /git status/)
  await controls.steer("Check the diff")
  controls.approve("accept")
  assert.deepEqual(await result, { status: "succeeded", output: "Applied correction", error: undefined })
  assert.equal(sessions.length, 1)
  assert.deepEqual(previews, ["Applied "])
  assert.deepEqual(usage, [[50, "session"]])
  assert.deepEqual(events.at(-1), ["output", "Applied correction"])
})
