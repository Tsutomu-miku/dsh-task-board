import { useEffect, useState } from "react"
import { Trash2 } from "lucide-react"
import { fetchWorktrees } from "../../shared/api/client"
import { Alert, AlertDescription } from "../../shared/components/ui/alert"
import { Button } from "../../shared/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../shared/components/ui/dialog"
import type { BoardSaveFn, TaskItem, TaskWorktree } from "../../shared/types/board"
import { WorktreeDetails } from "./WorktreeDetails"

export function DeleteTaskDialog({
  task,
  onClose,
  save,
}: {
  task: TaskItem
  onClose: () => void
  save: BoardSaveFn
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [worktrees, setWorktrees] = useState<TaskWorktree[]>()
  const [confirmed, setConfirmed] = useState(false)
  const [revision, setRevision] = useState(0)
  const risky = worktrees?.filter(item => item.risks.length) ?? []

  useEffect(() => {
    const controller = new AbortController()
    void fetchWorktrees(task.id, controller.signal).then(setWorktrees).catch(err => {
      if (!controller.signal.aborted) setError((err as Error).message)
    })
    return () => controller.abort()
  }, [task.id, revision])

  async function handleDelete() {
    if (risky.length && !confirmed) {
      setConfirmed(true)
      return
    }
    setBusy(true)
    setError("")
    try {
      await save({ action: "delete", id: task.id, from: task.status,
        confirmations: risky.flatMap(item => item.confirmation ? [item.confirmation] : []) })
      onClose()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
      setConfirmed(false)
      setWorktrees(undefined)
      setRevision(value => value + 1)
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>删除任务卡片</DialogTitle>
          <DialogDescription>
            确认删除「{task.title}」吗？该卡片在看板中保存的对话记录与运行日志将一并清除，且无法恢复。
          </DialogDescription>
        </DialogHeader>

        {worktrees === undefined && !error && <p role="status" className="text-sm text-muted-foreground">正在检查任务工作树…</p>}
        {!!worktrees?.length && <section className="grid max-h-56 gap-2 overflow-auto rounded-lg border p-3">
          <p className="text-sm font-medium">同时清理以下工作树及任务分支</p>
          {worktrees.map(item => <div key={item.id} className="grid gap-1">
            <WorktreeDetails worktree={item} />
            {item.cleanupError && <p className="text-xs text-destructive">{item.cleanupError}</p>}
          </div>)}
        </section>}
        {confirmed && <Alert variant="destructive"><AlertDescription>
          清理后将丢弃上面列出的未合回内容。再次确认才会删除。
        </AlertDescription></Alert>}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button type="button" variant="destructive" disabled={busy || !worktrees || worktrees.some(item => item.cleanupError)} onClick={() => void handleDelete()}>
            <Trash2 className="size-3.5" aria-hidden="true" />
            {confirmed ? "仍要删除并清理" : "确认删除"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
