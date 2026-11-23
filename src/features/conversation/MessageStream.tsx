import { type ReactNode, useLayoutEffect, useRef, useState } from "react"
import Markdown from "react-markdown"
import { Check, Copy, Cpu, FolderOpen, GitBranch, Loader2, MessageSquareText } from "lucide-react"
import { Alert, AlertDescription } from "../../shared/components/ui/alert"
import { EngineAvatar } from "../../shared/components/engine-badge"
import { RunStatusPill } from "../../shared/components/status-badge"
import { formatDuration, formatShortPath } from "../../shared/lib/format"
import { RUN_STATUS_LABELS, type Executor, type TaskItem, type Transcript } from "../../shared/types/board"
import { RunActivity } from "./RunActivity"

function CodeBlock({ className, children }: { className?: string; children?: ReactNode }) {
  const [copied, setCopied] = useState(false)
  const language = /language-([\w-]+)/.exec(className ?? "")?.[1]
  const raw = String(children ?? "").replace(/\n$/, "")

  function handleCopy() {
    void navigator.clipboard?.writeText(raw).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  }

  return (
    <div className="my-2.5 overflow-hidden rounded-xl border border-[var(--board-line)] bg-[var(--dsw-alias-markdown-code-block,var(--board-lane))]">
      <div className="flex items-center justify-between border-b border-[var(--board-line-soft)] px-3 py-1.5 text-[11px] text-muted-foreground">
        <span className="font-mono uppercase">{language ?? "code"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {copied ? <Check className="size-3 text-[var(--status-done)]" /> : <Copy className="size-3" />}
          <span>{copied ? "已复制" : "复制"}</span>
        </button>
      </div>
      <pre className="m-0 overflow-x-auto px-3.5 py-2.5 text-[12.5px] leading-5">
        <code className={className}>{raw}</code>
      </pre>
    </div>
  )
}

function MarkdownReply({ text }: { text: string }) {
  return (
    <div className="task-markdown min-w-0 wrap-anywhere">
      <Markdown
        skipHtml
        disallowedElements={["img"]}
        components={{
          a: ({ href, children }) =>
            href ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ) : (
              <>{children}</>
            ),
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children, ...props }) => {
            const isBlock = Boolean(className) || String(children ?? "").includes("\n")
            if (isBlock) return <CodeBlock className={className}>{children}</CodeBlock>
            return (
              <code className={className} {...props}>
                {children}
              </code>
            )
          },
        }}
      >
        {text}
      </Markdown>
    </div>
  )
}

