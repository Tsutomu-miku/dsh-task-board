import { randomUUID } from "node:crypto"
import { resolveWorkspace, VALID_SANDBOXES } from "../config.mjs"
import { BoardError, requireText } from "../errors.mjs"
import { normalizeModel, sameModel, validateModel } from "./models.mjs"

export const BUILTIN_ENGINES = { dsh: "DSH", codex: "Codex" }
export const EXECUTOR_ACTIONS = new Set(["save-executor", "toggle-executor", "set-default-executor"])

export function builtinExecutorId(engine) {
  return `local-${engine}`
}

export function createExecutorManager({ store, codexSandbox, atomic, presets, models, workdir }) {
  function get(id) {
    const executor = typeof id === "string" ? store.get(id) : null
    if (!executor) throw new BoardError(404, "找不到这个执行器。")
    return executor
  }

  function seed() {
    for (const [engine, name] of Object.entries(BUILTIN_ENGINES)) {
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
      throw new BoardError(400, "请选择 DSH 或 Codex。")
    }
    if (existing && input.engine !== undefined && input.engine !== engine) {
      throw new BoardError(400, "执行器类型固定。")
    }

    const sandbox = engine === "codex" ? (input.sandbox ?? existing?.sandbox ?? codexSandbox) : null
    if (engine === "codex" && !VALID_SANDBOXES.has(sandbox)) {
      throw new BoardError(400, "请选择有效的 Codex 沙箱。")
    }

    const rawWorkdir = typeof input.workdir === "string" ? input.workdir.trim() : ""
    return {
      id: existing?.id ?? randomUUID(),
      engine,
      name: requireText(input.name, 80, "名称"),
      enabled: existing?.enabled ?? true,
      workdir: rawWorkdir ? resolveWorkspace(rawWorkdir) : null,
      preset: engine === "dsh" && input.preset ? requireText(input.preset, 120, "DSH 预设") : null,
      sandbox,
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
