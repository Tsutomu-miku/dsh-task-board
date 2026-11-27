import { useCallback, useEffect, useRef, useState } from "react"
import { fetchBoardState, postBoardAction } from "../api/client"
import type { BoardAction, BoardState } from "../types/board"

const POLL_INTERVAL_MS = 1800

export function useBoard() {
  const [board, setBoard] = useState<BoardState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const revisionRef = useRef(0)
  const snapshotRef = useRef<BoardState | null>(null)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const seq = ++revisionRef.current
    try {
      const next = await fetchBoardState(snapshotRef.current?.revision ?? 0, signal)
      if (seq !== revisionRef.current || signal?.aborted) return
      if (!("unchanged" in next)) {
        let cards = next.cards
        if (next.delta && snapshotRef.current) {
          const merged = new Map(snapshotRef.current.cards.map(card => [card.id, card]))
          for (const id of next.removed ?? []) merged.delete(id)
          for (const card of next.cards) merged.set(card.id, card)
          cards = [...merged.values()].sort((a, b) => a.created - b.created)
        }
        snapshotRef.current = { ...next, cards }
        setBoard(snapshotRef.current)
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
