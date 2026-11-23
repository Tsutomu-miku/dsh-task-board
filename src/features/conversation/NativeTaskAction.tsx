import { useEffect, useState } from "react"
import { Kanban } from "lucide-react"
import { fetchBoardState } from "../../shared/api/client"
import { Button } from "../../shared/components/ui/button"

export function NativeTaskAction({ sessionId, openDetails }: { sessionId: string; openDetails: (id: string) => void }) {
  const [link, setLink] = useState<{ sessionId: string; taskId: string }>()
  useEffect(() => {
    if (!sessionId) return
    const request = new AbortController()
    void fetchBoardState(request.signal).then(board => {
      if (request.signal.aborted) return
      const task = board.cards.find(card => card.engine === "dsh" && card.session === sessionId)
        ?? board.cards.find(card => card.runs.some(run => run.executor.engine === "dsh" && run.session === sessionId))
      setLink(task ? { sessionId, taskId: task.id } : undefined)
    }).catch(() => {
      if (!request.signal.aborted) setLink(undefined)
    })
    return () => request.abort()
  }, [sessionId])

  if (!link || link.sessionId !== sessionId) return null
  return (
    <div className="dsh-task-board">
      <Button variant="ghost" size="sm" onClick={() => openDetails(link.taskId)}>
        <Kanban className="size-3.5" aria-hidden="true" />任务详情
      </Button>
    </div>
  )
}
