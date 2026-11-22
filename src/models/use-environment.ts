import { useEffect, useState } from "react"
import { request } from "../api"
import type { Environment } from "../contracts"

export function useEnvironment(workspace: string | null, enabled = true) {
  const [state, setState] = useState<{ workspace: string | null; data: Environment | null; error: string }>()
  const [refresh, setRefresh] = useState(0)
  const [checking, setChecking] = useState(true)
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    setChecking(true)
    const params = new URLSearchParams(workspace ? { workspace } : {})
    if (refresh) params.set("refresh", "1")
    void request<Environment>(`environment?${params}`, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setState({ workspace, data, error: "" })
    }).catch(error => {
      if (!controller.signal.aborted) setState({ workspace, data: null, error: error.message })
    }).finally(() => { if (!controller.signal.aborted) setChecking(false) })
    return () => controller.abort()
  }, [workspace, enabled, refresh])
  const matches = state?.workspace === workspace
  return {
    environment: matches ? state?.data ?? null : null,
    checking: enabled && (!matches || checking),
    error: matches ? state?.error ?? "" : "",
    reload: () => setRefresh(key => key + 1),
  }
}
