import { useEffect, useState } from "react"
import { request } from "../api"
import type { Run, Transcript } from "../contracts"

export function useConversation(cardId: string, latest: Run | undefined) {
  const [transcript, setTranscript] = useState<Transcript>()
  const [error, setError] = useState("")
  const runId = latest?.id
  const active = latest?.status === "running"
  useEffect(() => {
    const controller = new AbortController()
    let poll: ReturnType<typeof setTimeout>
    async function update() {
      try {
        const next = await request<Transcript>(`conversation?card=${encodeURIComponent(cardId)}`, { signal: controller.signal })
        if (controller.signal.aborted) return
        setTranscript(next)
        setError("")
      } catch (error) {
        if (!controller.signal.aborted) setError((error as Error).message)
      }
      if (active && !controller.signal.aborted) poll = setTimeout(update, 450)
    }
    void update()
    return () => { controller.abort(); clearTimeout(poll) }
  }, [cardId, runId, active])
  return { transcript, error }
}
