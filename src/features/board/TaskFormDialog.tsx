import { useState, type FormEvent } from "react"
import { Cpu, FileText, FolderOpen, Type } from "lucide-react"
import { EngineAvatar } from "../../shared/components/engine-badge"
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
import { Input } from "../../shared/components/ui/input"
import { Label } from "../../shared/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../shared/components/ui/select"
import { Textarea } from "../../shared/components/ui/textarea"
import { ENGINES, type BoardSaveFn, type Executor, type TaskItem } from "../../shared/types/board"

export function TaskFormDialog({
  existing,
  executors,
  preferredExecutorId,
  defaultWorkdir,
  workspaceHost,
  onClose,
  save,
}: {
  existing?: TaskItem
  executors: Executor[]
  preferredExecutorId: string | null
  defaultWorkdir: string
  workspaceHost?: "wsl" | "local"
  onClose: () => void
  save: BoardSaveFn
}) {
  const enabledExecutors = executors.filter(row => row.enabled)
  const [title, setTitle] = useState(existing?.title ?? "")
  const [prompt, setPrompt] = useState(existing?.prompt ?? "")
  const [executorId, setExecutorId] = useState(existing?.executorId ?? preferredExecutorId ?? enabledExecutors[0]?.id ?? "")
  const [workdir, setWorkdir] = useState(existing?.workdir ?? "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const chosen = executors.find(row => row.id === executorId && row.enabled)
  const inheritedDir = chosen?.workdir ?? defaultWorkdir

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (busy || (!existing && !chosen)) return
    setBusy(true)
    setError("")
    try {
      if (existing) {
        await save({
          action: "update",
          id: existing.id,
          from: existing.status,
          title,
          prompt,
          ...(chosen ? { executorId: chosen.id } : {}),
          workdir: workdir.trim(),
        })
      } else {
        await save({
          action: "create",
          title,
          prompt,
          executorId,
          ...(workdir.trim() ? { workdir: workdir.trim() } : {}),
        })
      }
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{existing ? "编辑任务" : "新建任务"}</DialogTitle>
          <DialogDescription>
            {existing ? "更新任务标题、执行器、工作目录或任务说明。" : "为任务指定执行器和说明，创建后可在会话中启动或继续追问。"}
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-1.5">
            <Label htmlFor="task-title">
              <Type className="size-3.5 text-muted-foreground" aria-hidden="true" />
              标题
            </Label>
            <Input
              id="task-title"
              placeholder="例如：排查容器镜像升级脚本"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              maxLength={120}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="task-executor">
              <Cpu className="size-3.5 text-muted-foreground" aria-hidden="true" />
              执行器
            </Label>
            <Select value={chosen ? executorId : ""} onValueChange={setExecutorId}>
              <SelectTrigger id="task-executor" className="w-full">
                <SelectValue placeholder="选择已启用的执行器" />
              </SelectTrigger>
              <SelectContent>
                {enabledExecutors.map(row => (
                  <SelectItem key={row.id} value={row.id}>
                    <span className="flex items-center gap-2">
                      <EngineAvatar engine={row.engine} size="xs" />
                      {row.name}{row.name !== ENGINES[row.engine] ? ` · ${ENGINES[row.engine]}` : ""}
                      {row.model ? ` (${row.model.id})` : ""}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="task-workdir">
              <FolderOpen className="size-3.5 text-muted-foreground" aria-hidden="true" />
              工作目录
              <span className="text-xs font-normal text-muted-foreground">（可选）</span>
            </Label>
            <Input
              id="task-workdir"
              placeholder={`留空默认使用：${inheritedDir}`}
              value={workdir}
              onChange={e => setWorkdir(e.target.value)}
            />
            {workspaceHost === "wsl" && (
              <p className="text-xs text-muted-foreground">
                支持 WSL 绝对路径（如 /home/...）或已挂载的 Windows 路径（如 D:\project）。
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="task-prompt">
              <FileText className="size-3.5 text-muted-foreground" aria-hidden="true" />
              任务说明
            </Label>
            <Textarea
              id="task-prompt"
              className="min-h-28 resize-y"
              placeholder="描述任务背景、目标与验收标准…"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              required
              maxLength={16000}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={busy || (!existing && !chosen)}>
              {existing ? "保存修改" : "创建任务"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
