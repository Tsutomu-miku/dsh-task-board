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
  tasks = [],
  executors,
  preferredExecutorId,
  defaultWorkdir,
  workspaceHost,
  onClose,
  save,
}: {
  existing?: TaskItem
  tasks?: TaskItem[]
  executors: Executor[]
  preferredExecutorId: string | null
  defaultWorkdir: string
  workspaceHost?: "wsl" | "local"
  onClose: () => void
  save: BoardSaveFn
}) {
  const enabledExecutors = executors.filter(row => row.enabled)
  const [title, setTitle] = useState(existing?.title ?? "")
  const [prompt, setPrompt] = useState(existing?.brief ?? existing?.prompt ?? "")
  const [executorId, setExecutorId] = useState(existing?.executorId ?? preferredExecutorId ?? enabledExecutors[0]?.id ?? "")
  const [workdir, setWorkdir] = useState(existing?.workdir ?? "")
  const [project, setProject] = useState(existing?.project ?? "")
  const [labels, setLabels] = useState(existing?.labels?.join(", ") ?? "")
  const [priority, setPriority] = useState(existing?.priority ?? 0)
  const [parentId, setParentId] = useState(existing?.parentId ?? "")
  const [stage, setStage] = useState(existing?.stage ?? 0)
  const [blockedBy, setBlockedBy] = useState(existing?.blockedBy ?? [])
  const [blockedReason, setBlockedReason] = useState(existing?.blockedReason ?? "")
  const [workspaceMode, setWorkspaceMode] = useState(existing?.workspaceMode ?? "isolated")
  const [prUrl, setPrUrl] = useState(existing?.prUrl ?? "")
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
      const metadata = {
        project: project.trim() || null,
        labels: labels.split(/[,，]/).map(label => label.trim()).filter(Boolean),
        priority,
        parentId: parentId || null,
        stage: parentId ? stage : 0,
        blockedBy,
        blockedReason: blockedReason.trim() || null,
        workspaceMode,
        prUrl: prUrl.trim() || null,
      }
      if (existing) {
        await save({
          action: "update",
          id: existing.id,
          from: existing.status,
          title,
          prompt,
          ...(chosen ? { executorId: chosen.id } : {}),
          workdir: workdir.trim(),
          ...metadata,
        })
      } else {
        await save({
          action: "create",
          title,
          prompt,
          executorId,
          ...(workdir.trim() ? { workdir: workdir.trim() } : {}),
          ...metadata,
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

          <details className="grid rounded-xl border p-3" open={Boolean(existing?.parentId || existing?.project || existing?.blockedReason)}>
            <summary className="cursor-pointer text-sm font-medium">编排、Git 与交付</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">项目<Input value={project} maxLength={80} onChange={e => setProject(e.target.value)} /></label>
              <label className="grid gap-1 text-sm">标签（逗号分隔）<Input value={labels} onChange={e => setLabels(e.target.value)} /></label>
              <label className="grid gap-1 text-sm">优先级（4 最高）<Input type="number" min="0" max="4" value={priority} onChange={e => setPriority(Number(e.target.value))} /></label>
              <label className="grid gap-1 text-sm">工作区<select className="h-9 rounded-md border bg-card px-2" value={workspaceMode} onChange={e => setWorkspaceMode(e.target.value as typeof workspaceMode)}>
                <option value="isolated">Git 工作树隔离</option><option value="shared">直接使用目录</option>
              </select></label>
              <label className="grid gap-1 text-sm">父任务<select className="h-9 rounded-md border bg-card px-2" value={parentId} onChange={e => setParentId(e.target.value)}>
                <option value="">无</option>
                {tasks.filter(task => task.id !== existing?.id).map(task => <option key={task.id} value={task.id}>{task.title}</option>)}
              </select></label>
              <label className="grid gap-1 text-sm">阶段<Input type="number" min="0" max="100" disabled={!parentId} value={stage} onChange={e => setStage(Number(e.target.value))} /></label>
              <label className="grid gap-1 text-sm sm:col-span-2">前置任务（可多选）<select multiple className="min-h-16 rounded-md border bg-card p-2" value={blockedBy}
                onChange={e => setBlockedBy(Array.from(e.target.selectedOptions, option => option.value))}>
                {tasks.filter(task => task.id !== existing?.id).map(task => <option key={task.id} value={task.id}>{task.title}</option>)}
              </select></label>
              <label className="grid gap-1 text-sm sm:col-span-2">阻塞原因<Input value={blockedReason} onChange={e => setBlockedReason(e.target.value)} maxLength={2000} /></label>
              <label className="grid gap-1 text-sm sm:col-span-2">GitHub PR<Input value={prUrl} onChange={e => setPrUrl(e.target.value)} placeholder="https://github.com/owner/repo/pull/123" /></label>
            </div>
          </details>
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
