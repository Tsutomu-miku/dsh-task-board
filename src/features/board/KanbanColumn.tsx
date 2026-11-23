import { Inbox, Plus } from "lucide-react"
import { TaskStatusIcon } from "../../shared/components/status-badge"
import type { Executor, TaskItem, TaskStatus } from "../../shared/types/board"
import { TaskCard } from "./TaskCard"

export function KanbanColumn({
  status,
  label,
  tasks,
  executors,
  isDropTarget,
  canCreate,
  onDragOver,
  onDragLeave,
  onDrop,
  onCreate,
  onOpenTask,
  onEditTask,
  onDeleteTask,
}: {
  status: TaskStatus
  label: string
  tasks: TaskItem[]
  executors: Executor[]
  isDropTarget: boolean
  canCreate: boolean
  onDragOver: (event: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (event: React.DragEvent) => void
  onCreate?: () => void
  onOpenTask: (id: string) => void
  onEditTask: (card: TaskItem) => void
  onDeleteTask: (card: TaskItem) => void
}) {
  return (
    <section
      aria-label={label}
      data-status={status}
      data-drop-target={isDropTarget || undefined}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="kanban-lane flex min-w-0 flex-col gap-3"
    >
      <header className="flex items-center gap-2 px-1">
        <TaskStatusIcon status={status} active={tasks.length > 0} className="size-4" />
        <h2 className="text-[13.5px] leading-5 font-semibold tracking-[-0.01em] text-foreground">{label}</h2>
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-card px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground shadow-2xs">
          {tasks.length}
        </span>

        {status === "todo" && canCreate && onCreate && (
          <button
            type="button"
            aria-label="在待办中新建任务"
            title="新建任务"
            onClick={onCreate}
            className="ml-auto inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
          >
            <Plus className="size-3.5" strokeWidth={2} />
          </button>
        )}
      </header>

      <div className="flex min-w-0 flex-col gap-2.5">
        {tasks.map(card => (
          <TaskCard
            key={card.id}
            card={card}
            executor={executors.find(row => row.id === card.executorId)}
            onOpen={() => onOpenTask(card.id)}
            onEdit={() => onEditTask(card)}
            onDelete={() => onDeleteTask(card)}
          />
        ))}

        {!tasks.length && (
          <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--board-line)] px-4 py-8 text-center">
            <Inbox className="size-4 text-[var(--board-text-tertiary)]/75" strokeWidth={1.6} aria-hidden="true" />
            <p className="text-xs text-[var(--board-text-tertiary)]">
              {status === "running" ? "当前无运行中任务" : "拖拽卡片到此处或暂无任务"}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
