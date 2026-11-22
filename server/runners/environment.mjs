import { execFile } from "node:child_process"

function codexVersion() {
  return new Promise(resolve => {
    execFile("codex", ["--version"], { timeout: 3000, maxBuffer: 4096 }, (error, stdout) => {
      resolve(error ? null : stdout.trim().slice(0, 80))
    })
  })
}

export async function readEnvironment(ctx) {
  const [presets, catalog, codex] = await Promise.allSettled([
    ctx.agentPresets.list(), ctx.sessionController.modelCatalog(), codexVersion(),
  ])
  const model = catalog.status === "fulfilled" ? catalog.value.default : null
  return {
    presets: presets.status === "fulfilled" ? presets.value.map(({ id, name, broken }) => ({ id, name, available: !broken })) : [],
    dshModel: model?.model ?? null,
    codexVersion: codex.status === "fulfilled" ? codex.value : null,
  }
}
