import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"
import { fileURLToPath } from "node:url"
import { validateModel } from "../domain/models.mjs"
import { runCodexApp } from "./codex/app-server.mjs"
import { runDsh } from "./dsh/runner.mjs"
import { runLocalCommand } from "./local-command.mjs"

export function createRunnerDispatcher(ctx, { environment, codexTempDir }) {
  const contextServer = {
    command: process.execPath,
    args: [fileURLToPath(new URL("../mcp/main.mjs", import.meta.url)), "--profile-dir", ctx.profileContext.dir],
  }
  return async function dispatchRun(options) {
    const { executor, signal } = options
    const modelDir = options.sourceWorkdir ?? options.workdir
    if (executor.model && options.engine !== "command") {
      validateModel(executor.model, await environment.models(options.engine, modelDir))
    }
    signal.throwIfAborted()
    let attachmentDir
    try {
      const attachments = []
      if (options.attachments?.length) {
        await mkdir(codexTempDir, { recursive: true, mode: 0o700 })
        attachmentDir = await mkdtemp(join(codexTempDir, "attachments-"))
        for (const file of options.attachments) {
          const path = join(attachmentDir, `${file.id}-${basename(file.name)}`)
          await writeFile(path, file.bytes, { mode: 0o600, flag: "wx" })
          attachments.push({ ...file, path })
        }
      }
      const taskContext = options.boardAccess
        ? `Board task ${options.cardId}. Use board_set_outcome if you are blocked or work remains, and include the reason. Use board_read_project for related discussion and documents.`
        : null
      const prompt = [taskContext, options.prompt, attachments.length ? "Local task attachments:\n" +
        attachments.map(file => `${file.name}: ${file.path}`).join("\n") : null].filter(Boolean).join("\n\n")
      const configured = { ...options, attachments, prompt }
      if (options.engine === "dsh") return await runDsh(ctx, configured)
      if (options.engine === "command") return await runLocalCommand(configured)
      return await runCodexApp({ ...configured, tempDir: codexTempDir, contextServer })
    } finally {
      if (attachmentDir) await rm(attachmentDir, { recursive: true, force: true })
    }
  }
}
