import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { join } from "node:path"
import { parsePluginConfig, resolveWorkspace } from "./server/config.mjs"
import { BOARD_RUN_TOOLS } from "./server/domain/collaboration.mjs"
import { BOARD_CONTEXT_TOOLS } from "./server/domain/board-context.mjs"
import { boardDatabasePath } from "./server/storage/board-path.mjs"
import { openBoard } from "./server/domain/board-service.mjs"
import { registerRoutes } from "./server/http/router.mjs"
import { createEnvironment } from "./server/runners/environment.mjs"
import { createRunnerDispatcher } from "./server/runners/index.mjs"

export const name = "dsh-task-board"
export const inject = ["profileContext", "connection", "sessionController", "sessions", "agentPresets", "llm", "tools", "fileUploads"]

export function apply(ctx, config = {}) {
  if (process.platform === "win32") {
    throw new Error("dsh-task-board requires Linux, macOS or WSL")
  }

  const cssFile = fileURLToPath(new URL("./dist/styles.css", import.meta.url))
  const clientFile = fileURLToPath(new URL("./dist/client.js", import.meta.url))
  const missing = [cssFile, clientFile].filter(file => !existsSync(file))
  if (missing.length > 0) {
    throw new Error(
      `dsh-task-board 缺少构建产物：${missing.join("、")}。请在插件源码目录运行 npm run build 后重新安装。`
    )
  }
  const css = readFileSync(cssFile)
  const { workdir, codexSandbox, parallelism, timeoutMs, maxTokens } = parsePluginConfig(config, ctx.profileContext.cwd)
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
    codexSandbox, parallelism, timeoutMs, maxTokens,
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

  for (const { name, description, inputSchema } of BOARD_RUN_TOOLS) {
    ctx.tools.register({
      name, description, parameters: inputSchema,
      output: {
        schema: { type: "string" },
        render: (_args, value) => [{ type: "text", text: value }],
      },
      isConcurrencySafe: () => false,
      async execute(args, { signal, agent }) {
        signal.throwIfAborted()
        return JSON.stringify(board.agentTool(name, args, agent))
      },
    }, { when: ({ agent }) => board.hasAgentAccess(agent, name) })
  }

  registerRoutes(ctx, {
    board,
    css,
    environment: (dir, refresh) => environment.read(dir ? resolveWorkspace(dir) : workdir, refresh),
  })
}
