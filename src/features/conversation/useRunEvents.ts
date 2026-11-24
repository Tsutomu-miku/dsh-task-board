import { useEffect, useState } from "react"
import { fetchRunActivity } from "../../shared/api/client"
import { pollWhileVisible } from "../../shared/lib/visible-polling"
import type { RunEvent, RunRecord } from "../../shared/types/board"

const PAGE_SIZE = 50

export function useRunEvents(run: RunRecord) {
  const [opened, setOpened] = useState(false)
  const [cursors, setCursors] = useState<number[]>([])
  const [page, setPage] = useState<{ rows: RunEvent[]; hasOlder: boolean }>()
  const [latestCommand, setLatestCommand] = useState<string | null>(null)
  const [error, setError] = useState("")
  const active = run.status === "running"
  const before = cursors[cursors.length - 1]

  useEffect(() => {
    if (!opened && !active) return
    let current: typeof page
    return pollWhileVisible(async signal => {
      try {
        const after = before === undefined ? current?.rows[current.rows.length - 1]?.seq : undefined
        const includeEvents = opened && (before === undefined || !current)
        const next = await fetchRunActivity(run.id, {
          before: includeEvents ? before : undefined,
          after: includeEvents ? after : undefined,
          limit: includeEvents ? PAGE_SIZE : 0,
        }, signal)
        if (signal.aborted) return
        setLatestCommand(next.latestCommand)
        if (includeEvents && (!current || next.events.length)) {
          const rows = after === undefined ? next.events : [...(current?.rows ?? []), ...next.events]
          current = {
            rows: rows.slice(-PAGE_SIZE),
            hasOlder: next.hasMore || rows.length > PAGE_SIZE || (current?.hasOlder ?? false),
          }
          setPage(current)
        }
        setError("")
      } catch (err) {
        if (!signal.aborted) setError((err as Error).message)
      }
    }, active ? 650 : undefined)
  }, [run.id, active, opened, before])

  function onOpenChange(value: boolean) {
    if (value === opened) return
    setOpened(value)
    setCursors([])
    setPage(undefined)
  }

  return {
    opened, onOpenChange, entries: page?.rows ?? null,
    error, latestCommand: active ? latestCommand : null,
    older: page?.hasOlder ? () => {
      const first = page.rows[0].seq
      setPage(undefined)
      setCursors(list => [...list, first])
    } : undefined,
    newer: before !== undefined ? () => {
      setPage(undefined)
      setCursors(list => list.slice(0, -1))
    } : undefined,
  }
}
