import { useEffect, useState } from "react"
import { fetchConversation } from "../../shared/api/client"
import type { RunRecord, Transcript } from "../../shared/types/board"

export function useConversation(cardId: string, latestRun: RunRecord | undefined) {
  const [transcript, setTranscript] = useState<Transcript>()
  const [error, setError] = useState("")
  const runId = latestRun?.id
  const active = latestRun?.status === "running"

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined

    async function poll() {
      try {
        const next = await fetchConversation(cardId, controller.signal)
        if (controller.signal.aborted) return
        setTranscript(next)
        setError("")
      } catch (err) {
        if (!controller.signal.aborted) setError((err as Error).message)
      }
      if (active && !controller.signal.aborted) {
        timer = setTimeout(poll, 450)
      }
    }

    void poll()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [cardId, runId, active])

  return { transcript, error }
}
