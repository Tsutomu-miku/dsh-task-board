import { randomUUID } from "node:crypto"
import { realpathSync, statSync } from "node:fs"
import { isAbsolute } from "node:path"
import { BoardError, text } from "../errors.mjs"

export const builtinExecutor = engine => `local-${engine}`
export const executorActions = new Set(["save-executor", "toggle-executor", "set-default-executor"])
const engines = { dsh: "DSH", codex: "Codex" }
const sandboxes = new Set(["read-only", "workspace-write"])

export function resolveWorkspace(value) {
  if (typeof value !== "string" || !isAbsolute(value)) throw new BoardError(400, "请填写工作目录的绝对路径。")
  try {
    const actual = realpathSync(value)
    if (statSync(actual).isDirectory()) return actual
  } catch { /* Unavailable paths use the same message. */ }
  throw new BoardError(400, "工作目录不存在或无法访问。")
}

export function manageExecutors({ store, codexSandbox, atomic, presets }) {
  function get(id) {
    const executor = typeof id === "string" && store.get(id)
    if (!executor) throw new BoardError(404, "找不到这个执行器。")
    return executor
  }
  function seed() {
    for (const [engine, name] of Object.entries(engines)) {
      const id = builtinExecutor(engine)
      if (!store.get(id)) store.save({ id, engine, name, enabled: true, workdir: null, preset: null,
        sandbox: engine === "codex" ? codexSandbox : null })
    }
  }
  function save(input, existing) {
    const engine = existing?.engine ?? input.engine
    if (!Object.hasOwn(engines, engine)) throw new BoardError(400, "请选择 DSH 或 Codex。")
    if (existing && input.engine !== undefined && input.engine !== engine) throw new BoardError(400, "执行器类型固定。")
    const sandbox = engine === "codex" ? (input.sandbox ?? existing?.sandbox ?? codexSandbox) : null
    if (engine === "codex" && !sandboxes.has(sandbox)) throw new BoardError(400, "请选择有效的 Codex 沙箱。")
    const executor = {
      id: existing?.id ?? randomUUID(), engine, name: text(input.name, 80, "名称"), enabled: existing?.enabled ?? true,
      workdir: input.workdir ? resolveWorkspace(input.workdir) : null,
      preset: engine === "dsh" && input.preset ? text(input.preset, 120, "DSH 预设") : null, sandbox,
    }
    store.save(executor)
    if (executor.enabled && store.defaultId() === null) store.setDefault(executor.id)
    return executor
  }
  function toggle(executor, enabled) {
    if (!executor || typeof enabled !== "boolean") throw new BoardError(400, "无效的执行器操作。")
    executor.enabled = enabled
    store.save(executor)
    const preferred = store.defaultId()
    if (!enabled && preferred === executor.id) store.setDefault(store.list().find(item => item.enabled)?.id ?? null)
    if (enabled && preferred === null) store.setDefault(executor.id)
    return executor
  }
  function choose(id) {
    const executor = get(id)
    if (!executor.enabled) throw new BoardError(409, "请先启用执行器。")
    store.setDefault(executor.id)
    return executor
  }
  async function act(input) {
    if (input.action === "save-executor" && input.preset) {
      const available = await presets()
      if (!available.some(row => row.id === input.preset && !row.broken)) throw new BoardError(400, "DSH 预设不可用。")
    }
    return atomic(() => {
      if (input.action === "set-default-executor") return choose(input.id)
      const existing = input.id == null ? null : get(input.id)
      if (input.action === "toggle-executor") return toggle(existing, input.enabled)
      return save(input, existing)
    })
  }
  return { get, seed, act, list: store.list, defaultId: store.defaultId }
}
