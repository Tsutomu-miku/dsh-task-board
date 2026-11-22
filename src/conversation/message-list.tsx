import { useLayoutEffect, useRef } from "react"
import Markdown from "react-markdown"
import { Bot, CodeXml, LoaderCircle, MessageSquare } from "lucide-react"
import { Alert, AlertDescription } from "../components/ui/alert"
import { Badge } from "../components/ui/badge"
import { Card } from "../components/ui/card"
import { runLabels, type Task, type Transcript } from "../contracts"

function ReplyText({ text }: { text: string }) {
  return (
    <div className="task-reply min-w-0 wrap-anywhere">
      <Markdown skipHtml disallowedElements={["img"]} components={{
        a: ({ href, children }) => href ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <>{children}</>,
      }}>{text}</Markdown>
    </div>
  )
}

export function MessageList({ task, transcript, error }: { task: Task; transcript?: Transcript; error: string }) {
  const scroller = useRef<HTMLDivElement>(null)
  const follow = useRef(true)
  const newest = task.runs[0]
  const latestMessage = transcript?.replies[transcript.replies.length - 1]?.id
  const activePreview = newest?.status === "running" && transcript?.preview?.runId === newest.id ? transcript.preview.text : ""
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && follow.current) el.scrollTop = el.scrollHeight
  }, [newest?.id, newest?.status, newest?.output, latestMessage, activePreview])
  const byRun = new Map<string, { id: number; text: string }[]>()
  for (const reply of transcript?.replies ?? []) {
    const messages = byRun.get(reply.runId) ?? []
    messages.push(reply)
    byRun.set(reply.runId, messages)
  }
  let previousSession: string | null = null
  return (
    <div className="min-h-0 overflow-y-auto" ref={scroller} onScroll={() => {
      const el = scroller.current
      if (el) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }}>
      <div className="mx-auto grid w-full max-w-[52rem] gap-7 px-4 py-6 md:px-6 md:py-8" role="region" aria-label="会话消息">
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {!task.runs.length && <Card className="board-surface mx-auto my-8 w-full max-w-xs items-center gap-3 px-5 py-7 text-center text-sm text-muted-foreground">
          <span className="board-section-icon grid size-12 place-items-center rounded-xl"><MessageSquare className="size-5" aria-hidden="true" /></span>
          <p>发送任务说明，开始会话。</p>
        </Card>}
        {[...task.runs].reverse().map(run => {
          const replies = byRun.get(run.id) ?? (run.output ? [{ id: 0, text: run.output }] : [])
          const newSession = run.session && previousSession && run.session !== previousSession
          const EngineIcon = run.executor.engine === "dsh" ? Bot : CodeXml
          if (run.session) previousSession = run.session
          return (
            <article className="grid gap-4" key={run.id}>
              {newSession && <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />新会话<span className="h-px flex-1 bg-border" /></div>}
              <div className="conversation-user-message ml-auto max-w-[min(90%,38rem)] rounded-2xl rounded-tr-md border px-4 py-3 text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap" aria-label="你的消息">{run.prompt}</div>
              {(replies.length > 0 || run.status === "running") && <Card role="region" className="board-surface min-w-0 gap-3 px-4 py-3.5 md:px-5" aria-label={`${run.executor.name} 回复`}>
                <div className="flex flex-wrap items-center gap-2.5 border-b pb-2.5 text-sm font-medium">
                  <span className="board-section-icon grid size-7 shrink-0 place-items-center rounded-lg"><EngineIcon className="size-4" aria-hidden="true" /></span>
                  <span className="min-w-0 wrap-anywhere">{run.executor.name}</span>
                  {run.executor.model && <Badge variant="secondary" className="max-w-full whitespace-normal">{run.executor.model.id}</Badge>}
                </div>
                {replies.map(reply => <ReplyText text={reply.text} key={reply.id} />)}
                {run.status === "running" && run.id === newest?.id && <>
                  {activePreview && <ReplyText text={activePreview} />}
                  <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status"><LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />{activePreview ? "正在回复" : "正在处理"}</p>
                </>}
              </Card>}
              {run.status === "succeeded" && !replies.length && <p className="text-xs text-muted-foreground">执行完成</p>}
              {run.error && <Alert variant="destructive"><AlertDescription>{run.error}</AlertDescription></Alert>}
              {!run.error && ["stopped", "interrupted", "failed"].includes(run.status) && <p className="text-xs text-muted-foreground">{runLabels[run.status]}</p>}
            </article>
          )
        })}
      </div>
    </div>
  )
}
