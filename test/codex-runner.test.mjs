import assert from "node:assert/strict"
import { mkdtemp, realpath, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { runCodex } from "../server/runners/codex.mjs"

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
  console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text } }));
  console.log(JSON.stringify({ type: 'turn.completed' }));
});
`, { mode: 0o700 })
    const stale = join(dir, "already-removed")
    Object.assign(process.env, { PATH: `${dir}:${process.env.PATH}`, TMPDIR: stale, TMP: stale, TEMP: stale })
    const result = await runCodex({ workdir: dir, prompt: "pwd", sandbox: "read-only", tempDir,
      signal: new AbortController().signal, onEvent() {}, onSession() {}, onPreview() {} })
    assert.equal(result.status, "succeeded", result.error)
    assert.deepEqual(JSON.parse(result.output), { TMPDIR: tempDir, TMP: tempDir, TEMP: tempDir, sandbox: "read-only", cwd: dir })
    assert.equal((await stat(tempDir)).mode & 0o777, 0o700)
  } finally {
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    await rm(dir, { recursive: true, force: true })
  }
})
