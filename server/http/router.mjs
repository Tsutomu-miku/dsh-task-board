import { assertPlainObject, assertUuid, BoardError } from "../errors.mjs"

const API_PREFIX = "/api/dsh-task-board/"
const MAX_BODY_BYTES = 100_000
const BASE_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
}

async function parseJsonBody(request) {
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim()
  if (contentType !== "application/json") {
    throw new BoardError(415, "需要 JSON 请求。")
  }
  const raw = await request.text()
  if (Buffer.byteLength(raw) > 7_000_000) {
    throw new BoardError(413, "请求过大。")
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new BoardError(400, "请求数据有误。")
  }
  if (parsed?.action !== "add-attachment" && Buffer.byteLength(raw) > MAX_BODY_BYTES) {
    throw new BoardError(413, "请求过大。")
  }
  return assertPlainObject(parsed)
}

function queryInteger(query, key, min, max = Number.MAX_SAFE_INTEGER) {
  const raw = query.get(key)
  if (raw === null) return undefined
  const value = Number(raw)
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new BoardError(400, `Invalid ${key}.`)
  }
  return value
}

export function registerRoutes(ctx, { board, css, environment }) {
  function register(path, methods, handler) {
    ctx.effect(() =>
      ctx.connection.fetch.register({
        path: API_PREFIX + path,
        methods,
        requestBody: "buffered",
        fetch: handler,
      })
    )
  }

  function registerJson(path, method, handler) {
    register(path, [method], async request => {
      try {
        return Response.json(await handler(request), { headers: BASE_HEADERS })
      } catch (error) {
        if (!(error instanceof BoardError)) {
          console.error("dsh-task-board: request failed", error.code ?? error.name)
        }
        return Response.json(
          { error: error instanceof BoardError ? error.message : "看板操作失败。" },
          { status: error instanceof BoardError ? error.status : 500, headers: BASE_HEADERS }
        )
      }
    })
  }

  register("styles.css", ["GET"], async () =>
    new Response(css, {
      headers: { ...BASE_HEADERS, "content-type": "text/css; charset=utf-8" },
    })
  )

  // Preserved for desktop launcher health probe compatibility.
  register("board.html", ["GET"], async () =>
    new Response(null, { status: 302, headers: { ...BASE_HEADERS, location: "../../" } })
  )

  registerJson("state", "GET", request =>
    board.read(queryInteger(new URL(request.url).searchParams, "after", 1)))
  registerJson("task-detail", "GET", request =>
    board.detail(assertUuid(new URL(request.url).searchParams.get("card"), "任务编号")))
  registerJson("delivery", "GET", request => {
    const query = new URL(request.url).searchParams
    const run = query.get("run")
    return board.delivery(assertUuid(query.get("card"), "任务编号"), run ? assertUuid(run, "运行编号") : null)
  })
  register("attachment", ["GET"], request => {
    try {
      const query = new URL(request.url).searchParams
      const file = board.file(assertUuid(query.get("id"), "附件编号"))
      const inline = query.get("preview") === "1" && file.inline
      return new Response(file.bytes, { headers: {
        ...BASE_HEADERS,
        "content-type": inline ? file.mime : "application/octet-stream",
        "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "content-security-policy": "default-src 'none'; sandbox",
      } })
    } catch (error) {
      return new Response(null, { status: error instanceof BoardError ? error.status : 500, headers: BASE_HEADERS })
    }
  })

  registerJson("environment", "GET", request => {
    const query = new URL(request.url).searchParams
    return environment(query.get("workspace"), query.get("refresh") === "1")
  })

  registerJson("conversation", "GET", request => {
    const query = new URL(request.url).searchParams
    const cardId = assertUuid(query.get("card"), "任务编号")
    return board.conversation(cardId, queryInteger(query, "after", 0))
  })

  registerJson("events", "GET", request => {
    const query = new URL(request.url).searchParams
    const runId = assertUuid(query.get("run"), "运行编号")
    const after = Number(query.get("after") ?? "0")
    if (!Number.isSafeInteger(after) || after < 0) throw new BoardError(400, "无效的事件游标。")
    return board.events(runId, after)
  })

  registerJson("activity", "GET", request => {
    const query = new URL(request.url).searchParams
    const runId = assertUuid(query.get("run"), "run ID")
    const before = queryInteger(query, "before", 1)
    const after = queryInteger(query, "after", 0)
    const limit = queryInteger(query, "limit", 0, 100) ?? 50
    if (before !== undefined && after !== undefined) throw new BoardError(400, "Use only one activity cursor.")
    return board.activity(runId, { before, after, limit })
  })

  registerJson("action", "POST", async request => board.act(await parseJsonBody(request)))
}
