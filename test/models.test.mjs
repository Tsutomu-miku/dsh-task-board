import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { EventEmitter } from "node:events"
import { PassThrough } from "node:stream"
import { test } from "node:test"
import { openBoard } from "../server/board/service.mjs"
import { readCodexModels } from "../server/runners/codex-models.mjs"
import { codexArgs } from "../server/runners/codex.mjs"
import { applyDshModel } from "../server/runners/dsh-model.mjs"

const tick = () => new Promise(done => setImmediate(done))

test("defaults, run overrides and resume keep separate model selections", async () => {
  const home = await mkdtemp(join(tmpdir(), "dsh-board-models-"))
  const select = id => ({ id, provider: "fixture" })
  const choices = ["first", "second"].map(id => ({ ...select(id), efforts: [{ id: "high" }] }))
  const selected = []
  const board = openBoard({ database: join(home, "board.sqlite"), workdir: home,
    models: async () => choices, async run({ executor, onSession }) {
      selected.push(executor.model)
      onSession("local-test-session")
      return { status: "succeeded" }
    } })
  try {
    await assert.rejects(board.act({ action: "save-executor", id: "local-dsh", name: "DSH", model: select("missing") }), /不可用/)
    const model = { ...select("first"), effort: "high" }
    await board.act({ action: "save-executor", id: "local-dsh", name: "DSH", model })
    const card = board.act({ action: "create", title: "test", prompt: "check" })
    board.act({ action: "run", id: card.id, from: "todo", prompt: "check", model: select("second") })
    await tick()
    board.act({ action: "run", id: card.id, from: "review", prompt: "check", resume: true })
    await tick()
    board.act({ action: "run", id: card.id, from: "review", prompt: "check" })
    await tick()
    assert.deepEqual(selected, [select("second"), select("second"), model])
    assert.deepEqual(board.read().executors.find(row => row.id === "local-dsh").model, model)
  } finally {
    await board.close()
    await rm(home, { recursive: true, force: true })
  }
})

test("Codex initializes, reads paginated visible models and closes its own stdio process", async () => {
  const child = new EventEmitter()
  child.stdin = new PassThrough()
  child.stdout = new PassThrough()
  child.kill = () => child.emit("close")
  child.stdin.on("end", () => child.emit("close"))
  const requests = []
  child.stdin.on("data", bytes => {
    const request = JSON.parse(String(bytes))
    requests.push(request.method)
    if (!request.id) return
    const result = request.method === "initialize" ? {} : (request.params.cursor ? { data: [{ model: "hidden", hidden: true }, { model: "second" }], nextCursor: null }
      : { data: [{ model: "first", displayName: "First", supportedReasoningEfforts: [{ reasoningEffort: "high" }] }], nextCursor: "page-2" })
    setImmediate(() => child.stdout.write(JSON.stringify({ id: request.id, result }) + "\n"))
  })
  const models = await readCodexModels("/workspace", () => child)
  assert.deepEqual(requests, ["initialize", "initialized", "model/list", "model/list"])
  assert.deepEqual(models.map(model => model.id), ["first", "second"])
  assert.deepEqual(models[0].efforts, [{ id: "high", name: "high" }])
  const args = codexArgs("11111111-1111-4111-8111-111111111111", "read-only", { id: "second", effort: "high" })
  assert.deepEqual(args.slice(5), ['-c', 'model_reasoning_effort="high"', "resume", "--json", "--model", "second", "11111111-1111-4111-8111-111111111111", "-"])
})

test("DSH model selection is scoped and uses the rc.5 compatibility path", async () => {
  const agent = { status: "idle" }
  const selected = []
  const ctx = {
    llm: { resolveCallConfig: async config => config },
    sessionController: {
      selectModel() { throw new Error("would update shared default") },
      agents: { selectForNextRequest(candidate, selection) { assert.equal(candidate, agent); selected.push(selection) } },
    },
  }
  const signal = new AbortController().signal
  await applyDshModel(ctx, agent, { id: "second", provider: "local", effort: "high" }, signal)
  assert.deepEqual(selected, [{ provider: "local", model: "second", reasoningEffort: "high" }])
})
