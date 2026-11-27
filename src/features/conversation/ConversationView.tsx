import { useEffect, useState } from "react"
import { ArrowLeft, ExternalLink, FolderOpen, GitCompare, History, Pencil } from "lucide-react"
import { fetchDelivery } from "../../shared/api/client"
import { Alert, AlertDescription } from "../../shared/components/ui/alert"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../shared/components/ui/dialog"
import { Textarea } from "../../shared/components/ui/textarea"
import { Button } from "../../shared/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../shared/components/ui/select"
import { EngineChip } from "../../shared/components/engine-badge"
import { TaskStatusIcon, TaskStatusPill } from "../../shared/components/status-badge"
import { formatShortPath } from "../../shared/lib/format"
import { COLUMNS, type BoardSaveFn, type DefaultSendMode, type Executor, type GitDelivery, type QueuedMessage, type TaskItem, type TaskStatus } from "../../shared/types/board"
import { TaskFormDialog } from "../board/TaskFormDialog"
import { ComposerBox } from "./ComposerBox"
import { MessageStream } from "./MessageStream"
import { RunHistoryDialog } from "./RunHistoryDialog"
import { ChangesDrawer } from "./ChangesDrawer"
import { useConversation } from "./useConversation"

export function ConversationView({
  task,
  executors,
  defaultWorkdir,
  workspaceHost,
  running,
  queue,
  defaultSendMode,
  onBack,
  save,
  openSession,
}: {
  task: TaskItem
  executors: Executor[]
  defaultWorkdir: string
  workspaceHost?: "wsl" | "local"
  running?: TaskItem
  queue: QueuedMessage[]
  defaultSendMode: DefaultSendMode
  onBack: () => void
  save: BoardSaveFn
  openSession: (id: string) => void
}) {
  const executor = executors.find(row => row.id === task.executorId)
  const { transcript, error } = useConversation(task.id, task.runs[0])
  const [showHistory, setShowHistory] = useState(false)
  const [editing, setEditing] = useState(false)
  const [showChanges, setShowChanges] = useState(false)
  const [git, setGit] = useState<GitDelivery | null>(task.runs[0]?.delivery ?? null)
  const [blockReason, setBlockReason] = useState<string | null>(null)
  const [moveError, setMoveError] = useState("")
  const active = task.status === "running"

  const latest = task.runs[0]
  const effectiveWorkdir = latest?.executor.workdir ?? executor?.workdir ?? task.workdir

  useEffect(() => {
    const controller = new AbortController()
    void fetchDelivery(task.id, true, controller.signal).then(({ git }) => setGit(git)).catch(() => {})
    return () => controller.abort()
  }, [task.id, effectiveWorkdir, latest?.id, latest?.status, showChanges])

  async function handleStatusChange(status: TaskStatus, reason?: string) {
    setMoveError("")
    if (status === "blocked" && reason === undefined) {
      setBlockReason(task.blockedReason ?? "")
      return
    }
    try {
      await save({ action: "move", id: task.id, from: task.status, status, blockedReason: reason })
      setBlockReason(null)
    } catch (err) {
      setMoveError((err as Error).message)
    }
  }

  return (
    <section data-task-conversation className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]">
      <header className="conversation-topbar relative z-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon-sm" aria-label="返回看板" title="返回看板" onClick={onBack}>
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Button>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="truncate text-sm leading-5 font-semibold text-foreground" title={task.title}>
                  {task.title}
                </h1>
                {!active && !task.archived && (
                  <button
                    type="button"
                    aria-label="编辑任务信息"
                    title="编辑任务"
                    onClick={() => setEditing(true)}
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Pencil className="size-3.5" strokeWidth={1.8} />
                  </button>
                )}
              </div>
              <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <EngineChip engine={task.engine} label={executor?.name} />
                <span className="inline-flex min-w-0 items-center gap-1 truncate" title={task.workdir}>
                  <FolderOpen className="size-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{formatShortPath(task.workdir)}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {active || task.archived ? (
              <TaskStatusPill status={task.status} className="h-8 px-3" />
            ) : (
              <Select value={task.status} onValueChange={value => void handleStatusChange(value as TaskStatus)}>
                <SelectTrigger size="sm" aria-label="变更任务状态">
                  <TaskStatusIcon status={task.status} />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLUMNS.filter(col => col.status !== "running").map(col => (
                    <SelectItem key={col.status} value={col.status}>
                      {col.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {git && <Button variant="outline" size="sm" onClick={() => setShowChanges(true)}>
              <GitCompare className="size-3.5" aria-hidden="true" />变更
              <span className="rounded-full bg-secondary px-1.5 text-[11px] tabular-nums">{git.fileCount ?? git.files.length}</span>
            </Button>}
            {(task.status === "done" || task.archived) && <Button variant="ghost" size="sm" onClick={() => {
              void save({ action: "archive", id: task.id, archived: !task.archived }).catch(err => setMoveError((err as Error).message))
            }}>{task.archived ? "恢复任务" : "归档"}</Button>}

            <Button variant="outline" size="sm" onClick={() => setShowHistory(true)}>
              <History className="size-3.5" aria-hidden="true" />
              <span>运行记录</span>
              {task.runs.length > 0 && (
                <span className="rounded-full bg-secondary px-1.5 text-[11px] tabular-nums text-muted-foreground">
                  {task.runs.length}
                </span>
              )}
            </Button>

            {task.engine === "dsh" && task.session && (
              <Button variant="ghost" size="sm" className="text-link" onClick={() => openSession(task.session!)}>
                <span>打开 DSH 会话</span>
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>

        {(moveError || (task.status === "blocked" && task.blockedReason)) && (
          <div className="mx-auto max-w-5xl px-4 pb-2.5 md:px-6">
            <Alert variant="destructive">
              <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                {moveError || task.blockedReason}
                {task.status === "blocked" && !task.archived && <Button size="xs" variant="ghost"
                  onClick={() => void handleStatusChange("blocked")}>编辑阻塞原因</Button>}
              </AlertDescription>
            </Alert>
          </div>
        )}
      </header>

      <MessageStream task={task} executor={executor} transcript={transcript} error={error} />

      {task.archived ? <div className="p-4 text-center text-sm text-muted-foreground">任务已归档</div> : (
        <ComposerBox task={task} executors={executors} running={running} canSteer={transcript?.canSteer}
          queue={queue} preference={defaultSendMode} save={save} />
      )}

      {showChanges && <ChangesDrawer taskId={task.id} onClose={() => setShowChanges(false)} />}
      {blockReason !== null && <Dialog open onOpenChange={open => { if (!open) setBlockReason(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>标记为已阻塞</DialogTitle><DialogDescription>说明需要什么信息或操作才能继续。</DialogDescription></DialogHeader>
          <form className="grid gap-3" onSubmit={event => {
            event.preventDefault()
            if (blockReason.trim()) void handleStatusChange("blocked", blockReason)
          }}>
            <Textarea aria-label="阻塞原因" required maxLength={2000} value={blockReason} onChange={event => setBlockReason(event.target.value)} />
            {moveError && <p className="text-sm text-destructive">{moveError}</p>}
            <Button type="submit" size="sm" className="justify-self-end">标记阻塞</Button>
          </form>
        </DialogContent>
      </Dialog>}

      {showHistory && (
        <RunHistoryDialog task={task} onClose={() => setShowHistory(false)} openSession={openSession} />
      )}

      {editing && (
        <TaskFormDialog
          existing={task}
          executors={executors}
          preferredExecutorId={task.executorId}
          defaultWorkdir={defaultWorkdir}
          workspaceHost={workspaceHost}
          onClose={() => setEditing(false)}
          save={save}
        />
      )}
    </section>
  )
}
