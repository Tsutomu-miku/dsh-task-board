import { fork } from "node:child_process"
import { createInterface } from "node:readline"
import { fileURLToPath } from "node:url"

const worker = fileURLToPath(new URL("./codex-worker.mjs", import.meta.url))
const sessionPattern = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

export function codexArgs(session, sandbox) {
  if (session && !sessionPattern.test(session)) throw new Error("无效的 Codex 会话编号。")
  const args = ["exec", "--json", "--sandbox", sandbox, "--skip-git-repo-check"]
  if (session) args.push("resume", "--json", session)
  return [...args, "-"]
}

export function runCodex({ workdir, prompt, session, sandbox, signal, onSession }) {
  const stopResult = reason => ({
    status: reason === "shutdown" ? "interrupted" : reason === "timeout" ? "failed" : "stopped",
    error: reason === "timeout" ? "Codex 运行超过 30 分钟，进程已停止。" : null,
  })
  if (signal.aborted) return Promise.resolve(stopResult(signal.reason))
  const args = codexArgs(session, sandbox)
  return new Promise(resolve => {
    const child = fork(worker, args, { cwd: workdir, detached: true, execArgv: [], stdio: ["pipe", "pipe", "ignore", "ipc"] })
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
    let output = ""
    let error
    let confirmed = false
    let reason
    let escalation

    function killGroup(signal) {
      if (!child.pid) return
      try { process.kill(-child.pid, signal) } catch (error) {
        if (error.code !== "ESRCH") console.error("dsh-task-board: Codex process group signal failed", error.code)
      }
    }
    function stop(cause) {
      if (reason) return
      reason = cause
      // IPC disconnect also trips the watchdog if this host exits abruptly.
      if (child.connected) child.disconnect()
      escalation = setTimeout(() => killGroup("SIGKILL"), 3000)
    }
    const abort = () => stop(signal.reason)
    const deadline = setTimeout(() => stop("timeout"), 30 * 60 * 1000)
    signal.addEventListener("abort", abort, { once: true })
    child.stdin.on("error", () => {})
    child.stdin.end(prompt)
    child.on("message", event => {
      if (event?.type === "spawn-error") error = event.code === "ENOENT" ? "找不到本机 codex 命令。" : "无法启动 Codex。"
    })
    lines.on("line", line => {
      if (line.length > 2_000_000) return
      let event
      try { event = JSON.parse(line) } catch { return }
      if (event.type === "thread.started" && sessionPattern.test(event.thread_id ?? "")) {
        try { onSession(event.thread_id) } catch {
          error = "无法保存 Codex 会话。"
          stop("persistence")
        }
      }
      if (event.type === "item.completed" && event.item?.type === "agent_message") output = String(event.item.text ?? "").slice(0, 16000)
      if (event.type === "turn.completed") confirmed = true
      if (event.type === "turn.failed") {
        confirmed = false
        error = event.error?.message ?? "Codex 运行失败。"
      }
      if (event.type === "error") error ??= event.message
    })
    child.on("error", () => { error ??= "无法启动 Codex 工作进程。" })
    child.once("close", code => {
      clearTimeout(deadline)
      clearTimeout(escalation)
      signal.removeEventListener("abort", abort)
      if (reason && reason !== "persistence") return resolve({ ...stopResult(reason), output })
      if (code === 0 && confirmed && reason !== "persistence") return resolve({ status: "succeeded", output })
      resolve({ status: "failed", output, error: error ?? "Codex 已退出，未确认任务完成。" })
    })
  })
}
