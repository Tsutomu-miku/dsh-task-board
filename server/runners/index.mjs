import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { extname, join } from "node:path"
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
    const prompt = [options.rolePrompt, options.prompt].filter(Boolean).join("\n\n")
    if (options.engine === "dsh") return runDsh(ctx, { ...options, prompt })
    let attachmentDir
    try {
      const attachments = []
      if (options.attachments?.length) {
        await mkdir(codexTempDir, { recursive: true, mode: 0o700 })
        attachmentDir = await mkdtemp(join(codexTempDir, "attachments-"))
        for (const file of options.attachments) {
          const suffix = extname(file.name)
          const extension = file.inline ? `.${file.mime.split("/")[1]}` : /^\.[\w-]{1,12}$/.test(suffix) ? suffix : ""
          const path = join(attachmentDir, file.id + extension)
          await writeFile(path, file.bytes, { mode: 0o600, flag: "wx" })
          attachments.push({ ...file, path })
        }
      }
      const appendix = attachments.map(file => JSON.stringify({ name: file.name, path: file.path })).join("\n")
      const configured = { ...options, attachments, prompt: appendix ? `${prompt}\n\nLocal attachments for this message:\n${appendix}` : prompt }
      const args = [...contextServer.args]
      const port = await boardAccess?.port
      if (boardAccess?.token && !port) throw new Error("无法启动本机看板回调。")
      signal.throwIfAborted()
      if (boardAccess?.token) args.push("--run-access")
      if (boardAccess?.canDelegate) args.push("--allow-delegate")
      return await runCodex({
        ...configured, sandbox: executor.sandbox, model: executor.model, tempDir: codexTempDir,
        contextServer: { ...contextServer, args, token: boardAccess?.token, port, canDelegate: boardAccess?.canDelegate },
      })
    } finally {
      if (attachmentDir) await rm(attachmentDir, { recursive: true, force: true })
    }
  }
}
