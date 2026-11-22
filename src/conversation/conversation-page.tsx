import { useState } from "react"
import { ArrowLeft, ArrowUpRight, History } from "lucide-react"
import { Alert, AlertDescription } from "../components/ui/alert"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select"
import { columns, engines, stateLabel, type Executor, type Save, type Task } from "../contracts"
import { Composer } from "./composer"
import { MessageList } from "./message-list"
import { RunHistory } from "./run-history"
import { useConversation } from "./use-conversation"

export function ConversationPage({ task, executor, running, close, save, openSession }: {
  task: Task; executor?: Executor; running?: Task; close: () => void; save: Save; openSession: (id: string) => void;
}) {
  const { transcript, error } = useConversation(task.id, task.runs[0])
  const [history, setHistory] = useState(false)
  const [moveError, setMoveError] = useState("")
  const active = task.status === "running"

  async function move(status: string) {
    setMoveError("")
    try { await save({ action: "move", id: task.id, from: task.status, status }) }
    catch (error) { setMoveError((error as Error).message) }
  }

  return (
    <section data-task-conversation className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 p-3 md:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon" aria-label="返回看板" title="返回看板" onClick={close}><ArrowLeft aria-hidden="true" /></Button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold" title={task.title}>{task.title}</h1>
              <p className="truncate text-xs text-muted-foreground" title={task.workdir}>{executor?.name ?? engines[task.engine]} · {task.workdir}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {active ? <Badge variant="secondary">{stateLabel(task.status)}</Badge> : <Select value={task.status} onValueChange={status => void move(status)}>
              <SelectTrigger size="sm" aria-label="移动卡片"><SelectValue /></SelectTrigger>
              <SelectContent>{columns.filter(column => column.status !== "running").map(column => <SelectItem key={column.status} value={column.status}>{column.label}</SelectItem>)}</SelectContent>
            </Select>}
            <Button variant="outline" size="sm" onClick={() => setHistory(true)}><History aria-hidden="true" />运行记录</Button>
            {task.engine === "dsh" && task.session && <Button variant="ghost" size="sm" onClick={() => openSession(task.session!)}>打开 DSH 会话<ArrowUpRight aria-hidden="true" /></Button>}
          </div>
        </div>
        {moveError && <div className="mx-auto max-w-5xl px-4 pb-2"><Alert variant="destructive"><AlertDescription>{moveError}</AlertDescription></Alert></div>}
      </header>
      <MessageList task={task} transcript={transcript} error={error} />
      <Composer task={task} executor={executor} running={running} save={save} />
      {history && <RunHistory task={task} close={() => setHistory(false)} openSession={openSession} />}
    </section>
  )
}
