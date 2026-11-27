import { fork } from "node:child_process"
import { mkdirSync } from "node:fs"
import { createInterface } from "node:readline"
import { fileURLToPath } from "node:url"
import { UUID_PATTERN } from "../../errors.mjs"
import { RUN_PORT_ENV, RUN_TOKEN_ENV } from "../../domain/run-callback.mjs"
import { reportCodexActivity } from "./activity.mjs"

const WORKER_PATH = fileURLToPath(new URL("./worker.mjs", import.meta.url))

export function codexArgs(session, sandbox, model, contextServer, images = []) {
  if (session && !UUID_PATTERN.test(session)) {
    throw new Error("无效的 Codex 会话编号。")
  }
  const args = ["exec", "--json", "--sandbox", sandbox, "--skip-git-repo-check"]
  if (sandbox === "danger-full-access") args.push("-c", 'approval_policy="never"')
  if (model?.effort) args.push("-c", `model_reasoning_effort=${JSON.stringify(model.effort)}`)
  if (contextServer) {
    args.push(
      "-c", `mcp_servers.dsh_task_board.command=${JSON.stringify(contextServer.command)}`,
      "-c", `mcp_servers.dsh_task_board.args=${JSON.stringify(contextServer.args)}`,
    )
    if (contextServer.token) {
      args.push(
        "-c", `mcp_servers.dsh_task_board.env_vars=${JSON.stringify([RUN_TOKEN_ENV, RUN_PORT_ENV])}`,
        "-c", `shell_environment_policy.exclude=${JSON.stringify([RUN_TOKEN_ENV, RUN_PORT_ENV])}`,
        "-c", 'mcp_servers.dsh_task_board.tools.board_set_outcome.approval_mode="approve"',
      )
      if (contextServer.canDelegate) {
        args.push("-c", 'mcp_servers.dsh_task_board.tools.board_delegate.approval_mode="approve"')
      }
    }
  }
  if (session) args.push("resume", "--json")
  for (const image of images) args.push("--image", image)
  if (model) args.push("--model", model.id)
  if (session) args.push(session)
  return [...args, "-"]
}

export function runCodex({
  workdir,
  prompt,
  session,
  sandbox,
  model,
  tempDir,
  contextServer,
  attachments = [],
  signal,
  onSession,
  onEvent,
  onPreview,
  onUsage,
}) {
  const mapStopResult = reason => ({
    status: reason === "shutdown" ? "interrupted" : "stopped",
  })

  if (signal.aborted) return Promise.resolve(mapStopResult(signal.reason))

  const args = codexArgs(session, sandbox, model, contextServer, attachments.filter(file => file.inline).map(file => file.path))
  // Keep TMPDIR pinned inside the persistent profile directory so detached DSH Web
  // hosts can create Codex sandbox mounts even after a launcher's temp dir expires.
  mkdirSync(tempDir, { recursive: true, mode: 0o700 })
  const env = { ...process.env, TMPDIR: tempDir, TMP: tempDir, TEMP: tempDir }
  delete env[RUN_TOKEN_ENV]
  delete env[RUN_PORT_ENV]
  if (contextServer?.token) {
    env[RUN_TOKEN_ENV] = contextServer.token
    env[RUN_PORT_ENV] = String(contextServer.port)
  }

  return new Promise(resolve => {
    const child = fork(WORKER_PATH, args, {
      cwd: workdir,
      env,
      detached: true,
      execArgv: [],
      stdio: ["pipe", "pipe", "ignore", "ipc"],
    })
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
    const commandOutput = new Map()
    let output = ""
    let error
    let confirmed = false
    let stopReason
    let killTimer

    function killGroup(sig) {
      if (!child.pid) return
      try {
        process.kill(-child.pid, sig)
      } catch (err) {
        if (err.code !== "ESRCH") console.error("dsh-task-board: Codex process group signal failed", err.code)
      }
    }

    function stop(cause) {
      if (stopReason) return
      stopReason = cause
      // Let fork's IPC and stdout close together after the worker exits. An
      // eager IPC disconnect can leave the ChildProcess close event unsettled.
      killTimer = setTimeout(() => killGroup("SIGKILL"), 3000)
      killGroup("SIGTERM")
    }

    const onAbort = () => stop(signal.reason)
    signal.addEventListener("abort", onAbort, { once: true })

    child.stdin.on("error", () => {})
    child.stdin.end(prompt)

    child.on("message", event => {
      if (event?.type === "spawn-error") {
        error = event.code === "ENOENT" ? "找不到本机 codex 命令。" : "无法启动 Codex。"
      }
    })

    lines.on("line", line => {
      if (line.length > 2_000_000) return
      let event
      try {
        event = JSON.parse(line)
      } catch {
        return
      }
      if (event.type === "thread.started" && UUID_PATTERN.test(event.thread_id ?? "")) {
        try {
          onSession(event.thread_id)
        } catch {
          error = "无法保存 Codex 会话。"
          stop("persistence")
        }
      }
      if (event.type === "turn.started") onEvent("status", "Codex 已接收任务")
      reportCodexActivity(event, onEvent, commandOutput)
      if (event.type === "item.updated" && event.item?.type === "agent_message") {
        onPreview(event.item.text ?? "")
      }
      if (event.type === "item.completed" && event.item?.type === "agent_message") {
        output = String(event.item.text ?? "").slice(0, 16000)
        onEvent("output", output)
      }
      if (event.type === "turn.completed") {
        confirmed = true
        if (event.usage) {
          const tokens = event.usage.input_tokens + event.usage.output_tokens
          // JSONL falls back to zero if no provider usage was recorded. A resumed
          // thread's usage includes earlier turns.
          if (tokens > 0) onUsage(tokens, session ? "session" : "run")
        }
      }
      if (event.type === "turn.failed") {
        confirmed = false
        error = event.error?.message ?? "Codex 运行失败。"
      }
      if (event.type === "error") {
        error ??= event.message
        if (event.message) onEvent("error", event.message)
      }
    })

    child.on("error", () => {
      error ??= "无法启动 Codex 工作进程。"
    })

    child.once("close", code => {
      clearTimeout(killTimer)
      signal.removeEventListener("abort", onAbort)
      if (stopReason && stopReason !== "persistence") {
        return resolve({ ...mapStopResult(stopReason), output })
      }
      if (code === 0 && confirmed && stopReason !== "persistence") {
        return resolve({ status: "succeeded", output })
      }
      resolve({ status: "failed", output, error: error ?? "Codex 已退出，未确认任务完成。" })
    })
  })
}
