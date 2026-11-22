import { mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { openBoard } from "./server/board/service.mjs"
import { resolveWorkspace } from "./server/board/executors.mjs"
import { registerRoutes } from "./server/http.mjs"
import { runCodex } from "./server/runners/codex.mjs"
import { runDsh } from "./server/runners/dsh.mjs"
import { readEnvironment } from "./server/runners/environment.mjs"

export const name = "dsh-task-board"
export const inject = ["profileContext", "connection", "sessionController", "sessions", "agentPresets"]

export function apply(ctx, config = {}) {
  if (process.platform === "win32") throw new Error("dsh-task-board requires Linux, macOS or WSL")
  const css = readFileSync(new URL("./dist/styles.css", import.meta.url))
  const workdir = resolveWorkspace(config.workspace ?? ctx.profileContext.cwd)
  const codexSandbox = config.codexSandbox ?? "read-only"
  if (!["read-only", "workspace-write"].includes(codexSandbox)) throw new Error("invalid dsh-task-board Codex sandbox")
  const dataDir = join(ctx.profileContext.dir, "task-board")
  mkdirSync(dataDir, { recursive: true, mode: 0o700 })
  const board = openBoard({ database: join(dataDir, "board.sqlite"), workdir, codexSandbox,
    presets: () => ctx.agentPresets.list(),
    run: options => options.engine === "dsh" ? runDsh(ctx, options) : runCodex({ ...options, sandbox: options.executor.sandbox }),
  })
  ctx.effect(() => () => board.close())
  registerRoutes(ctx, { board, css, environment: () => readEnvironment(ctx) })
}
