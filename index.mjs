import { mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { parsePluginConfig, resolveWorkspace } from "./server/config.mjs"
import { BOARD_CONTEXT_TOOLS } from "./server/domain/board-context.mjs"
import { boardDatabasePath } from "./server/storage/board-path.mjs"
import { openBoard } from "./server/domain/board-service.mjs"
import { registerRoutes } from "./server/http/router.mjs"
import { createEnvironment } from "./server/runners/environment.mjs"
import { createRunnerDispatcher } from "./server/runners/index.mjs"

export const name = "dsh-task-board"
export const inject = ["profileContext", "connection", "sessionController", "sessions", "agentPresets", "llm", "tools"]

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
    database: boardDatabasePath(ctx.profileContext.dir),
    workdir,
    codexSandbox,
    presets: () => ctx.agentPresets.list(),
    models: environment.models,
    run,
  })

  ctx.effect(() => () => board.close())

  for (const { name, description, inputSchema } of BOARD_CONTEXT_TOOLS) {
    ctx.tools.register({
      name,
      description,
      parameters: inputSchema,
      output: {
        schema: { type: "string" },
        render: (_args, value) => [{ type: "text", text: value }],
      },
      isConcurrencySafe: () => true,
      async execute(args, { signal }) {
        signal.throwIfAborted()
        return JSON.stringify(board.context(name, args))
      },
    })
  }

  registerRoutes(ctx, {
    board,
    css,
    environment: (dir, refresh) => environment.read(dir ? resolveWorkspace(dir) : workdir, refresh),
  })
}
