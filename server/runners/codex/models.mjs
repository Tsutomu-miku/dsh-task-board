import { spawn } from "node:child_process"
import { createInterface } from "node:readline"

const UNAVAILABLE_MESSAGE = "无法读取 Codex 模型目录，请检查本机 Codex 登录或配置后重试。"

// Discovery uses an ephemeral stdio JSON-RPC connection; task runs use `codex exec`.
export function readCodexModels(workdir, launch = spawn) {
  return new Promise((resolve, reject) => {
    const child = launch("codex", ["app-server", "--listen", "stdio://"], {
      cwd: workdir,
      stdio: ["pipe", "pipe", "ignore"],
    })
    const lines = createInterface({ input: child.stdout })
    const models = new Map()
    const seenCursors = new Set()
    let requestId = 0
    let result
    let complete = false
    let cleanupTimer
    const deadline = setTimeout(() => finish(new Error(UNAVAILABLE_MESSAGE)), 7500)

    function finish(value) {
      if (complete) return
      complete = true
      result = value
      clearTimeout(deadline)
      lines.close()
      child.stdin.end()
      cleanupTimer = setTimeout(() => child.kill("SIGKILL"), 1000)
    }

    function send(method, params) {
      child.stdin.write(`${JSON.stringify({ id: ++requestId, method, params })}\n`)
    }

    function fetchPage(cursor) {
      send("model/list", { limit: 100, includeHidden: false, ...(cursor ? { cursor } : {}) })
    }

    child.once("error", () => finish(new Error(UNAVAILABLE_MESSAGE)))
    child.stdin.on("error", () => finish(new Error(UNAVAILABLE_MESSAGE)))
    child.once("close", () => {
      clearTimeout(deadline)
      clearTimeout(cleanupTimer)
      lines.close()
      if (!complete || result instanceof Error) reject(result ?? new Error(UNAVAILABLE_MESSAGE))
      else resolve(result)
    })

    lines.on("line", line => {
      if (complete || line.length > 2_000_000) return
      let message
      try {
        message = JSON.parse(line)
      } catch {
        return
      }
      if (message?.id !== requestId) return
      if (message.error || !message.result) return finish(new Error(UNAVAILABLE_MESSAGE))

      if (requestId === 1) {
        child.stdin.write('{"method":"initialized"}\n')
        return fetchPage()
      }
      if (!Array.isArray(message.result.data)) return finish(new Error(UNAVAILABLE_MESSAGE))

      for (const item of message.result.data) {
        if (typeof item?.model !== "string" || !item.model || item.hidden) continue
        const supported = Array.isArray(item.supportedReasoningEfforts) ? item.supportedReasoningEfforts : []
        const efforts = supported.flatMap(effort =>
          typeof effort?.reasoningEffort === "string"
            ? [{ id: effort.reasoningEffort, name: effort.reasoningEffort }]
            : []
        )
        models.set(item.model, { id: item.model, name: item.displayName ?? item.model, efforts })
      }

      const cursor = message.result.nextCursor
      if (!cursor) return finish([...models.values()])
      if (typeof cursor !== "string" || seenCursors.has(cursor) || seenCursors.size >= 15) {
        return finish(new Error(UNAVAILABLE_MESSAGE))
      }
      seenCursors.add(cursor)
      return fetchPage(cursor)
    })

    send("initialize", { clientInfo: { name: "dsh_task_board", version: "0.6.0" } })
  })
}
