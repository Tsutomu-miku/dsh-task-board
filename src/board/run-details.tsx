import { useEffect, useState } from "react"
import { ArrowUpRight, List } from "lucide-react"
import { Alert, AlertDescription } from "../components/ui/alert"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Card } from "../components/ui/card"
import { request } from "../api"
import { runLabels, type Run, type RunEvent } from "../contracts"

const kinds = { status: "状态", tool: "工具", output: "输出", error: "错误" }

function RunLog({ id, active }: { id: string; active: boolean }) {
  const [entries, setEntries] = useState<RunEvent[] | null>(null)
  const [error, setError] = useState("")
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function read() {
      try {
        const log = await request<RunEvent[]>(`events?run=${encodeURIComponent(id)}`, { signal: controller.signal })
        if (controller.signal.aborted) return
        setEntries(log)
        setError("")
      } catch (error) {
        if (!controller.signal.aborted) setError((error as Error).message)
      }
      if (active && !controller.signal.aborted) timer = setTimeout(read, 1000)
    }
    void read()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [id, active])
  if (error) return <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
  if (!entries) return <p className="text-muted-foreground">正在加载日志…</p>
  if (!entries.length) return <p className="text-muted-foreground">暂无运行事件</p>
  return (
    <ol aria-label="运行日志" className="grid max-h-60 list-none gap-2 overflow-auto rounded-lg border bg-muted/60 p-3 text-xs">
      {entries.map(entry => <li key={entry.seq} className="grid grid-cols-[auto_1fr] gap-3">
        <time className="whitespace-nowrap text-muted-foreground">{new Date(entry.at).toLocaleTimeString()}</time>
        <div className="min-w-0"><span className="mr-2 font-medium">{kinds[entry.kind]}</span><span className="whitespace-pre-wrap wrap-anywhere">{entry.message}</span></div>
      </li>)}
    </ol>
  )
}

export function RunDetails({ run, openSession }: { run: Run; openSession: (id: string) => void }) {
  const active = run.status === "running"
  const [expanded, setExpanded] = useState(false)
  return (
    <Card className="board-surface grid gap-2.5 p-3.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={run.error ? "destructive" : "secondary"}>{runLabels[run.status]}</Badge>
        <time className="text-xs text-muted-foreground">{new Date(run.started).toLocaleString()}</time>
        <span className="text-xs text-muted-foreground">{run.executor.name}{run.executor.model && ` · ${run.executor.model.id}`}{run.executor.model?.effort && ` · ${run.executor.model.effort}`}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}><List aria-hidden="true" />{expanded ? "收起日志" : "查看日志"}</Button>
        {run.session && run.executor.engine === "dsh" && <Button variant="ghost" size="sm" onClick={() => openSession(run.session!)}>打开 DSH 会话<ArrowUpRight aria-hidden="true" /></Button>}
        {run.session && run.executor.engine === "codex" && <code className="break-all text-xs text-muted-foreground">{run.session}</code>}
      </div>
      {expanded && <RunLog id={run.id} active={active} />}
      {run.error && <Alert variant="destructive"><AlertDescription>{run.error}</AlertDescription></Alert>}
    </Card>
  )
}
