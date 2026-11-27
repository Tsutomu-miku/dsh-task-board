import { randomUUID } from "node:crypto"
import { mkdirSync } from "node:fs"
import { fork } from "node:child_process"
import { createInterface } from "node:readline"
import { fileURLToPath } from "node:url"
import { BoardError } from "../../errors.mjs"
import { reportCodexActivity } from "./activity.mjs"
import { runnerEnv } from "../runner-env.mjs"

const worker = fileURLToPath(new URL("./worker.mjs", import.meta.url))
const commandApproval = "item/commandExecution/requestApproval"
const fileApproval = "item/fileChange/requestApproval"
const questions = "item/tool/requestUserInput"
const permissionApproval = "item/permissions/requestApproval"
const approvalMethods = new Set([commandApproval, fileApproval, questions, permissionApproval])

function textInput(text) { return [{ type: "text", text }] }

function answerRequest(request, decision, answer) {
  if (!["accept", "decline"].includes(decision)) throw new BoardError(400, "审批决定无效。")
  const { method, params } = request
  if (method === questions) {
    const answers = {}
    if (decision === "accept") {
      for (const question of params.questions) {
        const value = answer && Object.hasOwn(answer, question.id) ? answer[question.id] : undefined
        if (typeof value !== "string" || !value.trim() || value.length > 4000) {
          throw new BoardError(400, "请填写每个问题的回答。")
        }
        Object.defineProperty(answers, question.id, { enumerable: true, value: { answers: [value.trim()] } })
      }
    }
    return { answers }
  }
  if (method === permissionApproval) {
    return { permissions: decision === "accept" ? params.permissions : {}, scope: "turn" }
  }
  return { decision }
}

function activityItem(item) {
  const types = { commandExecution: "command_execution", mcpToolCall: "mcp_tool_call",
    fileChange: "file_change", webSearch: "web_search", collabAgentToolCall: "collab_tool_call" }
  if (!types[item.type]) return null
  return { ...item, type: types[item.type], aggregated_output: item.aggregatedOutput, exit_code: item.exitCode }
}

