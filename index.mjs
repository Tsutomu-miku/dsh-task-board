import { mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { openBoard } from "./server/board/service.mjs"
import { resolveWorkspace } from "./server/board/executors.mjs"
import { validateModel } from "./server/board/models.mjs"
import { registerRoutes } from "./server/http.mjs"
import { runCodex } from "./server/runners/codex.mjs"
import { runDsh } from "./server/runners/dsh.mjs"
import { createEnvironment } from "./server/runners/environment.mjs"

export const name = "dsh-task-board"
export const inject = ["profileContext", "connection", "sessionController", "sessions", "agentPresets", "llm"]

export function apply(ctx, config = {}) {
  if (process.platform === "win32") throw new Error("dsh-task-board requires Linux, macOS or WSL")
  const css = readFileSync(new URL("./dist/styles.css", import.meta.url))
  const workdir = resolveWorkspace(config.workspace ?? ctx.profileContext.cwd)
  const codexSandbox = config.codexSandbox ?? "read-only"
  if (!["read-only", "workspace-write"].includes(codexSandbox)) throw new Error("invalid dsh-task-board Codex sandbox")
  const dataDir = join(ctx.profileContext.dir, "task-board")
  mkdirSync(dataDir, { recursive: true, mode: 0o700 })
  const codexTempDir = join(dataDir, "codex-tmp")
  const environment = createEnvironment(ctx)
  const board = openBoard({ database: join(dataDir, "board.sqlite"), workdir, codexSandbox,
    presets: () => ctx.agentPresets.list(),
    models: environment.models,
    async run(options) {
      const { sandbox, model } = options.executor
      if (model) validateModel(model, await environment.models(options.engine, options.workdir))
      return options.engine === "dsh" ? runDsh(ctx, options) : runCodex({ ...options, sandbox, model, tempDir: codexTempDir })
    },
  })
  ctx.effect(() => () => board.close())
  registerRoutes(ctx, { board, css, environment: (dir, refresh) => environment.read(dir ? resolveWorkspace(dir) : workdir, refresh) })
}
