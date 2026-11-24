import { AlertCircle, CheckCircle2, ChevronRight, Info, MessageSquare, Terminal, Wrench } from "lucide-react"
import { Alert, AlertDescription } from "../../shared/components/ui/alert"
import { RUN_STATUS_LABELS, type RunEvent, type RunRecord } from "../../shared/types/board"

const EVENT_META = {
  status: { label: "状态", icon: Info },
  command: { label: "命令", icon: Terminal },
  tool: { label: "调用", icon: Wrench },
  tool_result: { label: "结果", icon: CheckCircle2 },
  output: { label: "回复", icon: MessageSquare },
  error: { label: "错误", icon: AlertCircle },
} satisfies Record<RunEvent["kind"], object>

export function RunActivity({ run, entries, error }: { run: RunRecord; entries: RunEvent[] | null; error: string }) {
  // The API cursor follows insertion order. Display source event time, with the
  // cursor sequence breaking ties between events recorded in the same millisecond.
  const rows = entries?.slice().sort((a, b) => a.at - b.at || a.seq - b.seq)
  const active = run.status === "running"
  return (
    <section className="conversation-activity min-w-0" aria-label="执行过程">
      <details>
        <summary className="conversation-activity-heading">
          <span>执行过程</span>
          <span className="conversation-meta ml-auto text-right tabular-nums">
            {RUN_STATUS_LABELS[run.status]}{error ? " · 日志加载失败" : rows ? ` · ${rows.length} 条` : ""}
          </span>
          <ChevronRight className="conversation-activity-chevron size-3.5 shrink-0" aria-hidden="true" />
        </summary>
        <div className="conversation-activity-body grid gap-2">
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          {!rows?.length && !error && <p className="text-xs text-muted-foreground">{!entries || active ? "等待执行事件…" : "这次运行没有保存执行事件"}</p>}
          {!!rows?.length && (
            <ol role="list" aria-label="运行日志" className="conversation-activity-list min-w-0">
              {rows.map(entry => {
                const meta = EVENT_META[entry.kind] ?? EVENT_META.status
                const Icon = meta.icon
                return (
                  <li key={entry.seq} className="conversation-activity-row" data-kind={entry.kind}>
                    <Icon className="conversation-activity-icon" aria-hidden="true" />
                    <div className="min-w-0">
                      <div className="conversation-meta flex items-start gap-2">
                        <span className="sr-only">{meta.label}</span>
                        {entry.kind === "command" && <code className="min-w-0 flex-1 whitespace-pre-wrap wrap-anywhere">{entry.message}</code>}
                        {entry.kind !== "command" && entry.kind !== "tool_result" && (
                          <span className="min-w-0 flex-1 whitespace-pre-wrap wrap-anywhere">{entry.message}</span>
                        )}
                        {entry.kind === "tool_result" && <span className="flex-1">{meta.label}</span>}
                        <time className="shrink-0 text-xs tabular-nums" dateTime={new Date(entry.at).toISOString()}>
                          {new Date(entry.at).toLocaleTimeString()}
                        </time>
                      </div>
                      {entry.kind === "tool_result" && <pre className="conversation-activity-output whitespace-pre-wrap wrap-anywhere">{entry.message}</pre>}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </details>
    </section>
  )
}
