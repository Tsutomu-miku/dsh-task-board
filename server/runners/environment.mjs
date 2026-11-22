import { execFile } from "node:child_process"
import { readCodexModels } from "./codex-models.mjs"

const ttl = 15000

function codexVersion(workdir) {
  return new Promise(resolve => {
    execFile("codex", ["--version"], { cwd: workdir, timeout: 3000, maxBuffer: 4096 }, (error, stdout) => {
      resolve(error ? null : stdout.trim().slice(0, 80))
    })
  })
}

export function createEnvironment(ctx) {
  const cache = new Map()
  function cached(key, read, refresh) {
    const previous = cache.get(key)
    if (previous && (previous.pending || (!refresh && previous.expires > Date.now()))) return previous.result
    const entry = { pending: true, expires: 0, result: null }
    entry.result = Promise.resolve().then(read).then(value => {
      entry.expires = Date.now() + ttl
      return value
    }).catch(error => {
      if (cache.get(key) === entry) cache.delete(key)
      throw error
    }).finally(() => { entry.pending = false })
    cache.set(key, entry)
    if (cache.size > 20) cache.delete(cache.keys().next().value)
    return entry.result
  }
  const dshCatalog = refresh => cached("dsh", () => ctx.sessionController.modelCatalog(), refresh)
  function flattenDsh(catalog) {
    return catalog.groups.flatMap(group => group.models.map(model => ({
      id: model.id, name: model.name, provider: group.id, providerName: group.name,
      efforts: model.reasoning?.efforts ?? [],
    })))
  }
  const codexCatalog = (workdir, refresh) => cached(`codex:${workdir}`, () => readCodexModels(workdir), refresh)
  return {
    async models(engine, workdir) {
      return engine === "dsh" ? flattenDsh(await dshCatalog(false)) : codexCatalog(workdir, false)
    },
    async read(workdir, refresh = false) {
      const [presets, dsh, codex, version] = await Promise.allSettled([
        ctx.agentPresets.list(), dshCatalog(refresh), codexCatalog(workdir, refresh), codexVersion(workdir),
      ])
      const catalog = dsh.status === "fulfilled" ? dsh.value : null
      return {
        presets: presets.status === "fulfilled" ? presets.value.map(({ id, name, broken }) => ({ id, name, available: !broken })) : [],
        dshModel: catalog?.default?.model ?? null,
        codexVersion: version.status === "fulfilled" ? version.value : null,
        models: {
          dsh: catalog ? flattenDsh(catalog) : [],
          codex: codex.status === "fulfilled" ? codex.value : [],
        },
      }
    },
  }
}
