import { fileURLToPath } from "node:url"
import { validateModel } from "../domain/models.mjs"
import { runCodex } from "./codex/runner.mjs"
import { runDsh } from "./dsh/runner.mjs"

export function createRunnerDispatcher(ctx, { environment, codexTempDir }) {
  const contextServer = {
    command: process.execPath,
    args: [fileURLToPath(new URL("../mcp/main.mjs", import.meta.url)), "--profile-dir", ctx.profileContext.dir],
  }
  return async function dispatchRun(options) {
    const { sandbox, model } = options.executor
    if (model) {
      validateModel(model, await environment.models(options.engine, options.workdir))
    }
    if (options.engine === "dsh") {
      return runDsh(ctx, options)
    }
    return runCodex({ ...options, sandbox, model, tempDir: codexTempDir, contextServer })
  }
}
