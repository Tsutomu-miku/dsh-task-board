import { execFileSync } from "node:child_process"
import { accessSync, constants, realpathSync, statSync } from "node:fs"
import { release } from "node:os"
import { isAbsolute } from "node:path"
import { BoardError } from "./errors.mjs"

export const VALID_SANDBOXES = new Set(["read-only", "workspace-write", "danger-full-access"])
export const WORKSPACE_HOST = process.platform === "linux" && /microsoft/i.test(release()) ? "wsl" : "local"

export function resolveWorkspace(value) {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) {
    throw new BoardError(400, "请填写工作目录的绝对路径。")
  }

  let candidate = value.trim()
  if (WORKSPACE_HOST === "wsl" && /^[a-z]:[\\/]/i.test(candidate)) {
    try {
      candidate = execFileSync("wslpath", ["-u", candidate], {
        encoding: "utf8",
        timeout: 1500,
        stdio: ["ignore", "pipe", "pipe"],
      }).replace(/\r?\n$/, "")
    } catch {
      throw new BoardError(400, "WSL 无法解析此 Windows 目录，请确认盘符已挂载，或填写 WSL 中的绝对路径。")
    }
  }

  if (!isAbsolute(candidate)) {
    throw new BoardError(400, "请填写工作目录的绝对路径。")
  }

  try {
    const resolved = realpathSync(candidate)
    if (statSync(resolved).isDirectory()) {
      accessSync(resolved, constants.R_OK | constants.X_OK)
      return resolved
    }
  } catch {
    // Unify missing and unreadable directory errors to avoid leaking host filesystem state.
  }

  throw new BoardError(400, "工作目录不存在或无法访问。")
}

export function parsePluginConfig(config = {}, defaultCwd) {
  const workdir = resolveWorkspace(config.workspace ?? defaultCwd)
  const codexSandbox = config.codexSandbox ?? "read-only"
  if (!VALID_SANDBOXES.has(codexSandbox)) {
    throw new Error("invalid dsh-task-board Codex sandbox")
  }
  return { workdir, codexSandbox }
}
