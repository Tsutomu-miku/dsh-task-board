import { ChevronRight, Clock, Cpu, FolderOpen, MessageSquare, Pencil, Trash2 } from "lucide-react"
import { EngineChip } from "../../shared/components/engine-badge"
import { RunStatusPill } from "../../shared/components/status-badge"
import { formatFolderName, formatRelativeTime } from "../../shared/lib/format"
import type { Executor, TaskItem } from "../../shared/types/board"

export function TaskCard({
  card,
  executor,
  onOpen,
  onEdit,
  onDelete,
}: {
  card: TaskItem
  executor?: Executor
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const lastRun = card.runs[0]
  const isRunning = card.status === "running"
  const activeModel = lastRun?.executor.model ?? executor?.model
  const updatedAt = lastRun?.finished ?? lastRun?.started ?? card.created

  return (
    <article
      draggable={!isRunning}
      data-running={isRunning || undefined}
      onDragStart={event => {
        event.dataTransfer.setData("text/x-board-card", card.id)
        event.dataTransfer.effectAllowed = "move"
      }}
      className="task-card-surface group relative flex min-w-0 flex-col gap-2.5 p-3.5"
    >
      <div className="flex min-w-0 items-start gap-2">
        <h3 className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpen}
            className="task-card-trigger block w-full text-left text-[13.5px] leading-5 font-medium text-foreground wrap-anywhere"
          >
            {card.title}
          </button>
        </h3>

        {!isRunning ? (
          <div className="relative z-10 -mt-0.5 -mr-1 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            <button
              type="button"
              aria-label={`编辑「${card.title}」`}
              title="编辑任务"
              onClick={event => {
                event.stopPropagation()
                onEdit()
              }}
              className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Pencil className="size-3.5" strokeWidth={1.8} />
            </button>
            <button
              type="button"
              aria-label={`删除「${card.title}」`}
              title="删除任务"
              onClick={event => {
                event.stopPropagation()
                onDelete()
              }}
              className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--board-danger-soft)] hover:text-[var(--board-danger)]"
            >
              <Trash2 className="size-3.5" strokeWidth={1.8} />
            </button>
          </div>
        ) : (
          <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-[var(--status-running)]" aria-hidden="true" />
        )}
      </div>

      <p className="line-clamp-2 text-[12.5px] leading-[19px] text-muted-foreground wrap-anywhere">
        {card.brief ?? card.prompt}
      </p>
      {card.blockedReason && <p className="line-clamp-2 break-words text-xs text-destructive">{card.blockedReason}</p>}

      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        {card.project && <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px]">{card.project}</span>}
        {Boolean(card.priority) && <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px]">优先级 {card.priority}</span>}
        {card.labels?.map(label => <span key={label} className="rounded bg-secondary px-1.5 py-0.5 text-[11px]">{label}</span>)}
        <EngineChip engine={card.engine} label={executor?.name} />
        {activeModel && (
          <span
            className="inline-flex max-w-[140px] items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-[11px] leading-4 text-muted-foreground"
            title={`${activeModel.id}${activeModel.effort ? ` · ${activeModel.effort}` : ""}`}
          >
            <Cpu className="size-3 shrink-0" strokeWidth={1.8} aria-hidden="true" />
            <span className="truncate">{activeModel.id}</span>
          </span>
        )}
        <span
          className="inline-flex max-w-[130px] items-center gap-1 rounded-md bg-secondary/75 px-1.5 py-0.5 text-[11px] leading-4 text-muted-foreground"
          title={card.workdir}
        >
          <FolderOpen className="size-3 shrink-0" strokeWidth={1.8} aria-hidden="true" />
          <span className="truncate">{formatFolderName(card.workdir)}</span>
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-[var(--board-line-soft)] pt-2 text-[11px] leading-4 text-muted-foreground">
        <div className="flex min-w-0 items-center gap-1.5">
          {lastRun ? (
            <RunStatusPill status={lastRun.status} />
          ) : (
            <span className="inline-flex items-center gap-1 text-[var(--board-text-tertiary)]">
              尚未运行
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2.5 text-[var(--board-text-tertiary)]">
          {card.runs.length > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums" title={`共 ${card.runs.length} 次运行`}>
              <MessageSquare className="size-3" strokeWidth={1.8} aria-hidden="true" />
              {card.runs.length}
            </span>
          )}
          <span className="inline-flex items-center gap-1 whitespace-nowrap" title={new Date(updatedAt).toLocaleString()}>
            <Clock className="size-3" strokeWidth={1.8} aria-hidden="true" />
            {formatRelativeTime(updatedAt)}
          </span>
        </div>
      </div>
    </article>
  )
}
