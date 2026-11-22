import { useCallback, useEffect, useRef, useState } from "react"
import { request } from "./api"
import type { BoardData } from "./contracts"

export function useBoard() {
  const [board, setBoard] = useState<BoardData | null>(null)
  const [error, setError] = useState("")
  const revision = useRef(0)
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const current = ++revision.current
    try {
      const data = await request<BoardData>("state", { signal })
      if (current === revision.current && !signal?.aborted) {
        setBoard(data)
        setError("")
      }
    } catch (error) {
      if (current === revision.current && !signal?.aborted) setError((error as Error).message)
    }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      await refresh(controller.signal)
      if (!controller.signal.aborted) timer = setTimeout(poll, 1500)
    }
    void poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [refresh])

  async function save(input: object) {
    await request("action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) })
    await refresh()
  }
  return { board, error, save }
}
