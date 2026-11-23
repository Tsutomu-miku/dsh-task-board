import { useCallback, useEffect, useRef, useState } from "react"
import { fetchBoardState, postBoardAction } from "../api/client"
import type { BoardAction, BoardState } from "../types/board"

const POLL_INTERVAL_MS = 1800

export function useBoard() {
  const [board, setBoard] = useState<BoardState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const revisionRef = useRef(0)
  const snapshotRef = useRef("")

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const seq = ++revisionRef.current
    try {
      const next = await fetchBoardState(signal)
      if (seq !== revisionRef.current || signal?.aborted) return
      const serialized = JSON.stringify(next)
      if (serialized !== snapshotRef.current) {
        snapshotRef.current = serialized
        setBoard(next)
      }
      setError("")
    } catch (err) {
      if (seq === revisionRef.current && !signal?.aborted) {
        setError((err as Error).message)
      }
    } finally {
      if (seq === revisionRef.current && !signal?.aborted) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined

    async function poll() {
      if (document.visibilityState === "visible") {
        await refresh(controller.signal)
      }
      if (!controller.signal.aborted) {
        timer = setTimeout(poll, POLL_INTERVAL_MS)
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible" && !controller.signal.aborted) {
        clearTimeout(timer)
        void poll()
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange)
    void poll()

    return () => {
      controller.abort()
      clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [refresh])

  const save = useCallback(async (input: BoardAction) => {
    await postBoardAction(input)
    await refresh()
  }, [refresh])

  return { board, loading, error, save, refresh }
}
