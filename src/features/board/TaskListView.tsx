import { ChevronRight, Clock, FolderOpen, Inbox, MessageSquare, Pencil, Trash2 } from "lucide-react"
import { EngineChip } from "../../shared/components/engine-badge"
import { RunStatusPill, TaskStatusIcon } from "../../shared/components/status-badge"
import { formatFolderName, formatRelativeTime } from "../../shared/lib/format"
import { COLUMNS, type Executor, type TaskItem } from "../../shared/types/board"

export function TaskListView({
  cards,
  executors,
  onOpenTask,
  onEditTask,
  onDeleteTask,
}: {
  cards: TaskItem[]
  executors: Executor[]
  onOpenTask: (id: string) => void
  onEditTask: (card: TaskItem) => void
  onDeleteTask: (card: TaskItem) => void
}) {
  if (!cards.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--board-line)] py-16 text-center">
        <Inbox className="size-6 text-muted-foreground/60" strokeWidth={1.6} aria-hidden="true" />
        <p className="text-sm text-muted-foreground">没有符合筛选条件的任务</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {COLUMNS.map(column => {
        const group = cards.filter(card => card.status === column.status)
        if (!group.length) return null
        return (
          <section key={column.status} className="flex flex-col gap-2">
            <div className="flex items-center gap-2 px-1">
              <TaskStatusIcon status={column.status} className="size-4" />
              <h2 className="text-[13px] font-semibold text-foreground">{column.label}</h2>
              <span className="rounded-full bg-secondary px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                {group.length}
              </span>
            </div>

            <div className="overflow-hidden rounded-2xl border border-[var(--board-line)] bg-card shadow-2xs">
              {group.map((card, index) => {
                const executor = executors.find(row => row.id === card.executorId)
                const lastRun = card.runs[0]
                const updatedAt = lastRun?.finished ?? lastRun?.started ?? card.created
                const isRunning = card.status === "running"

                return (
                  <div
                    key={card.id}
                    className={`group relative flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/55 ${
                      index > 0 ? "border-t border-[var(--board-line-soft)]" : ""
                    }`}
                  >
                    <TaskStatusIcon status={card.status} className="size-4" />

                    <button
                      type="button"
                      onClick={() => onOpenTask(card.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate text-sm font-medium text-foreground">{card.title}</div>
                      <div className="truncate text-xs text-muted-foreground">{card.prompt}</div>
                    </button>

                    <div className="flex flex-wrap items-center gap-2">
                      <EngineChip engine={card.engine} label={executor?.name} />
                      <span
                        className="hidden items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground sm:inline-flex"
                        title={card.workdir}
                      >
                        <FolderOpen className="size-3" strokeWidth={1.8} aria-hidden="true" />
                        {formatFolderName(card.workdir)}
                      </span>
                      {lastRun && <RunStatusPill status={lastRun.status} />}
                      {card.runs.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
                          <MessageSquare className="size-3" strokeWidth={1.8} aria-hidden="true" />
                          {card.runs.length}
                        </span>
                      )}
                      <span className="hidden items-center gap-1 text-[11px] text-muted-foreground md:inline-flex">
                        <Clock className="size-3" strokeWidth={1.8} aria-hidden="true" />
                        {formatRelativeTime(updatedAt)}
                      </span>

                      {!isRunning && (
                        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                          <button
                            type="button"
                            aria-label={`编辑「${card.title}」`}
                            onClick={() => onEditTask(card)}
                            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`删除「${card.title}」`}
                            onClick={() => onDeleteTask(card)}
                            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--board-danger-soft)] hover:text-[var(--board-danger)]"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      )}

                      <button
                        type="button"
                        aria-label={`打开「${card.title}」`}
                        onClick={() => onOpenTask(card.id)}
                        className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <ChevronRight className="size-4" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
