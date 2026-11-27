import { useEffect, useState } from "react"
import { fetchDelivery } from "../../shared/api/client"
import { Alert, AlertDescription } from "../../shared/components/ui/alert"
import { Button } from "../../shared/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../shared/components/ui/dialog"
import type { BoardSaveFn, GitDelivery, TaskWorktree } from "../../shared/types/board"
import { WorktreeDetails } from "../board/WorktreeDetails"

export function ChangesDrawer({ taskId, onClose, save }: { taskId: string; onClose: () => void; save: BoardSaveFn }) {
  const [delivery, setDelivery] = useState<GitDelivery | null>()
  const [worktrees, setWorktrees] = useState<TaskWorktree[]>([])
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<{ id: string; action: "merge-worktree" | "cleanup-worktree" }>()

  useEffect(() => {
    const controller = new AbortController()
    void fetchDelivery(taskId, false, controller.signal).then(result => {
      setDelivery(result.git)
      setWorktrees(result.worktrees)
    }).catch(err => {
      if (!controller.signal.aborted) setError((err as Error).message)
    })
    return () => controller.abort()
  }, [taskId, revision])

  async function act(item: TaskWorktree, action: "merge-worktree" | "cleanup-worktree") {
    if ((action === "merge-worktree" || item.risks.length) && (confirm?.id !== item.id || confirm.action !== action)) {
      setConfirm({ id: item.id, action })
      return
    }
    setBusy(true)
    setError("")
    try {
      if (action === "merge-worktree" && item.target) {
        await save({ action, id: taskId, worktreeId: item.id, target: item.target })
      } else if (action === "cleanup-worktree") {
        await save({ action, id: taskId, worktreeId: item.id, confirmations: item.confirmation ? [item.confirmation] : [] })
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setConfirm(undefined)
      setBusy(false)
      setRevision(value => value + 1)
    }
  }

  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
    <DialogContent className="top-0 right-0 left-auto h-dvh max-w-full translate-x-0 translate-y-0 content-start gap-4 overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>变更</DialogTitle>
        <DialogDescription>查看任务工作目录中的 Git 文件改动。</DialogDescription>
      </DialogHeader>
      <Button variant="outline" size="sm" disabled={busy} className="justify-self-start" onClick={() => {
        setConfirm(undefined)
        setError("")
        setRevision(value => value + 1)
      }}>刷新</Button>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {worktrees.map(item => <section key={item.id} className="grid min-w-0 gap-2 rounded-lg border p-3">
        <WorktreeDetails worktree={item} />
        {item.legacyTarget && <p className="text-xs text-muted-foreground">此工作树来自旧版，合回前请核对原目录当前分支。</p>}
        {item.mergeError && <p className="text-xs text-muted-foreground">{item.mergeError}</p>}
        {item.cleanupError && item.cleanupError !== item.mergeError && <p className="text-xs text-destructive">{item.cleanupError}</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="xs" variant="outline" disabled={busy || Boolean(item.mergeError) || !item.target}
            onClick={() => void act(item, "merge-worktree")}>
            {confirm?.id === item.id && confirm.action === "merge-worktree" ? `确认合回 ${item.target}` : "合回工作树"}
          </Button>
          <Button size="xs" variant="outline" disabled={busy || Boolean(item.cleanupError)}
            onClick={() => void act(item, "cleanup-worktree")}>
            {confirm?.id === item.id && confirm.action === "cleanup-worktree" ? "确认丢弃并清理" : "清理工作树"}
          </Button>
          {confirm?.id === item.id && <Button size="xs" variant="ghost" disabled={busy}
            onClick={() => setConfirm(undefined)}>取消</Button>}
        </div>
      </section>)}
      {delivery === undefined && !error && <p role="status" className="text-sm text-muted-foreground">正在读取 Git 变更…</p>}
      {delivery === null && <p className="text-sm text-muted-foreground">工作目录没有可读取的 Git 提交。</p>}
      {delivery && <section className="grid min-w-0 gap-3 text-sm">
        <div className="grid gap-1">
          <p className="break-all font-mono">{delivery.branch ?? "分离 HEAD"} · {delivery.commit.slice(0, 12)}</p>
          <p className="break-all text-xs text-muted-foreground">{delivery.workdir}</p>
          <p className="text-xs text-muted-foreground">基准提交 {delivery.baseCommit.slice(0, 12)}</p>
        </div>
        {delivery.files.length ? <ul className="max-h-48 overflow-auto rounded-lg border p-2">
          {delivery.files.map(file => <li key={file} className="break-all px-1 py-0.5 font-mono text-xs">{file}</li>)}
        </ul> : <p className="text-muted-foreground">暂无文件改动。</p>}
        {delivery.diff && <pre className="overflow-auto rounded-lg bg-secondary p-3 text-xs">{delivery.diff}</pre>}
        {delivery.diffTruncated && <p className="text-xs text-muted-foreground">补丁预览不完整，可按文件列表在 Git 中查看。</p>}
      </section>}
    </DialogContent>
  </Dialog>
}
