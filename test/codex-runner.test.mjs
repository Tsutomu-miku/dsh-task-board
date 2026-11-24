import assert from "node:assert/strict"
import { mkdtemp, realpath, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { runCodex } from "../server/runners/codex/runner.mjs"

test("Codex uses its profile temp directory after the launcher temp directory vanishes", async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "dsh-codex-runner-")))
  const tempDir = join(dir, "profile", "codex-tmp")
  const keys = ["PATH", "TMPDIR", "TMP", "TEMP"]
  const original = new Map(keys.map(key => [key, process.env[key]]))
  try {
    await writeFile(join(dir, "codex"), `#!/usr/bin/env node
const fs = require('node:fs');
const { TMPDIR, TMP, TEMP } = process.env;
const text = JSON.stringify({ TMPDIR, TMP, TEMP, sandbox: process.argv[5], cwd: process.cwd() });
if (!fs.statSync(TMPDIR).isDirectory()) process.exit(1);
process.stdin.resume();
process.stdin.on('end', () => {
  console.log(JSON.stringify({ type: 'item.started', item: { id: '1', type: 'command_execution', command: 'pwd' } }));
  console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text } }));
  console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 90, cached_input_tokens: 60, output_tokens: 10, reasoning_output_tokens: 5 } }));
});
`, { mode: 0o700 })
    const stale = join(dir, "already-removed")
    Object.assign(process.env, { PATH: `${dir}:${process.env.PATH}`, TMPDIR: stale, TMP: stale, TEMP: stale })
    const events = []
    const usage = []
    const options = {
      workdir: dir, prompt: "pwd", sandbox: "read-only", tempDir,
      signal: new AbortController().signal,
      onEvent(kind, message) { events.push([kind, message]) },
      onUsage(tokens, scope) { usage.push({ tokens, scope }) },
      onSession() {}, onPreview() {},
    }
    const result = await runCodex(options)
    assert.equal(result.status, "succeeded", result.error)
    assert.deepEqual(JSON.parse(result.output), { TMPDIR: tempDir, TMP: tempDir, TEMP: tempDir, sandbox: "read-only", cwd: dir })
    assert.equal((await stat(tempDir)).mode & 0o777, 0o700)
    assert.deepEqual(events[0], ["command", "pwd"])
    const continued = await runCodex({ ...options, session: "11111111-1111-4111-8111-111111111111" })
    assert.equal(continued.status, "succeeded", continued.error)
    assert.deepEqual(usage, [{ tokens: 100, scope: "run" }, { tokens: 100, scope: "session" }])
  } finally {
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    await rm(dir, { recursive: true, force: true })
  }
})

test("stopping a running Codex worker settles with its committed output", { timeout: 8000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "dsh-codex-stop-"))
  const originalPath = process.env.PATH
  try {
    await writeFile(join(dir, "codex"), `#!/usr/bin/env node
process.stdin.resume();
process.stdin.on('end', () => {
  console.log(JSON.stringify({type: 'item.completed', item: {type: 'agent_message', text: 'Work recorded'}}));
  setInterval(() => {}, 1000);
});
`, { mode: 0o700 })
    process.env.PATH = `${dir}:${originalPath}`
    const controller = new AbortController()
    const result = await runCodex({
      workdir: dir,
      prompt: "Work until stopped",
      sandbox: "read-only",
      tempDir: join(dir, "temp"),
      signal: controller.signal,
      onSession() {},
      onPreview() {},
      onUsage() {},
      onEvent(kind) {
        if (kind === "output") controller.abort("user")
      },
    })
    assert.deepEqual(result, { status: "stopped", output: "Work recorded" })
  } finally {
    process.env.PATH = originalPath
    await rm(dir, { recursive: true, force: true })
  }
})
