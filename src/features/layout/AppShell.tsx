import { useEffect, useState } from "react"
import { ChevronDown, Cpu, Kanban, Loader2, Plus } from "lucide-react"
import { DropdownMenu as Menu } from "radix-ui"
import { Alert, AlertDescription } from "../../shared/components/ui/alert"
import { Button } from "../../shared/components/ui/button"
import { useBoard } from "../../shared/hooks/use-board"
import { BoardPortalContext } from "../../shared/hooks/use-portal"
import { BoardPage } from "../board/BoardPage"
import { TaskFormDialog } from "../board/TaskFormDialog"
import { ConversationView } from "../conversation/ConversationView"
import { ExecutorsPage } from "../executors/ExecutorsPage"

type ActiveSection = "board" | "executors"

export function AppShell({ openSession }: { openSession: (id: string) => void }) {
  const { board, loading, error, save } = useBoard()
  const [section, setSection] = useState<ActiveSection>("board")
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [creatingTask, setCreatingTask] = useState(false)
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const element = document.createElement("div")
    element.className = "dsh-task-board"
    document.body.append(element)
    setPortalRoot(element)
    return () => element.remove()
  }, [])

  const selectedTask = board?.cards.find(card => card.id === selectedTaskId) ?? null
  const runningTasks = board?.cards.filter(card => card.status === "running") ?? []
  const blockedCount = board?.cards.filter(card => !card.archived && card.status === "blocked").length ?? 0
  const enabledExecutors = board?.executors.filter(item => item.enabled).length ?? 0

  return (
    <BoardPortalContext.Provider value={portalRoot}>
      <div className="dsh-task-board" data-task-board>
        {selectedTask && board ? (
          <ConversationView
            key={selectedTask.id}
            task={selectedTask}
            executors={board.executors}
            defaultWorkdir={board.workdir}
            workspaceHost={board.workspaceHost}
            running={selectedTask.status === "running" ? selectedTask : undefined}
            queue={board.queue}
            defaultSendMode={board.defaultSendMode}
            onBack={() => setSelectedTaskId(null)}
            save={save}
            openSession={openSession}
          />
        ) : (
          <div className="board-shell">
            <header data-window-drag className="board-header flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--board-brand)_22%,transparent)] bg-[var(--board-brand-soft)] text-[var(--board-brand)]">
                  <Kanban className="size-[18px]" strokeWidth={2} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h1 className="text-[19px] leading-6 font-semibold tracking-[-0.015em]">任务看板</h1>
                  <p className="text-xs leading-4 text-muted-foreground">
                    统筹本机 DSH 与 Codex 任务流转与会话执行
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {runningTasks.length > 0 && (
                  <Menu.Root>
                    <Menu.Trigger className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--status-running)_28%,transparent)] bg-[var(--status-running-soft)] px-3 text-xs font-medium text-[var(--status-running)] transition-opacity hover:opacity-85">
                      <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
                      <span>{runningTasks.length} 项执行中</span>
                      <ChevronDown className="size-3.5" aria-hidden="true" />
                    </Menu.Trigger>
                    <Menu.Portal container={portalRoot}>
                      <Menu.Content align="end" sideOffset={6} className="z-50 grid max-h-72 min-w-48 max-w-72 gap-0.5 overflow-y-auto rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg">
                        {runningTasks.map(task => <Menu.Item key={task.id} onSelect={() => setSelectedTaskId(task.id)}
                          className="cursor-default truncate rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent">
                          {task.title}
                        </Menu.Item>)}
                      </Menu.Content>
                    </Menu.Portal>
                  </Menu.Root>
                )}

                <nav aria-label="任务看板导航" className="segmented-nav inline-flex items-center gap-0.5">
                  <button
                    type="button"
                    aria-current={section === "board" ? "page" : undefined}
                    onClick={() => setSection("board")}
                    className="segmented-tab inline-flex h-7 items-center gap-1.5 px-3 text-[13px] font-medium"
                  >
                    <Kanban className="size-3.5" strokeWidth={1.9} aria-hidden="true" />
                    <span>看板</span>
                    {board && (
                      <span className="rounded-full bg-secondary px-1.5 text-[11px] tabular-nums text-muted-foreground">
                        {board.cards.length}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    aria-current={section === "executors" ? "page" : undefined}
                    onClick={() => setSection("executors")}
                    className="segmented-tab inline-flex h-7 items-center gap-1.5 px-3 text-[13px] font-medium"
                  >
                    <Cpu className="size-3.5" strokeWidth={1.9} aria-hidden="true" />
                    <span>执行器</span>
                    {board && (
                      <span className="rounded-full bg-secondary px-1.5 text-[11px] tabular-nums text-muted-foreground">
                        {enabledExecutors}
                      </span>
                    )}
                  </button>
                </nav>
                {blockedCount > 0 && <span className="text-xs font-medium text-destructive">已阻塞 · {blockedCount}</span>}

                {section === "board" && (
                  <Button
                    size="sm"
                    className="rounded-full px-3.5"
                    disabled={!board?.defaultExecutor}
                    onClick={() => setCreatingTask(true)}
                  >
                    <Plus className="size-4" strokeWidth={2.1} aria-hidden="true" />
                    新建任务
                  </Button>
                )}
              </div>
            </header>

            {error && (
              <div className="mb-4">
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              </div>
            )}

            {loading && !board ? (
              <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                <span>正在加载任务看板…</span>
              </div>
            ) : board ? (
              section === "board" ? (
                <BoardPage
                  board={board}
                  onOpenTask={setSelectedTaskId}
                  onOpenCreate={() => setCreatingTask(true)}
                  onOpenExecutors={() => setSection("executors")}
                  save={save}
                />
              ) : (
                <ExecutorsPage
                  executors={board.executors}
                  preferred={board.defaultExecutor}
                  defaultWorkdir={board.workdir}
                  workspaceHost={board.workspaceHost}
                  save={save}
                />
              )
            ) : null}
          </div>
        )}
      </div>

      {creatingTask && portalRoot && board && (
        <TaskFormDialog
          executors={board.executors}
          preferredExecutorId={board.defaultExecutor}
          defaultWorkdir={board.workdir}
          workspaceHost={board.workspaceHost}
          onClose={() => setCreatingTask(false)}
          save={save}
        />
      )}
    </BoardPortalContext.Provider>
  )
}
