import { createServer, request } from "node:http"
import { BoardError } from "../errors.mjs"

const HOST = "127.0.0.1"
const PATH = "/run-tool"
const MAX_BYTES = 112_000
export const RUN_TOKEN_ENV = "DSH_TASK_BOARD_RUN_ACCESS"
export const RUN_PORT_ENV = "DSH_TASK_BOARD_RUN_PORT"

export function openRunCallback(active, invoke) {
  const server = createServer({
    requestTimeout: 5000, headersTimeout: 5000, connectionsCheckingInterval: 1000,
  }, (req, res) => {
    function reply(status, data) {
      res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", connection: "close" })
      res.end(JSON.stringify(data))
    }
    if (req.method !== "POST" || req.url !== PATH || req.headers.host !== `${HOST}:${server.address()?.port}`) {
      return reply(404, { error: "找不到看板回调。" })
    }
    const auth = req.headers.authorization
    const token = /^Bearer ([a-f0-9]{64})$/.exec(auth ?? "")?.[1]
    if (!token || !active(token)) return reply(403, { error: "看板授权已失效。" })
    if (req.headers["content-type"] !== "application/json") return reply(415, { error: "需要 JSON 请求。" })
    if (Number(req.headers["content-length"]) > MAX_BYTES) return reply(413, { error: "工具参数过长。" })
    const chunks = []
    let bytes = 0
    req.on("error", () => {})
    req.on("data", chunk => {
      if (res.writableEnded) return
      bytes += chunk.length
      if (bytes > MAX_BYTES) reply(413, { error: "工具参数过长。" })
      else chunks.push(chunk)
    })
    req.on("end", () => {
      if (res.writableEnded) return
      let input
      try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")) } catch {
        return reply(400, { error: "工具参数格式有误。" })
      }
      try {
        reply(200, { value: invoke(token, input?.name, input?.args) })
      } catch (error) {
        reply(error instanceof BoardError ? error.status : 500, {
          error: error instanceof BoardError ? error.message : "看板工具操作失败。",
        })
      }
    })
  })
  const port = new Promise(resolve => {
    server.once("error", () => resolve(null))
    server.listen(0, HOST, () => resolve(server.address()?.port ?? null))
  })
  server.unref()
  return {
    port,
    async close() {
      await port
      server.close()
      server.closeAllConnections()
    },
  }
}

export function callRunCallback(port, token, name, args, signal) {
  const body = JSON.stringify({ name, args })
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: HOST, port, path: PATH, method: "POST", signal, agent: false,
      headers: {
        authorization: `Bearer ${token}`, "content-type": "application/json", "content-length": Buffer.byteLength(body),
      },
    }, res => {
      const chunks = []
      res.on("data", chunk => chunks.push(chunk))
      res.on("error", reject)
      res.on("end", () => {
        try {
          const result = JSON.parse(Buffer.concat(chunks).toString("utf8"))
          if (res.statusCode !== 200) throw new Error(result.error ?? "看板工具操作失败。")
          resolve(result.value)
        } catch (error) { reject(error) }
      })
    })
    req.on("error", reject)
    req.end(body)
  })
}
