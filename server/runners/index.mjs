import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"
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
    const { executor, signal, boardAccess } = options
    const modelDir = options.sourceWorkdir ?? options.workdir
    if (executor.model) validateModel(executor.model, await environment.models(options.engine, modelDir))
    signal.throwIfAborted()
    let attachmentDir
    try {
      const attachments = []
      // Existing card-level attachments remain readable after the 0.9.x UI is removed.
      if (options.attachments?.length) {
        await mkdir(codexTempDir, { recursive: true, mode: 0o700 })
        attachmentDir = await mkdtemp(join(codexTempDir, "attachments-"))
        for (const file of options.attachments) {
          const path = join(attachmentDir, `${file.id}-${basename(file.name)}`)
          await writeFile(path, file.bytes, { mode: 0o600, flag: "wx" })
          attachments.push({ ...file, path })
        }
      }
      const prompt = [options.rolePrompt, options.prompt, attachments.length ? "Local task attachments:\n" +
        attachments.map(file => `${file.name}: ${file.path}`).join("\n") : null].filter(Boolean).join("\n\n")
      const configured = { ...options, attachments, prompt }
      if (options.engine === "dsh") return await runDsh(ctx, configured)
      const args = [...contextServer.args]
      if (boardAccess?.token) args.push("--run-access")
      if (boardAccess?.canDelegate) args.push("--allow-delegate")
      return await runCodex({
        ...configured, sandbox: executor.sandbox, model: executor.model, tempDir: codexTempDir,
        contextServer: { ...contextServer, args, token: boardAccess?.token, canDelegate: boardAccess?.canDelegate },
      })
    } finally {
      if (attachmentDir) await rm(attachmentDir, { recursive: true, force: true })
    }
  }
}
