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
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
    throw new BoardError(413, "请求过大。")
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new BoardError(400, "请求数据有误。")
  }
  return assertPlainObject(parsed)
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

  registerJson("state", "GET", () => board.read())

  registerJson("environment", "GET", request => {
    const query = new URL(request.url).searchParams
    return environment(query.get("workspace"), query.get("refresh") === "1")
  })

  registerJson("conversation", "GET", request => {
    const cardId = assertUuid(new URL(request.url).searchParams.get("card"), "任务编号")
    return board.conversation(cardId)
  })

  registerJson("events", "GET", request => {
    const runId = assertUuid(new URL(request.url).searchParams.get("run"), "运行编号")
    return board.events(runId)
  })

  registerJson("action", "POST", async request => board.act(await parseJsonBody(request)))
}
