import { useState, type FormEvent } from "react"
import { Alert, AlertDescription } from "../components/ui/alert"
import { Button } from "../components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select"
import { Textarea } from "../components/ui/textarea"
import { engines, type Executor, type Save } from "../contracts"

export function CreateCardDialog({ close, save, executors, preferred }: {
  close: () => void; save: Save; executors: Executor[]; preferred: string | null;
}) {
  const [title, setTitle] = useState("")
  const [prompt, setPrompt] = useState("")
  const [executorId, setExecutorId] = useState(preferred ?? "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const chosen = executors.find(row => row.id === executorId && row.enabled)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || !chosen) return
    setBusy(true)
    setError("")
    try {
      await save({ action: "create", title, prompt, executorId })
      close()
    } catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  return (
    <Dialog open onOpenChange={open => { if (!open && !busy) close() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建任务</DialogTitle>
          <DialogDescription>选择这张卡片的执行器。</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="task-title">标题</Label>
            <Input id="task-title" value={title} onChange={event => setTitle(event.target.value)} required maxLength={120} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="task-executor">执行器</Label>
            <Select value={chosen ? executorId : ""} onValueChange={setExecutorId}>
              <SelectTrigger id="task-executor"><SelectValue placeholder="选择执行器" /></SelectTrigger>
              <SelectContent>{executors.filter(row => row.enabled).map(row => <SelectItem key={row.id} value={row.id}>{row.name} · {engines[row.engine]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="task-prompt">任务说明</Label>
            <Textarea id="task-prompt" className="min-h-24" value={prompt} onChange={event => setPrompt(event.target.value)} required maxLength={16000} />
          </div>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <DialogFooter><Button disabled={busy || !chosen} type="submit">创建卡片</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
