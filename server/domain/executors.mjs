import { randomUUID } from "node:crypto"
import { resolveWorkspace, VALID_SANDBOXES } from "../config.mjs"
import { assertPlainObject, BoardError, requireText } from "../errors.mjs"
import { boundedNumber, optionalText } from "./task-metadata.mjs"
import { normalizeModel, sameModel, validateModel } from "./models.mjs"

export const BUILTIN_ENGINES = { dsh: "DSH", codex: "Codex", command: "本机命令" }
export const EXECUTOR_ACTIONS = new Set(["save-executor", "toggle-executor", "set-default-executor", "delete-executor"])

function stringList(value, label, limit) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 40) throw new BoardError(400, `${label}最多 40 项。`)
  return value.map(item => requireText(item, limit, label))
}

function stringMap(value, label) {
  if (value === undefined) return {}
  const entries = Object.entries(assertPlainObject(value))
  if (entries.length > 40 || entries.some(([key, item]) =>
    !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof item !== "string" || item.includes("\0") || item.length > 4000)) {
    throw new BoardError(400, `${label}格式无效。`)
  }
  return Object.fromEntries(entries)
}

export function builtinExecutorId(engine) {
  return `local-${engine}`
}

export function createExecutorManager({ store, codexSandbox, atomic, presets, models, workdir, inUse }) {
  function get(id) {
    const executor = typeof id === "string" ? store.get(id) : null
    if (!executor) throw new BoardError(404, "找不到这个执行器。")
    return executor
  }

  function seed() {
    for (const engine of ["dsh", "codex"]) {
      const name = BUILTIN_ENGINES[engine]
      const id = builtinExecutorId(engine)
      if (!store.get(id)) {
        store.save({
          id,
          engine,
          name,
          enabled: true,
          workdir: null,
          preset: null,
          model: null,
          sandbox: engine === "codex" ? codexSandbox : null,
        })
      }
    }
  }

  function buildDraft(input, existing) {
    const engine = existing?.engine ?? input.engine
    if (!Object.hasOwn(BUILTIN_ENGINES, engine)) {
      throw new BoardError(400, "请选择有效的执行器类型。")
    }
    if (existing && input.engine !== undefined && input.engine !== engine) {
      throw new BoardError(400, "执行器类型固定。")
    }

    const sandbox = engine === "codex" ? (input.sandbox ?? existing?.sandbox ?? codexSandbox) : null
    if (engine === "codex" && !VALID_SANDBOXES.has(sandbox)) {
      throw new BoardError(400, "请选择有效的 Codex 沙箱。")
    }

    const rawWorkdir = typeof input.workdir === "string" ? input.workdir.trim() : ""
    const profile = { ...existing, ...input }
    const env = stringMap(profile.env, "环境变量")
    const secretEnv = stringList(profile.secretEnv, "密钥环境变量", 100)
    if (secretEnv.some(key => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key))) throw new BoardError(400, "密钥变量名无效。")
    const mcpServers = stringList(profile.mcpServers, "MCP 绑定", 100)
    if (mcpServers.some(name => !/^[A-Za-z0-9_-]+$/.test(name) || name === "dsh_task_board")) throw new BoardError(400, "MCP 名称无效或为看板保留。")
    return {
      id: existing?.id ?? randomUUID(),
      engine,
      name: requireText(input.name, 80, "名称"),
      enabled: existing?.enabled ?? true,
      workdir: rawWorkdir ? resolveWorkspace(rawWorkdir) : null,
      preset: engine === "dsh" && input.preset ? requireText(input.preset, 120, "DSH 预设") : null,
      sandbox,
      instructions: profile.instructions == null ? null : optionalText(profile.instructions, 16000, "角色指令"),
      skills: stringList(profile.skills, "技能", 200),
      agentTools: profile.agentTools === true,
      env: engine === "dsh" ? {} : env, secretEnv: engine === "dsh" ? [] : secretEnv,
      mcpServers: engine === "codex" ? mcpServers : [],
      timeoutMs: profile.timeoutMs == null ? null : boundedNumber(profile.timeoutMs, 1000, 86_400_000, "超时"),
      maxTokens: profile.maxTokens == null ? null : boundedNumber(profile.maxTokens, 0, 100_000_000, "Token 预算"),
      approvalPolicy: engine === "codex" && sandbox !== "danger-full-access" && profile.approvalPolicy === "on-request" ? "on-request" : "never",
      ...(engine === "command" ? {
        command: requireText(profile.command, 512, "可执行程序"),
        args: stringList(profile.args, "命令参数", 1024),
        inputMode: profile.inputMode === "arg" ? "arg" : "stdin",
      } : {}),
      model: input.model === undefined ? existing?.model ?? null : normalizeModel(input.model, engine),
    }
  }

  function persist(executor) {
    store.save(executor)
    if (executor.enabled && store.defaultId() === null) {
      store.setDefault(executor.id)
    }
    return executor
  }

  function toggle(executor, enabled) {
    if (!executor || typeof enabled !== "boolean") {
      throw new BoardError(400, "无效的执行器操作。")
    }
    executor.enabled = enabled
    store.save(executor)
    const preferred = store.defaultId()
    if (!enabled && preferred === executor.id) {
      store.setDefault(store.list().find(item => item.enabled)?.id ?? null)
    }
    if (enabled && preferred === null) {
      store.setDefault(executor.id)
    }
    return executor
  }

  function setDefault(id) {
    const executor = get(id)
    if (!executor.enabled) throw new BoardError(409, "请先启用执行器。")
    store.setDefault(executor.id)
    return executor
  }

  async function act(input) {
    if (input.action === "save-executor") {
      const existing = input.id == null ? null : get(input.id)
      const draft = buildDraft(input, existing)
      if (draft.preset && draft.preset !== existing?.preset) {
        const available = await presets()
        if (!available.some(row => row.id === draft.preset && !row.broken)) {
          throw new BoardError(400, "DSH 预设不可用。")
        }
      }
      const changedWorkspace = draft.engine === "codex" && (draft.workdir ?? null) !== (existing?.workdir ?? null)
      if (draft.model && (changedWorkspace || !sameModel(draft.model, existing?.model))) {
        validateModel(draft.model, await models(draft.engine, draft.workdir ?? workdir))
      }
      return atomic(() => persist({ ...draft, enabled: existing ? get(existing.id).enabled : draft.enabled }))
    }

    return atomic(() => {
      if (input.action === "set-default-executor") return setDefault(input.id)
      if (input.action === "delete-executor") {
        const executor = get(input.id)
        if (["local-dsh", "local-codex"].includes(executor.id)) throw new BoardError(409, "内置执行器可以停用。")
        if (inUse(executor.id)) throw new BoardError(409, "该执行器仍被任务或队列引用。")
        store.remove(executor.id)
        if (store.defaultId() === executor.id) store.setDefault(store.list().find(item => item.enabled)?.id ?? null)
        return { deleted: executor.id }
      }
      return toggle(get(input.id), input.enabled)
    })
  }

  return {
    get,
    seed,
    act,
    list: store.list,
    defaultId: store.defaultId,
  }
}