export function runCodexApp({
  workdir, prompt, session, executor, attachments, tempDir, contextServer, boardAccess, signal,
  onSession, onEvent, onPreview, onUsage, onControls, onApproval,
}) {
  if (signal.aborted) return Promise.resolve({ status: "interrupted" })
  mkdirSync(tempDir, { recursive: true, mode: 0o700 })
  const env = runnerEnv(executor)
  Object.assign(env, { TMPDIR: tempDir, TMP: tempDir, TEMP: tempDir })
  const mcpArgs = [...contextServer.args, ...(boardAccess ? ["--run-access"] : [])]
  const args = ["app-server", "--listen", "stdio://",
    "-c", `mcp_servers.dsh_task_board.command=${JSON.stringify(contextServer.command)}`,
    "-c", `mcp_servers.dsh_task_board.args=${JSON.stringify(mcpArgs)}`]
  if (boardAccess) {
    env.DSH_TASK_BOARD_RUN_ACCESS = boardAccess.token
    args.push("-c", 'mcp_servers.dsh_task_board.env_vars=["DSH_TASK_BOARD_RUN_ACCESS"]')
    args.push("-c", 'shell_environment_policy.exclude=["DSH_TASK_BOARD_RUN_ACCESS"]')
  }
  for (const name of executor.mcpServers ?? []) args.push("-c", `mcp_servers.${name}.enabled=true`)

  return new Promise(resolve => {
    const child = fork(worker, args, { cwd: workdir, env, detached: true, execArgv: [],
      stdio: ["pipe", "pipe", "ignore", "ipc"] })
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
    const calls = new Map()
    const approvals = new Map()
    const preview = new Map()
    const commandOutput = new Map()
    let selectedApproval
    let nextId = 0
    let threadId
    let turnId
    let output = ""
    let result
    let killTimer

    function write(message) {
      if (!child.stdin.destroyed) child.stdin.write(`${JSON.stringify(message)}\n`)
    }

    function request(method, params) {
      return new Promise((accept, reject) => {
        if (result) return reject(new BoardError(409, "Codex 运行已结束。"))
        const id = ++nextId
        calls.set(id, { accept, reject })
        write({ id, method, params })
      })
    }

    function stopProcess(value) {
      if (result) return
      result = { ...value, output }
      onControls?.({})
      if (selectedApproval) onApproval?.(null)
      child.stdin.end()
      if (child.pid) {
        const kill = name => { try { process.kill(-child.pid, name) } catch (error) {
          if (error.code !== "ESRCH") console.error("dsh-task-board: Codex process group signal failed", error.code)
        } }
        kill("SIGTERM")
        killTimer = setTimeout(() => kill("SIGKILL"), 3200)
      }
    }

    function showApproval() {
      selectedApproval = approvals.values().next().value
      if (!selectedApproval) return onApproval?.(null)
      const { method, params, displayId } = selectedApproval
      onApproval?.({
        id: displayId, kind: method === questions ? "questions" : "approval",
        summary: [
          params.command ?? (method === questions ? "Codex 需要补充信息" : "Codex 请求执行权限"),
          params.reason, params.cwd, params.grantRoot,
          params.permissions ? JSON.stringify(params.permissions, null, 2) : null,
        ].filter(Boolean).join("\n").slice(0, 3000),
        ...(method === questions ? { questions: params.questions.map(({ id, header, question, options }) =>
          ({ id, header, question, options: options ?? [] })) } : {}),
      })
    }

    function approve(decision, answer) {
      if (!selectedApproval) throw new BoardError(409, "该审批已结束。")
      const rpc = selectedApproval
      const response = answerRequest(rpc, decision, answer)
      write({ id: rpc.id, result: response })
      approvals.delete(rpc.id)
      showApproval()
    }

    const abort = () => stopProcess({ status: signal.reason === "shutdown" ? "interrupted" : "stopped" })
    signal.addEventListener("abort", abort, { once: true })
    if (signal.aborted) abort()
    child.stdin.on("error", () => {})
    child.on("message", message => {
      if (message?.type === "spawn-error") stopProcess({ status: "failed", error: "无法启动本机 Codex。" })
    })
    child.on("error", () => stopProcess({ status: "failed", error: "无法启动 Codex 工作进程。" }))
    child.once("close", () => {
      clearTimeout(killTimer)
      lines.close()
      signal.removeEventListener("abort", abort)
      for (const call of calls.values()) call.reject(new BoardError(409, "Codex 连接已关闭。"))
      calls.clear()
      resolve(result ?? { status: "failed", output, error: "Codex App Server 已退出。" })
    })

    function receive(message) {
      const { id, method, params } = message
      if (id !== undefined && !method) {
        const pending = calls.get(id)
        if (!pending) return
        calls.delete(id)
        if (message.error) pending.reject(new BoardError(409, message.error.message ?? "Codex 请求失败。"))
        else pending.accept(message.result)
        return
      }
      if (id !== undefined && method) {
        if (approvalMethods.has(method) && params?.threadId === threadId) {
          approvals.set(id, { id, method, params, displayId: randomUUID() })
          if (!selectedApproval) showApproval()
        } else {
          write({ id, error: { code: -32601, message: "Unsupported request" } })
        }
        return
      }
      if (params?.threadId !== threadId || !threadId) return
      if (method === "turn/started") {
        turnId = params.turn.id
        onEvent("status", "Codex 已接收任务")
      } else if (method === "item/agentMessage/delta" && params.turnId === turnId) {
        const next = ((preview.get(params.itemId) ?? "") + (params.delta ?? "")).slice(0, 16000)
        preview.set(params.itemId, next)
        onPreview(next)
      } else if ((method === "item/started" || method === "item/completed") && params.turnId === turnId) {
        const item = params.item
        if (item.type === "agentMessage" && method === "item/completed") {
          preview.delete(item.id)
          output = String(item.text ?? "").slice(0, 16000)
          if (output) onEvent("output", output)
        }
        reportCodexActivity({ type: method.replace("/", "."), item: activityItem(item) }, onEvent, commandOutput)
      } else if (method === "thread/tokenUsage/updated" && params.turnId === turnId) {
        const tokens = params.tokenUsage?.total?.totalTokens
        if (Number.isSafeInteger(tokens)) onUsage(tokens, "session")
      } else if (method === "serverRequest/resolved") {
        approvals.delete(params.requestId)
        if (selectedApproval?.id === params.requestId) showApproval()
      } else if (method === "turn/completed" && params.turn.id === turnId) {
        const turn = params.turn
        stopProcess({ status: turn.status === "completed" ? "succeeded" : turn.status === "interrupted" ? "stopped" : "failed",
          error: turn.error?.message })
      }
    }

    lines.on("line", line => {
      if (result || line.length > 2_000_000) return
      try { receive(JSON.parse(line)) } catch (error) {
        if (!(error instanceof SyntaxError)) stopProcess({ status: "failed", error: error.message })
      }
    })

    async function start() {
      await request("initialize", { clientInfo: { name: "dsh_task_board", version: "0.9.2" },
        capabilities: { experimentalApi: true } })
      write({ method: "initialized" })
      const options = {
        cwd: workdir, model: executor.model?.id, sandbox: executor.sandbox,
        approvalPolicy: executor.approvalPolicy ?? "never",
        developerInstructions: executor.instructions ?? undefined,
        ...(session ? { threadId: session } : {}),
      }
      const thread = await request(session ? "thread/resume" : "thread/start", options)
      threadId = thread.thread.id
      onSession(threadId)
      const skills = []
      if (executor.skills?.length) {
        const catalogue = await request("skills/list", { cwds: [workdir] })
        const available = catalogue.data.flatMap(entry => entry.skills).filter(skill => skill.enabled)
        for (const name of executor.skills) {
          const skill = available.find(item => item.name === name)
          if (skill) skills.push({ type: "skill", name, path: skill.path })
          else onEvent("status", `执行器技能不可用：${name}`)
        }
      }
      const input = [...textInput(prompt), ...(attachments ?? []).filter(file => file.inline)
        .map(file => ({ type: "localImage", path: file.path })), ...skills]
      const turn = await request("turn/start", { threadId, input, effort: executor.model?.effort })
      turnId ??= turn.turn.id
      if (!result) onControls?.({
        steer(text) { return request("turn/steer", { threadId, expectedTurnId: turnId, input: textInput(text) }) },
        approve,
      })
    }

    start().catch(error => stopProcess({ status: "failed", error: error.message }))
  })
}
