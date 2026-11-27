import { useId, useState, type FormEvent } from "react"
import { ChevronDown } from "lucide-react"
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

const selectClassName = "h-9 w-full rounded-md border bg-card px-2"

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
  const [prompt, setPrompt] = useState(existing?.brief ?? existing?.prompt ?? "")
  const [executorId, setExecutorId] = useState(existing?.executorId ?? preferredExecutorId ?? enabledExecutors[0]?.id ?? "")
  const [workdir, setWorkdir] = useState(existing?.workdir ?? "")
  const [workspaceMode, setWorkspaceMode] = useState(existing?.workspaceMode ?? (existing?.runs.some(run => run.delivery?.branch === `board/${existing.id}`) ? "isolated" : "shared"))
  const [autoRun, setAutoRun] = useState(false)
  const [showOptions, setShowOptions] = useState(Boolean(existing))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const optionsId = useId()

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
          workspaceMode,
        })
      } else {
        await save({
          action: "create",
          title,
          prompt,
          executorId,
          autoRun,
          ...(workdir.trim() ? { workdir: workdir.trim() } : {}),
          workspaceMode,
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
          <DialogDescription className="sr-only">
            {existing ? "修改任务信息和运行设置。" : "填写任务名称、说明并选择由谁执行。"}
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-1.5">
            <Label htmlFor="task-title">任务名称</Label>
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
            <Label htmlFor="task-prompt">任务说明</Label>
            <Textarea
              id="task-prompt"
              className="min-h-28 resize-y"
              placeholder="要做什么？做到什么程度算完成？"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              required
              maxLength={16000}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="task-executor">由谁执行</Label>
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

          {!existing && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-[var(--board-brand)]" checked={autoRun}
                onChange={event => setAutoRun(event.target.checked)} disabled={busy} />
              创建后自动运行
            </label>
          )}

          <div className="rounded-xl border">
            <button type="button" className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm
              font-medium hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-expanded={showOptions} aria-controls={optionsId} onClick={() => setShowOptions(open => !open)}>
              <span>运行设置 <span className="font-normal text-muted-foreground">（可选）</span></span>
              <ChevronDown className={showOptions ? "size-4 shrink-0 rotate-180" : "size-4 shrink-0"} aria-hidden="true" />
            </button>
            <div id={optionsId} hidden={!showOptions}>
              {showOptions && <div className="grid gap-4 border-t p-3">
                <div className="grid gap-1">
                  <Label htmlFor="task-workdir">工作目录</Label>
                  <Input id="task-workdir" placeholder={inheritedDir} value={workdir} onChange={e => setWorkdir(e.target.value)} />
                  <p className="break-all text-xs text-muted-foreground">
                    {chosen?.workdir ? `所选执行器固定使用 ${chosen.workdir}。` : "留空使用默认目录。"}
                    {workspaceHost === "wsl" && "可填写 WSL 路径或已挂载的 Windows 路径。"}
                  </p>
                </div>
                <label className="grid gap-1 text-sm">Git 工作区模式
                  <select className={selectClassName} value={workspaceMode}
                    onChange={event => setWorkspaceMode(event.target.value as typeof workspaceMode)}>
                    <option value="shared">当前目录（默认）</option>
                    <option value="isolated">独立工作树</option>
                  </select>
                </label>
                {workspaceMode === "isolated" && <p className="text-xs text-muted-foreground">
                  在独立目录和 board/ 分支中运行。可在「变更」查看改动，合回与清理可用 Git 处理。
                </p>}
              </div>}
            </div>
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
