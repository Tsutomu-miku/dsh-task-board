import { useEffect, useState } from "react"
import { AlertCircle, CheckCircle2, Info, MessageSquare, Wrench } from "lucide-react"
import { fetchRunEvents } from "../../shared/api/client"
import { Alert, AlertDescription } from "../../shared/components/ui/alert"
import type { RunEvent, RunRecord } from "../../shared/types/board"

const EVENT_META = {
  status: { label: "状态", icon: Info, color: "text-[var(--board-brand)]" },
  tool: { label: "调用", icon: Wrench, color: "text-[var(--engine-codex)]" },
  tool_result: { label: "结果", icon: CheckCircle2, color: "text-[var(--status-done)]" },
  output: { label: "回复", icon: MessageSquare, color: "text-[var(--status-done)]" },
  error: { label: "错误", icon: AlertCircle, color: "text-[var(--board-danger)]" },
} satisfies Record<RunEvent["kind"], object>

export function RunActivity({ run, includeReplies = false }: { run: RunRecord; includeReplies?: boolean }) {
  const [entries, setEntries] = useState<RunEvent[] | null>(null)
  const [error, setError] = useState("")
  const active = run.status === "running"
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let after = 0
    async function load() {
      try {
        const next = await fetchRunEvents(run.id, after, controller.signal)
        if (controller.signal.aborted) return
        if (!after || next.length) {
          const first = after === 0
          setEntries(previous => first ? next : [...(previous ?? []), ...next])
          after = next[next.length - 1]?.seq ?? after
        }
        setError("")
      } catch (err) {
        if (!controller.signal.aborted) setError((err as Error).message)
      }
      if (active && !controller.signal.aborted) timer = setTimeout(load, 650)
    }
    void load()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [run.id, active])

  const rows = entries?.filter(entry => includeReplies || entry.kind !== "output")
  return (
    <section className="grid min-w-0 gap-2 rounded-xl border border-[var(--board-line-soft)] bg-[var(--board-lane)] px-3 py-2.5" aria-label="执行过程">
      <h3 className="text-xs font-medium text-foreground">执行过程</h3>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {!rows?.length && !error && <p className="text-xs text-muted-foreground">{!entries || active ? "等待执行事件…" : "这次运行没有保存执行事件"}</p>}
      {!!rows?.length && (
        <ol aria-label="运行日志" className="grid min-w-0 list-none gap-2 text-xs">
          {rows.map(entry => {
            const meta = EVENT_META[entry.kind] ?? EVENT_META.status
            const Icon = meta.icon
            return (
              <li key={entry.seq} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2.5 gap-y-0.5">
                <time className="font-mono text-[11px] text-muted-foreground" dateTime={new Date(entry.at).toISOString()}>
                  {new Date(entry.at).toLocaleTimeString()}
                </time>
                <div className="min-w-0">
                  <span className={`inline-flex items-center gap-1 font-medium ${meta.color}`}><Icon className="size-3" aria-hidden="true" />{meta.label}</span>
                  <div className="whitespace-pre-wrap wrap-anywhere text-foreground/90">{entry.message}</div>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
