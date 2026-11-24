import { AlertCircle, CheckCircle2, ChevronRight, Info, MessageSquare, Terminal, Wrench } from "lucide-react"
import { Alert, AlertDescription } from "../../shared/components/ui/alert"
import { RUN_STATUS_LABELS, type RunEvent, type RunRecord } from "../../shared/types/board"

import type { useRunEvents } from "./useRunEvents"

const COPY = {
  en: {
    title: "Run activity", log: "Run log", loadError: "Log unavailable",
    waiting: "Waiting for events…", empty: "No events recorded",
    older: "Older events", newer: "Newer events",
    status: "Status", command: "Command", tool: "Tool call", tool_result: "Result", output: "Reply", error: "Error",
    running: "Running", succeeded: "Succeeded", failed: "Failed", stopped: "Stopped", interrupted: "Interrupted",
  },
  zh: {
    title: "执行过程", log: "运行日志", loadError: "日志加载失败",
    waiting: "等待执行事件…", empty: "这次运行没有保存执行事件",
    older: "较早事件", newer: "较新事件",
    status: "状态", command: "命令", tool: "调用", tool_result: "结果", output: "回复", error: "错误",
    ...RUN_STATUS_LABELS,
  },
}

const EVENT_META = {
  status: Info,
  command: Terminal,
  tool: Wrench,
  tool_result: CheckCircle2,
  output: MessageSquare,
  error: AlertCircle,
} satisfies Record<RunEvent["kind"], object>

export function RunActivity({ run, entries, error, opened, onOpenChange, older, newer }:
  { run: RunRecord } & ReturnType<typeof useRunEvents>) {
  const lang = document.documentElement.lang || navigator.language
  const copy = lang.toLowerCase().startsWith("zh") ? COPY.zh : COPY.en
  // The API cursor follows insertion order. Display source event time, with the
  // cursor sequence breaking ties between events recorded in the same millisecond.
  const rows = entries?.slice().sort((a, b) => a.at - b.at || a.seq - b.seq)
  const active = run.status === "running"
  return (
    <section className="conversation-activity min-w-0" aria-label={copy.title}>
      <details onToggle={event => onOpenChange(event.currentTarget.open)}>
        <summary className="conversation-activity-heading">
          <span>{copy.title}</span>
          <span className="conversation-meta ml-auto text-right tabular-nums">
            {copy[run.status]}{error && ` · ${copy.loadError}`}
          </span>
          <ChevronRight className="conversation-activity-chevron size-3.5 shrink-0" aria-hidden="true" />
        </summary>
        {opened && <div className="conversation-activity-body grid gap-2">
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          {!rows?.length && !error && <p className="text-xs text-muted-foreground">{!entries || active ? copy.waiting : copy.empty}</p>}
          {!!rows?.length && (
            <ol role="list" aria-label={copy.log} className="conversation-activity-list min-w-0">
              {rows.map(entry => {
                const Icon = EVENT_META[entry.kind] ?? EVENT_META.status
                const label = copy[entry.kind] ?? copy.status
                return (
                  <li key={entry.seq} className="conversation-activity-row" data-kind={entry.kind}>
                    <Icon className="conversation-activity-icon" aria-hidden="true" />
                    <div className="min-w-0">
                      <div className="conversation-meta flex items-start gap-2">
                        <span className="sr-only">{label}</span>
                        {entry.kind === "command" && <code className="min-w-0 flex-1 whitespace-pre-wrap wrap-anywhere">{entry.message}</code>}
                        {entry.kind !== "command" && entry.kind !== "tool_result" && (
                          <span className="min-w-0 flex-1 whitespace-pre-wrap wrap-anywhere">{entry.message}</span>
                        )}
                        {entry.kind === "tool_result" && <span className="flex-1">{label}</span>}
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
          {(older || newer) && (
            <div className="flex flex-wrap gap-3 text-xs text-link">
              {older && <button type="button" onClick={older} className="hover:underline">{copy.older}</button>}
              {newer && <button type="button" onClick={newer} className="hover:underline">{copy.newer}</button>}
            </div>
          )}
        </div>}
      </details>
    </section>
  )
}
