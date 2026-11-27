import { useEffect, useState } from "react"
import { fetchDelivery } from "../../shared/api/client"
import { Alert, AlertDescription } from "../../shared/components/ui/alert"
import { Button } from "../../shared/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../shared/components/ui/dialog"
import type { GitDelivery } from "../../shared/types/board"

export function ChangesDrawer({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const [delivery, setDelivery] = useState<GitDelivery | null>()
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState("")

  useEffect(() => {
    const controller = new AbortController()
    setError("")
    void fetchDelivery(taskId, false, controller.signal).then(({ git }) => setDelivery(git)).catch(err => {
      if (!controller.signal.aborted) setError((err as Error).message)
    })
    return () => controller.abort()
  }, [taskId, revision])

  return <Dialog open onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent className="top-0 right-0 left-auto h-dvh max-w-full translate-x-0 translate-y-0 content-start gap-4 overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>变更</DialogTitle>
        <DialogDescription>查看任务工作目录中的 Git 文件改动。</DialogDescription>
      </DialogHeader>
      <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setRevision(value => value + 1)}>刷新</Button>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
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
