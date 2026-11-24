import { useEffect, useState } from "react"
import { fetchRunEvents } from "../../shared/api/client"
import type { RunEvent, RunRecord } from "../../shared/types/board"

export function useRunEvents(run: RunRecord) {
  const [entries, setEntries] = useState<RunEvent[] | null>(null)
  const [error, setError] = useState("")
  const active = run.status === "running"
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let after = 0
    async function load() {
      try {
        const next = await fetchRunEvents(run.id, after, controller.signal)
        if (controller.signal.aborted) return
        if (after === 0 || next.length > 0) {
          const first = after === 0
          setEntries(previous => first ? next : [...(previous ?? []), ...next])
          after = next[next.length - 1]?.seq ?? after
        }
        setError("")
      } catch (err) {
        if (!controller.signal.aborted) setError((err as Error).message)
      }
      if (active && !controller.signal.aborted) timer = setTimeout(load, 650)
    }
    void load()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [run.id, active])

  let latestCommand
  if (active && entries) {
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].kind === "command") {
        latestCommand = entries[i].message
        break
      }
    }
  }
  return { entries, error, latestCommand }
}
