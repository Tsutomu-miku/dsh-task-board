import { useMemo, useState } from "react"
import { Cpu, FolderOpen, LayoutGrid, List, Search, X } from "lucide-react"
import { Alert, AlertDescription } from "../../shared/components/ui/alert"
import { Button } from "../../shared/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../shared/components/ui/select"
import { formatShortPath } from "../../shared/lib/format"
import type { BoardSaveFn, BoardState, TaskItem, TaskStatus } from "../../shared/types/board"
import { DeleteTaskDialog } from "./DeleteTaskDialog"
import { KanbanBoard } from "./KanbanBoard"
import { TaskFormDialog } from "./TaskFormDialog"
import { TaskListView } from "./TaskListView"

export function BoardPage({
  board,
  onOpenTask,
  onOpenCreate,
  onOpenExecutors,
  save,
}: {
  board: BoardState
  onOpenTask: (id: string) => void
  onOpenCreate: () => void
  onOpenExecutors: () => void
  save: BoardSaveFn
}) {
  const [query, setQuery] = useState("")
  const [workspaceFilter, setWorkspaceFilter] = useState("all")
  const [executorFilter, setExecutorFilter] = useState("all")
  const [projectFilter, setProjectFilter] = useState("all")
  const [archived, setArchived] = useState(false)
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban")
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null)
  const [deletingTask, setDeletingTask] = useState<TaskItem | null>(null)
  const [moveError, setMoveError] = useState("")

  const workspaces = useMemo(
    () => [...new Set(board.cards.map(card => card.workdir))].sort(),
    [board.cards]
  )

  const filteredCards = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return board.cards.filter(card => {
      if (Boolean(card.archived) !== archived) return false
      if (projectFilter !== "all" && card.project !== projectFilter) return false
      if (workspaceFilter !== "all" && card.workdir !== workspaceFilter) return false
      if (executorFilter !== "all" && card.executorId !== executorFilter) return false
      if (!keyword) return true
      return (
        card.title.toLowerCase().includes(keyword) ||
        (card.brief ?? card.prompt).toLowerCase().includes(keyword) ||
        (card.labels ?? []).some(label => label.toLowerCase().includes(keyword)) ||
        card.workdir.toLowerCase().includes(keyword)
      )
    })
  }, [board.cards, query, workspaceFilter, executorFilter, archived, projectFilter])
  const projects = [...new Set(board.cards.flatMap(card => card.project ? [card.project] : []))].sort()

  function handleMove(id: string, status: TaskStatus) {
    const card = board.cards.find(entry => entry.id === id)
    if (!card || card.status === "running" || card.status === status || status === "running") return
    setMoveError("")
    void save({ action: "move", id, status, from: card.status }).catch(err => setMoveError((err as Error).message))
  }

  function onOpenTaskForEdit(task: TaskItem) {
    onOpenTask(task.id)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="搜索任务标题、说明或目录…"
            aria-label="搜索任务"
            className="h-8 w-full rounded-lg border border-input bg-card pr-7 pl-8 text-[13px] text-foreground transition-colors outline-none placeholder:text-muted-foreground/75 focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
          {query && (
            <button
              type="button"
              aria-label="清除搜索"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-1.5 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        <Select value={workspaceFilter} onValueChange={setWorkspaceFilter}>
          <SelectTrigger size="sm" aria-label="按工作目录筛选" className="max-w-[230px]">
            <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部工作目录</SelectItem>
            {workspaces.map(dir => (
              <SelectItem key={dir} value={dir} title={dir}>
                {formatShortPath(dir)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={executorFilter} onValueChange={setExecutorFilter}>
          <SelectTrigger size="sm" aria-label="按执行器筛选" className="max-w-[180px]">
            <Cpu className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部执行器</SelectItem>
            {board.executors.map(item => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {projects.length > 0 && <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger size="sm" aria-label="按项目筛选"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">全部项目</SelectItem>
            {projects.filter(name => name !== "all").map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
          </SelectContent>
        </Select>}
        <Button size="sm" variant={archived ? "default" : "outline"} aria-pressed={archived} onClick={() => setArchived(!archived)}>归档</Button>
        <div className="segmented-nav ml-auto inline-flex items-center gap-0.5" role="group" aria-label="视图切换">
          <button
            type="button"
            aria-pressed={viewMode === "kanban"}
            aria-label="看板视图"
            title="看板视图"
            onClick={() => setViewMode("kanban")}
            className="segmented-tab inline-flex h-6 items-center gap-1 px-2 text-xs font-medium"
          >
            <LayoutGrid className="size-3.5" strokeWidth={1.9} />
            <span className="hidden sm:inline">看板</span>
          </button>
          <button
            type="button"
            aria-pressed={viewMode === "list"}
            aria-label="列表视图"
            title="列表视图"
            onClick={() => setViewMode("list")}
            className="segmented-tab inline-flex h-6 items-center gap-1 px-2 text-xs font-medium"
          >
            <List className="size-3.5" strokeWidth={1.9} />
            <span className="hidden sm:inline">列表</span>
          </button>
        </div>
      </div>

      {!board.defaultExecutor && (
        <Alert>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>当前没有可用的执行器，请先启用或新增至少一个执行器后再创建任务。</span>
            <Button size="xs" variant="outline" onClick={onOpenExecutors}>
              前往执行器配置
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {moveError && (
        <Alert variant="destructive">
          <AlertDescription>{moveError}</AlertDescription>
        </Alert>
      )}

      {viewMode === "kanban" && !archived ? (
        <KanbanBoard
          cards={filteredCards}
          executors={board.executors}
          canCreate={Boolean(board.defaultExecutor)}
          onCreate={onOpenCreate}
          onOpenTask={onOpenTask}
          onEditTask={setEditingTask}
          onDeleteTask={setDeletingTask}
          onMoveTask={handleMove}
        />
      ) : (
        <TaskListView
          cards={filteredCards}
          executors={board.executors}
          onOpenTask={onOpenTask}
          onEditTask={archived ? onOpenTaskForEdit : setEditingTask}
          onDeleteTask={setDeletingTask}
        />
      )}

      {editingTask && (
        <TaskFormDialog
          existing={editingTask}
          tasks={board.cards}
          executors={board.executors}
          preferredExecutorId={board.defaultExecutor}
          defaultWorkdir={board.workdir}
          workspaceHost={board.workspaceHost}
          onClose={() => setEditingTask(null)}
          save={save}
        />
      )}

      {deletingTask && (
        <DeleteTaskDialog
          task={deletingTask}
          onClose={() => setDeletingTask(null)}
          save={save}
        />
      )}
    </div>
  )
}
