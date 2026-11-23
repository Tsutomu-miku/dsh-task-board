import { mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { parsePluginConfig, resolveWorkspace } from "./server/config.mjs"
import { openBoard } from "./server/domain/board-service.mjs"
import { registerRoutes } from "./server/http/router.mjs"
import { createEnvironment } from "./server/runners/environment.mjs"
import { createRunnerDispatcher } from "./server/runners/index.mjs"

export const name = "dsh-task-board"
export const inject = ["profileContext", "connection", "sessionController", "sessions", "agentPresets", "llm"]

export function apply(ctx, config = {}) {
  if (process.platform === "win32") {
    throw new Error("dsh-task-board requires Linux, macOS or WSL")
  }

  const css = readFileSync(new URL("./dist/styles.css", import.meta.url))
  const { workdir, codexSandbox } = parsePluginConfig(config, ctx.profileContext.cwd)
  const dataDir = join(ctx.profileContext.dir, "task-board")
  mkdirSync(dataDir, { recursive: true, mode: 0o700 })

  const environment = createEnvironment(ctx)
  const run = createRunnerDispatcher(ctx, {
    environment,
    codexTempDir: join(dataDir, "codex-tmp"),
  })

  const board = openBoard({
    database: join(dataDir, "board.sqlite"),
    workdir,
    codexSandbox,
    presets: () => ctx.agentPresets.list(),
    models: environment.models,
    run,
  })

  ctx.effect(() => () => board.close())

  registerRoutes(ctx, {
    board,
    css,
    environment: (dir, refresh) => environment.read(dir ? resolveWorkspace(dir) : workdir, refresh),
  })
}
