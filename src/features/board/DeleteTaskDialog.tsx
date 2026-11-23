import { useState } from "react"
import { Trash2 } from "lucide-react"
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
import type { BoardSaveFn, TaskItem } from "../../shared/types/board"

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

  async function handleDelete() {
    setBusy(true)
    setError("")
    try {
      await save({ action: "delete", id: task.id, from: task.status })
      onClose()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
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

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button type="button" variant="destructive" disabled={busy} onClick={() => void handleDelete()}>
            <Trash2 className="size-3.5" aria-hidden="true" />
            确认删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
