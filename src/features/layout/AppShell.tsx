import { useEffect, useState } from "react"
import { Bell, Cpu, Kanban, Loader2, Plus } from "lucide-react"
import { Alert, AlertDescription } from "../../shared/components/ui/alert"
import { Button } from "../../shared/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../shared/components/ui/dialog"
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
  const [showInbox, setShowInbox] = useState(false)
  const [inboxError, setInboxError] = useState("")
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
  const runningTask = runningTasks[0]
  const enabledExecutors = board?.executors.filter(item => item.enabled).length ?? 0

  return (
    <BoardPortalContext.Provider value={portalRoot}>
      <div className="dsh-task-board" data-task-board>
        {selectedTask && board ? (
          <ConversationView
            key={selectedTask.id}
            task={selectedTask}
            tasks={board.cards}
            executors={board.executors}
            defaultWorkdir={board.workdir}
            workspaceHost={board.workspaceHost}
            running={selectedTask.status === "running" ? selectedTask : undefined}
            queue={board.queue}
            defaultSendMode={board.defaultSendMode}
            onBack={() => setSelectedTaskId(null)}
            save={save}
            openSession={openSession}
            openTask={setSelectedTaskId}
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
                {runningTask && (
                  <button
                    type="button"
                    onClick={() => setSelectedTaskId(runningTask.id)}
                    className="inline-flex h-8 max-w-[220px] items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--status-running)_28%,transparent)] bg-[var(--status-running-soft)] px-3 text-xs font-medium text-[var(--status-running)] transition-opacity hover:opacity-85"
                    title={`查看正在执行的任务：${runningTask.title}`}
                  >
                    <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
                    <span className="truncate">{runningTasks.length > 1 ? `${runningTasks.length} 项执行中` : runningTask.title}</span>
                  </button>
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
                <Button variant="outline" size="sm" onClick={() => setShowInbox(true)}>
                  <Bell className="size-3.5" aria-hidden="true" />收件箱{board?.unreadNotifications ? ` · ${board.unreadNotifications}` : ""}
                </Button>

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
          tasks={board.cards}
          preferredExecutorId={board.defaultExecutor}
          defaultWorkdir={board.workdir}
          workspaceHost={board.workspaceHost}
          onClose={() => setCreatingTask(false)}
          save={save}
        />
      )}
      {showInbox && board && <Dialog open onOpenChange={setShowInbox}>
        <DialogContent className="max-h-[88vh] overflow-auto">
          <DialogHeader><DialogTitle>收件箱</DialogTitle><DialogDescription>运行进展、交接、审批和唤醒通知</DialogDescription></DialogHeader>
          {inboxError && <Alert variant="destructive"><AlertDescription>{inboxError}</AlertDescription></Alert>}
          {board.unreadNotifications > 0 && <Button className="justify-self-end" size="xs" variant="outline" onClick={() => {
            void save({ action: "read-all-notifications" }).catch(err => setInboxError((err as Error).message))
          }}>全部标为已读</Button>}
          {board.notifications.map(item => <button key={item.id} type="button"
            className={`grid gap-1 rounded-lg border p-3 text-left text-sm ${item.read ? "" : "bg-accent"}`}
            onClick={() => {
              void save({ action: "read-notification", notificationId: item.id }).then(() => {
                setSelectedTaskId(item.cardId); setShowInbox(false)
              }).catch(err => setInboxError((err as Error).message))
            }}>
            <span>{item.message}</span><time className="text-xs text-muted-foreground">{new Date(item.at).toLocaleString()}</time>
          </button>)}
          {!board.notifications.length && <p className="text-sm text-muted-foreground">暂无通知。</p>}
        </DialogContent>
      </Dialog>}
    </BoardPortalContext.Provider>
  )
}
