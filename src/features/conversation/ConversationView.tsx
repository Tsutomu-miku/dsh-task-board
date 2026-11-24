import { useState } from "react"
import { ArrowLeft, ExternalLink, FolderOpen, History, Pencil } from "lucide-react"
import { Alert, AlertDescription } from "../../shared/components/ui/alert"
import { Button } from "../../shared/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../shared/components/ui/select"
import { EngineChip } from "../../shared/components/engine-badge"
import { TaskStatusIcon, TaskStatusPill } from "../../shared/components/status-badge"
import { formatShortPath } from "../../shared/lib/format"
import { COLUMNS, type BoardSaveFn, type DefaultSendMode, type Executor, type QueuedMessage, type TaskItem, type TaskStatus } from "../../shared/types/board"
import { TaskFormDialog } from "../board/TaskFormDialog"
import { ComposerBox } from "./ComposerBox"
import { MessageStream } from "./MessageStream"
import { RunHistoryDialog } from "./RunHistoryDialog"
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
  const [moveError, setMoveError] = useState("")
  const active = task.status === "running"

  async function handleStatusChange(status: TaskStatus) {
    setMoveError("")
    try {
      await save({ action: "move", id: task.id, from: task.status, status })
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
                {!active && (
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
            {active ? (
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

        {moveError && (
          <div className="mx-auto max-w-5xl px-4 pb-2.5 md:px-6">
            <Alert variant="destructive">
              <AlertDescription>{moveError}</AlertDescription>
            </Alert>
          </div>
        )}
      </header>

      <MessageStream task={task} executor={executor} transcript={transcript} error={error} />

      <ComposerBox task={task} executors={executors} running={running} queue={queue} preference={defaultSendMode} save={save} />

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
