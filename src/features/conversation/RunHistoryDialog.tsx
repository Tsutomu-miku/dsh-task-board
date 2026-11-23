import { useEffect, useState } from "react"
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  ExternalLink,
  Info,
  MessageSquare,
  Terminal,
  Wrench,
} from "lucide-react"
import { Alert, AlertDescription } from "../../shared/components/ui/alert"
import { Button } from "../../shared/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../shared/components/ui/dialog"
import { fetchRunEvents } from "../../shared/api/client"
import { RunStatusPill, TaskStatusPill } from "../../shared/components/status-badge"
import { formatDuration } from "../../shared/lib/format"
import type { RunEvent, RunRecord, TaskItem } from "../../shared/types/board"

const EVENT_META: Record<RunEvent["kind"], { label: string; icon: typeof Info; color: string }> = {
  status: { label: "状态", icon: Info, color: "text-[var(--board-brand)]" },
  tool: { label: "工具", icon: Wrench, color: "text-[var(--engine-codex)]" },
  output: { label: "输出", icon: MessageSquare, color: "text-[var(--status-done)]" },
  error: { label: "错误", icon: AlertCircle, color: "text-[var(--board-danger)]" },
}

function RunEventLog({ runId, active }: { runId: string; active: boolean }) {
  const [entries, setEntries] = useState<RunEvent[] | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined

    async function load() {
      try {
        const events = await fetchRunEvents(runId, controller.signal)
        if (controller.signal.aborted) return
        setEntries(events)
        setError("")
      } catch (err) {
        if (!controller.signal.aborted) setError((err as Error).message)
      }
      if (active && !controller.signal.aborted) {
        timer = setTimeout(load, 1000)
      }
    }

    void load()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [runId, active])

  if (error) return <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
  if (!entries) return <p className="text-xs text-muted-foreground">正在加载运行日志…</p>
  if (!entries.length) return <p className="text-xs text-muted-foreground">暂无运行事件</p>

  return (
    <ol
      aria-label="运行日志"
      className="grid max-h-64 list-none gap-2 overflow-auto rounded-xl border border-[var(--board-line-soft)] bg-[var(--board-lane)] p-3 text-xs"
    >
      {entries.map(entry => {
        const meta = EVENT_META[entry.kind]
        const Icon = meta.icon
        return (
          <li key={entry.seq} className="grid grid-cols-[auto_auto_1fr] items-start gap-2.5">
            <time className="font-mono text-[11px] whitespace-nowrap text-muted-foreground">
              {new Date(entry.at).toLocaleTimeString()}
            </time>
            <span className={`inline-flex items-center gap-1 font-medium ${meta.color}`}>
              <Icon className="size-3" aria-hidden="true" />
              {meta.label}
            </span>
            <span className="min-w-0 whitespace-pre-wrap wrap-anywhere text-foreground/90">{entry.message}</span>
          </li>
        )
      })}
    </ol>
  )
}

function RunRecordCard({ run, openSession }: { run: RunRecord; openSession: (id: string) => void }) {
  const [expanded, setExpanded] = useState(run.status === "running")

  return (
    <div className="settings-card-surface grid gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <RunStatusPill status={run.status} />
        <span className="text-xs font-medium text-foreground">{run.executor.name}</span>
        {run.executor.model && (
          <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">
            <Cpu className="size-3" aria-hidden="true" />
            {run.executor.model.id}
            {run.executor.model.effort ? ` · ${run.executor.model.effort}` : ""}
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
          <Clock className="size-3" aria-hidden="true" />
          {new Date(run.started).toLocaleString()}
          {run.finished ? ` (${formatDuration(run.started, run.finished)})` : ""}
        </span>
      </div>

      <p className="line-clamp-2 rounded-lg bg-[var(--board-lane)] px-2.5 py-1.5 text-xs text-muted-foreground">
        {run.prompt}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="xs"
          aria-expanded={expanded}
          onClick={() => setExpanded(v => !v)}
        >
          {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          {expanded ? "收起事件日志" : "查看事件日志"}
        </Button>

        {run.session && run.executor.engine === "dsh" && (
          <Button variant="ghost" size="xs" className="text-link" onClick={() => openSession(run.session!)}>
            打开 DSH 会话
            <ExternalLink className="size-3" aria-hidden="true" />
          </Button>
        )}

        {run.session && run.executor.engine === "codex" && (
          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
            <Terminal className="size-3" aria-hidden="true" />
            {run.session}
          </span>
        )}
      </div>

      {expanded && <RunEventLog runId={run.id} active={run.status === "running"} />}
      {run.error && (
        <Alert variant="destructive">
          <AlertDescription>{run.error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

export function RunHistoryDialog({
  task,
  onClose,
  openSession,
}: {
  task: TaskItem
  onClose: () => void
  openSession: (id: string) => void
}) {
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>运行记录与状态流转</DialogTitle>
          <DialogDescription>{task.title}</DialogDescription>
        </DialogHeader>

        <section className="grid gap-3" aria-label="运行列表">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            执行记录 ({task.runs.length})
          </h3>
          {task.runs.length ? (
            task.runs.map(run => <RunRecordCard key={run.id} run={run} openSession={openSession} />)
          ) : (
            <p className="rounded-xl border border-dashed border-[var(--board-line)] py-6 text-center text-xs text-muted-foreground">
              暂无运行记录
            </p>
          )}
        </section>

        <section className="grid gap-2.5 border-t border-[var(--board-line-soft)] pt-4" aria-label="状态记录">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            状态流转 ({task.history.length})
          </h3>
          <div className="grid gap-2">
            {[...task.history].reverse().map((entry, idx) => (
              <div key={idx} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5">
                  {entry.from ? (
                    <>
                      <TaskStatusPill status={entry.from} />
                      <span className="text-muted-foreground">→</span>
                      <TaskStatusPill status={entry.to} />
                    </>
                  ) : (
                    <>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        创建任务
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <TaskStatusPill status={entry.to} />
                    </>
                  )}
                </div>
                <time className="text-[11px] text-muted-foreground tabular-nums">
                  {new Date(entry.at).toLocaleString()}
                </time>
              </div>
            ))}
          </div>
        </section>
      </DialogContent>
    </Dialog>
  )
}
