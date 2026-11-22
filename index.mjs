import { mkdirSync, readFileSync, realpathSync, statSync } from "node:fs"
import { join } from "node:path"
import { BoardError, openBoard } from "./board.mjs"
import { runCodex } from "./runner.mjs"
import { runDsh } from "./native-dsh.mjs"

export const name = "dsh-task-board"
export const inject = ["profileContext", "connection", "sessionController", "sessions"]
const base = "/api/dsh-task-board/"
const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" }
const assets = [
  ["board.html", "text/html; charset=utf-8", "./index.html"],
  ["main.js", "text/javascript; charset=utf-8", "./dist/main.js"],
  ["styles.css", "text/css; charset=utf-8", "./dist/styles.css"],
]

export function apply(ctx, config = {}) {
  if (process.platform === "win32") throw new Error("dsh-task-board requires Linux, macOS or WSL")
  const workdir = realpathSync(config.workspace ?? ctx.profileContext.cwd)
  if (!statSync(workdir).isDirectory()) throw new Error("dsh-task-board workspace must be a directory")
  const sandbox = config.codexSandbox ?? "read-only"
  if (!["read-only", "workspace-write"].includes(sandbox)) throw new Error("invalid dsh-task-board Codex sandbox")
  const dataDir = join(ctx.profileContext.dir, "task-board")
  mkdirSync(dataDir, { recursive: true, mode: 0o700 })
  const database = join(dataDir, "board.sqlite")
  const board = openBoard({ database, workdir, run: options => options.engine === "dsh"
    ? runDsh(ctx, options)
    : runCodex({ ...options, sandbox }) })
  ctx.effect(() => () => board.close())

  function route(path, methods, fetch) {
    ctx.effect(() => ctx.connection.fetch.register({ path: base + path, methods, requestBody: "buffered", fetch }))
  }
  for (const [path, type, file] of assets) {
    const body = readFileSync(new URL(file, import.meta.url))
    route(path, ["GET"], async () => new Response(body, { headers: {
      ...headers,
      "content-type": type,
      "content-security-policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
    } }))
  }
  route("state", ["GET"], async () => Response.json(board.read(), { headers }))
  route("action", ["POST"], async request => {
    try {
      if (request.headers.get("content-type")?.split(";")[0] !== "application/json") throw new BoardError(415, "需要 JSON 请求。")
      const payload = await request.text()
      if (Buffer.byteLength(payload) > 100000) throw new BoardError(413, "请求过大。")
      let input
      try { input = JSON.parse(payload) } catch { throw new BoardError(400, "请求数据有误。") }
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new BoardError(400, "请求数据有误。")
      return Response.json(board.act(input), { headers })
    } catch (error) {
      if (!(error instanceof BoardError)) console.error("dsh-task-board: action failed", error.code ?? error.name)
      return Response.json({ error: error instanceof BoardError ? error.message : "看板操作失败。" }, {
        status: error instanceof BoardError ? error.status : 500,
        headers,
      })
    }
  })
}
