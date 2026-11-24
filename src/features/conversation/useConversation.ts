import { useEffect, useRef, useState } from "react"
import { fetchConversation } from "../../shared/api/client"
import { pollWhileVisible } from "../../shared/lib/visible-polling"
import type { RunRecord, Transcript } from "../../shared/types/board"

export function useConversation(cardId: string, latestRun: RunRecord | undefined) {
  const [transcript, setTranscript] = useState<Transcript>()
  const [error, setError] = useState("")
  const cursor = useRef({ cardId, after: 0 })
  const runId = latestRun?.id
  const active = latestRun?.status === "running"

  useEffect(() => {
    if (cursor.current.cardId !== cardId) {
      cursor.current = { cardId, after: 0 }
      setTranscript(undefined)
    }
    return pollWhileVisible(async signal => {
      try {
        const next = await fetchConversation(cardId, cursor.current.after, signal)
        if (signal.aborted) return
        cursor.current.after = next.replies[next.replies.length - 1]?.id ?? cursor.current.after
        setTranscript(previous => {
          if (!previous) return next
          if (!next.replies.length && previous.preview?.runId === next.preview?.runId &&
              previous.preview?.text === next.preview?.text) return previous
          return {
            replies: next.replies.length ? [...previous.replies, ...next.replies] : previous.replies,
            preview: next.preview,
          }
        })
        setError("")
      } catch (err) {
        if (!signal.aborted) setError((err as Error).message)
      }
    }, active ? 450 : undefined)
  }, [cardId, runId, active])

  return { transcript, error }
}
