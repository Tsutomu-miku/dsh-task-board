import { useState } from "react"
import { COLUMNS, type Executor, type TaskItem, type TaskStatus } from "../../shared/types/board"
import { KanbanColumn } from "./KanbanColumn"

export function KanbanBoard({
  cards,
  executors,
  canCreate,
  onCreate,
  onOpenTask,
  onEditTask,
  onDeleteTask,
  onMoveTask,
}: {
  cards: TaskItem[]
  executors: Executor[]
  canCreate: boolean
  onCreate: () => void
  onOpenTask: (id: string) => void
  onEditTask: (card: TaskItem) => void
  onDeleteTask: (card: TaskItem) => void
  onMoveTask: (id: string, status: TaskStatus) => void
}) {
  const [dropTarget, setDropTarget] = useState<TaskStatus | null>(null)

  return (
    <div className="kanban-grid min-w-0" onDragEnd={() => setDropTarget(null)}>
      {COLUMNS.map(column => {
        const columnTasks = cards.filter(task => task.status === column.status)
        return (
          <KanbanColumn
            key={column.status}
            status={column.status}
            label={column.label}
            tasks={columnTasks}
            executors={executors}
            isDropTarget={dropTarget === column.status}
            canCreate={canCreate}
            onCreate={column.status === "todo" ? onCreate : undefined}
            onDragOver={event => {
              if (column.status === "running" || !event.dataTransfer.types.includes("text/x-board-card")) return
              event.preventDefault()
              setDropTarget(column.status)
            }}
            onDragLeave={() => {
              setDropTarget(current => (current === column.status ? null : current))
            }}
            onDrop={event => {
              event.preventDefault()
              setDropTarget(null)
              const cardId = event.dataTransfer.getData("text/x-board-card")
              if (cardId) onMoveTask(cardId, column.status)
            }}
            onOpenTask={onOpenTask}
            onEditTask={onEditTask}
            onDeleteTask={onDeleteTask}
          />
        )
      })}
    </div>
  )
}
