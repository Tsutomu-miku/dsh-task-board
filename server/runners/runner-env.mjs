export function runnerEnv(executor) {
  const env = { ...process.env, ...executor.env }
  for (const name of executor.secretEnv ?? []) {
    if (Object.hasOwn(process.env, name)) env[name] = process.env[name]
    else delete env[name]
  }
  return env
}