export function MessageStream({
  task,
  executor,
  transcript,
  error,
}: {
  task: TaskItem
  executor?: Executor
  transcript?: Transcript
  error: string
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const autoFollowRef = useRef(true)
  const newestRun = task.runs[0]
  const activePreview =
    newestRun?.status === "running" && transcript?.preview?.runId === newestRun.id
      ? transcript.preview.text
      : ""

  useLayoutEffect(() => {
    const container = scrollerRef.current
    const content = contentRef.current
    if (!container || !content) return
    function follow() {
      if (container && autoFollowRef.current) container.scrollTop = container.scrollHeight
    }
    follow()
    const observer = new ResizeObserver(follow)
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  const repliesByRun = new Map<string, { id: number; text: string }[]>()
  for (const reply of transcript?.replies ?? []) {
    const bucket = repliesByRun.get(reply.runId) ?? []
    bucket.push(reply)
    repliesByRun.set(reply.runId, bucket)
  }

  let previousSession: string | null = null

  return (
    <div
      ref={scrollerRef}
      onScroll={() => {
        const el = scrollerRef.current
        if (el) autoFollowRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      }}
      className="min-h-0 overflow-y-auto"
    >
      <div ref={contentRef} className="conversation-column grid gap-7 px-4 py-6 md:px-6 md:py-8" role="region" aria-label="会话消息">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!task.runs.length && (
          <div className="mx-auto my-8 flex max-w-lg flex-col items-center gap-4 rounded-2xl border border-[var(--board-line)] bg-[var(--board-lane)] px-6 py-8 text-center">
            <EngineAvatar engine={task.engine} size="md" />
            <div className="space-y-1.5">
              <h2 className="text-[15px] font-medium text-foreground">准备开始任务会话</h2>
              <p className="text-[13px] leading-5 text-muted-foreground">
                初始任务说明已预填在下方输入框，可直接发送启动执行，或补充上下文后再开始。
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-1 shadow-2xs">
                <MessageSquareText className="size-3.5" aria-hidden="true" />
                {executor?.name ?? task.engine.toUpperCase()}
              </span>
              {executor?.model && (
                <span className="inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-1 shadow-2xs">
                  <Cpu className="size-3.5" aria-hidden="true" />
                  {executor.model.id}
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-1 shadow-2xs" title={task.workdir}>
                <FolderOpen className="size-3.5" aria-hidden="true" />
                {formatShortPath(task.workdir)}
              </span>
            </div>
          </div>
        )}

        {[...task.runs].reverse().map(run => {
          const replies = repliesByRun.get(run.id) ?? (run.output ? [{ id: 0, text: run.output }] : [])
          const startedFreshSession = Boolean(run.session && previousSession && run.session !== previousSession)
          if (run.session) previousSession = run.session

          return (
            <article key={run.id} className="grid gap-4">
              {startedFreshSession && (
                <div className="flex items-center gap-3 py-1 text-xs text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--board-line)] bg-[var(--board-lane)] px-2.5 py-0.5 text-[11px]">
                    <GitBranch className="size-3" aria-hidden="true" />
                    已另起新会话
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              )}

              <div className="flex flex-col items-end gap-1">
                <div
                  className="conversation-user-bubble max-w-[min(88%,38rem)] px-4 py-2.5 whitespace-pre-wrap wrap-anywhere text-foreground"
                  aria-label="你的消息"
                >
                  {run.prompt}
                </div>
                <time className="px-1 text-[11px] text-muted-foreground/80">
                  {new Date(run.started).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </time>
              </div>

              <RunActivity run={run} />

              {(replies.length > 0 || run.status === "running") && (
                <section className="flex min-w-0 items-start gap-3" aria-label={`${run.executor.name} 回复`}>
                  <EngineAvatar engine={run.executor.engine} size="sm" />
                  <div className="min-w-0 flex-1 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium text-foreground">{run.executor.name}</span>
                      {run.executor.model && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          <Cpu className="size-3" aria-hidden="true" />
                          {run.executor.model.id}
                          {run.executor.model.effort ? ` · ${run.executor.model.effort}` : ""}
                        </span>
                      )}
                      {run.finished && (
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {formatDuration(run.started, run.finished)}
                        </span>
                      )}
                    </div>

                    {replies.map(reply => (
                      <MarkdownReply key={reply.id} text={reply.text} />
                    ))}

                    {run.status === "running" && run.id === newestRun?.id && (
                      <>
                        {activePreview && <MarkdownReply text={activePreview} />}
                        <p
                          role="status"
                          className="inline-flex items-center gap-2 rounded-full bg-[var(--status-running-soft)] px-3 py-1 text-xs font-medium text-[var(--status-running)]"
                        >
                          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                          <span>{activePreview ? "正在生成回复…" : "执行器正在处理中…"}</span>
                        </p>
                      </>
                    )}
                  </div>
                </section>
              )}

              {run.status === "succeeded" && !replies.length && (
                <div className="pl-10">
                  <RunStatusPill status="succeeded" />
                </div>
              )}

              {run.error && (
                <div className="pl-10">
                  <Alert variant="destructive">
                    <AlertDescription>{run.error}</AlertDescription>
                  </Alert>
                </div>
              )}

              {!run.error && ["stopped", "interrupted", "failed"].includes(run.status) && (
                <div className="flex items-center gap-2 pl-10 text-xs text-muted-foreground">
                  <RunStatusPill status={run.status} />
                  <span>{RUN_STATUS_LABELS[run.status]}</span>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}
