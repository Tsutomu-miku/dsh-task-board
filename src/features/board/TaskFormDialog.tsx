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

const priorityLabels = ["普通", "略优先", "优先", "高优先", "最高优先"]
const selectClassName = "h-9 w-full rounded-md border bg-card px-2"

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
  const [autoRun, setAutoRun] = useState(false)
  const [showOptions, setShowOptions] = useState(Boolean(existing))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const optionsId = useId()

  const chosen = executors.find(row => row.id === executorId && row.enabled)
  const inheritedDir = chosen?.workdir ?? defaultWorkdir
  const otherTasks = tasks.filter(task => task.id !== existing?.id)
  const showBlockedReason = existing?.status === "blocked" || Boolean(existing?.blockedReason)

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
        ...(showBlockedReason ? { blockedReason: blockedReason.trim() || null } : {}),
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
          autoRun,
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
              <span>更多选项 <span className="font-normal text-muted-foreground">（可选）</span></span>
              <ChevronDown className={showOptions ? "size-4 shrink-0 rotate-180" : "size-4 shrink-0"} aria-hidden="true" />
            </button>
            <div id={optionsId} hidden={!showOptions}>
              {showOptions && <div className="grid gap-4 border-t p-3">
                <fieldset className="grid gap-2.5">
                  <legend className="mb-2 text-sm font-medium">运行设置</legend>
                  <div className="grid gap-1">
                    <Label htmlFor="task-workdir">工作目录</Label>
                    <Input id="task-workdir" placeholder={inheritedDir} value={workdir} onChange={e => setWorkdir(e.target.value)} />
                    <p className="break-all text-xs text-muted-foreground">
                      {chosen?.workdir ? `所选执行器固定使用 ${chosen.workdir}。` : "留空使用默认目录。"}
                      {workspaceHost === "wsl" && "可填写 WSL 路径或已挂载的 Windows 路径。"}
                    </p>
                  </div>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <label className="grid gap-1 text-sm">Git 项目在哪改代码
                      <select className={selectClassName} value={workspaceMode}
                        onChange={e => setWorkspaceMode(e.target.value as typeof workspaceMode)}>
                        <option value="isolated">独立工作区（默认）</option>
                        <option value="shared">原目录（可用未提交文件）</option>
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm">排队优先级
                      <select className={selectClassName} value={priority} onChange={e => setPriority(Number(e.target.value))}>
                        {priorityLabels.map((label, index) => <option key={label} value={index}>{label}</option>)}
                      </select>
                    </label>
                  </div>
                </fieldset>

                {otherTasks.length > 0 && <section className="grid gap-2.5 border-t pt-3">
                  <h3 className="text-sm font-medium">关联任务</h3>
                  <label className="grid gap-1 text-sm">上级任务
                    <select className={selectClassName} value={parentId} onChange={e => setParentId(e.target.value)}>
                      <option value="">独立任务</option>
                      {otherTasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}
                    </select>
                  </label>
                  {parentId && <div className="grid gap-1">
                    <Label htmlFor="task-stage">子任务顺序</Label>
                    <Input id="task-stage" type="number" min="0" max="100" value={stage}
                      onChange={e => setStage(Number(e.target.value))} />
                    <p className="text-xs text-muted-foreground">数字小的先做，同一个数字的子任务可以一起运行。</p>
                  </div>}
                  <fieldset className="grid gap-1">
                    <legend className="mb-1 text-sm">等哪些任务完成再开始</legend>
                    <div className="grid max-h-40 gap-0.5 overflow-y-auto rounded-md border p-1">
                      {otherTasks.map(task => <label key={task.id} className="flex items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent/50">
                        <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--board-brand)]"
                          checked={blockedBy.includes(task.id)} onChange={e => {
                            const checked = e.currentTarget.checked
                            setBlockedBy(current => checked ? [...current, task.id] : current.filter(id => id !== task.id))
                          }} />
                        <span className="min-w-0 break-words">{task.title}</span>
                      </label>)}
                    </div>
                  </fieldset>
                </section>}

                <section className="grid gap-2.5 border-t pt-3">
                  <h3 className="text-sm font-medium">查找与验收</h3>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <label className="grid gap-1 text-sm">所属项目
                      <Input value={project} maxLength={80} onChange={e => setProject(e.target.value)} />
                    </label>
                    <label className="grid gap-1 text-sm">标签
                      <Input value={labels} placeholder="例如：修复，前端" onChange={e => setLabels(e.target.value)} />
                    </label>
                  </div>
                  <label className="grid gap-1 text-sm">关联 GitHub PR
                    <Input value={prUrl} onChange={e => setPrUrl(e.target.value)} placeholder="粘贴已有的 PR 链接" />
                  </label>
                  {showBlockedReason && <label className="grid gap-1 text-sm">任务为什么暂时不能继续
                    <Input value={blockedReason} onChange={e => setBlockedReason(e.target.value)} maxLength={2000} />
                  </label>}
                </section>
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
