import { BoardError } from "./errors.mjs"

const base = "/api/dsh-task-board/"
const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" }
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

async function readAction(request) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") throw new BoardError(415, "需要 JSON 请求。")
  const payload = await request.text()
  if (Buffer.byteLength(payload) > 100000) throw new BoardError(413, "请求过大。")
  let input
  try { input = JSON.parse(payload) } catch { throw new BoardError(400, "请求数据有误。") }
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new BoardError(400, "请求数据有误。")
  return input
}

export function registerRoutes(ctx, { board, css, environment }) {
  function route(path, methods, fetch) {
    ctx.effect(() => ctx.connection.fetch.register({ path: base + path, methods, requestBody: "buffered", fetch }))
  }
  function jsonRoute(path, method, handle) {
    route(path, [method], async request => {
      try { return Response.json(await handle(request), { headers }) }
      catch (error) {
        if (!(error instanceof BoardError)) console.error("dsh-task-board: request failed", error.code ?? error.name)
        return Response.json({ error: error instanceof BoardError ? error.message : "看板操作失败。" }, {
          status: error instanceof BoardError ? error.status : 500, headers,
        })
      }
    })
  }
  route("styles.css", ["GET"], async () => new Response(css, { headers: { ...headers, "content-type": "text/css; charset=utf-8" } }))
  // The installed 0.2 desktop launcher probes this document after signing in.
  route("board.html", ["GET"], async () => new Response(null, { status: 302, headers: { ...headers, location: "../../" } }))
  jsonRoute("state", "GET", () => board.read())
  jsonRoute("environment", "GET", environment)
  jsonRoute("events", "GET", request => {
    const id = new URL(request.url).searchParams.get("run")
    if (!uuid.test(id ?? "")) throw new BoardError(400, "无效的运行编号。")
    return board.events(id)
  })
  jsonRoute("action", "POST", async request => board.act(await readAction(request)))
}
