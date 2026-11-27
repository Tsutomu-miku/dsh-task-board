import { spawn } from "node:child_process"
import { runnerEnv } from "./runner-env.mjs"

export function runLocalCommand({ executor, prompt, workdir, signal, onEvent, onPreview }) {
  return new Promise(resolve => {
    if (signal.aborted) return resolve({ status: "interrupted" })
    const append = executor.inputMode === "arg"
    const command = spawn(executor.command, [...executor.args, ...(append ? [prompt] : [])], {
      cwd: workdir, env: runnerEnv(executor), detached: true, stdio: ["pipe", "pipe", "pipe"],
    })
    let output = ""
    let errors = ""
    let failure
    let forceStop
    command.stdout.setEncoding("utf8")
    command.stderr.setEncoding("utf8")
    command.stdout.on("data", chunk => {
      output = (output + chunk).slice(-16000)
      onPreview(output)
    })
    command.stderr.on("data", chunk => { errors = (errors + chunk).slice(-2000) })
    command.stdin.on("error", () => {})
    command.stdin.end(append ? undefined : prompt)
    function kill(name) {
      if (!command.pid) return
      try { process.kill(-command.pid, name) } catch (error) {
        if (error.code !== "ESRCH") console.error("dsh-task-board: local process group signal failed", error.code)
      }
    }
    function abort() {
      kill("SIGTERM")
      forceStop = setTimeout(() => kill("SIGKILL"), 2500)
    }
    signal.addEventListener("abort", abort, { once: true })
    command.once("error", error => { failure = error.message })
    command.once("close", code => {
      clearTimeout(forceStop)
      signal.removeEventListener("abort", abort)
      if (output.trim()) onEvent("output", output)
      if (signal.aborted) return resolve({ status: signal.reason === "shutdown" ? "interrupted" : "stopped", output })
      resolve(code === 0 ? { status: "succeeded", output } :
        { status: "failed", output, error: failure ?? (errors || `本机命令退出码 ${code}`) })
    })
  })
}
