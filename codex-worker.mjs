import { spawn } from "node:child_process"

const codex = spawn("codex", process.argv.slice(2), { stdio: ["inherit", "inherit", "ignore"] })
let stopping = false

function stop() {
  if (stopping) return
  stopping = true
  process.kill(-process.pid, "SIGTERM")
  setTimeout(() => process.kill(-process.pid, "SIGKILL"), 2000)
}

process.on("SIGTERM", stop)
process.on("disconnect", stop)
if (!process.connected) stop()

codex.on("error", error => {
  if (process.connected) process.send({ type: "spawn-error", code: error.code })
})
codex.on("close", code => {
  if (!stopping) process.exit(code ?? 1)
})
