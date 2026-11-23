import { useCallback, useEffect, useState } from "react"
import { fetchEnvironment } from "../api/client"
import type { EnvironmentInfo } from "../types/board"

export function useEnvironment(workspace: string | null, enabled = true) {
  const [state, setState] = useState<{
    workspace: string | null
    data: EnvironmentInfo | null
    error: string
  }>()
  const [refreshTick, setRefreshTick] = useState(0)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    setChecking(true)
    void fetchEnvironment(workspace, refreshTick > 0, controller.signal)
      .then(data => {
        if (!controller.signal.aborted) {
          setState({ workspace, data, error: "" })
        }
      })
      .catch(err => {
        if (!controller.signal.aborted) {
          setState({ workspace, data: null, error: (err as Error).message })
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setChecking(false)
        }
      })

    return () => controller.abort()
  }, [workspace, enabled, refreshTick])

  const matches = state?.workspace === workspace
  const reload = useCallback(() => setRefreshTick(n => n + 1), [])

  return {
    environment: matches ? (state?.data ?? null) : null,
    checking: enabled && (!matches || checking),
    error: matches ? (state?.error ?? "") : "",
    reload,
  }
}
