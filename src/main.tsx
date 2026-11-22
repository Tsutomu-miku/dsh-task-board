import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { createRoot } from "react-dom/client"
import { CircleDot, Columns3, Plus, Square, Terminal } from "lucide-react"
import { Alert, AlertDescription } from "./components/ui/alert"
import { Badge } from "./components/ui/badge"
import { Button } from "./components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./components/ui/dialog"
import { Input } from "./components/ui/input"
import { Label } from "./components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select"
import { Separator } from "./components/ui/separator"
import { Textarea } from "./components/ui/textarea"

const columns = [
  { status: "todo", label: "待办", mark: "bg-slate-400" },
  { status: "running", label: "执行中", mark: "bg-teal-600" },
  { status: "review", label: "待验收", mark: "bg-amber-500" },
  { status: "done", label: "完成", mark: "bg-emerald-500" },
] as const
const runLabels = {
  running: "运行中", succeeded: "成功", failed: "失败",
  stopped: "已停止", interrupted: "已中断",
}
const engines = { dsh: "DSH", codex: "Codex" }
type Engine = keyof typeof engines
type State = typeof columns[number]["status"]
type Run = {
  id: string; prompt: string; started: number; status: keyof typeof runLabels;
  output: string; error: string | null; session: string | null;
}
type Task = {
  id: string; title: string; prompt: string; engine: Engine; status: State;
  workdir: string; session: string | null; runs: Run[];
  history: { from: State | null; to: State; cause: string; at: number }[];
}
type BoardData = { cards: Task[]; workdir: string }
const stateLabel = (state: State) => columns.find(column => column.status === state)?.label

function ErrorAlert({ message }: { message: string }) {
  return <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>
}

function summarize(run?: Run) {
  if (!run) return "尚未运行"
  return runLabels[run.status]
}

async function send(payload: object) {
  const response = await fetch("./action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error ?? "操作失败，请确认 DSH 登录状态。")
  }
  return await response.json() as Task
}

function TaskTile({ task, open, canMove }: { task: Task; open: () => void; canMove: boolean }) {
  return (
    <Card draggable={canMove} onDragStart={event => {
      event.dataTransfer.setData("text/x-board-card", task.id)
      event.dataTransfer.effectAllowed = "move"
    }} className="gap-2 py-3.5">
      <CardHeader className="gap-2 px-3.5">
        <div className="flex items-center justify-between gap-2">
          <Badge variant="secondary">{engines[task.engine]}</Badge>
          <span className="text-xs text-muted-foreground">{summarize(task.runs[0])}</span>
        </div>
        <CardTitle className="leading-snug">
          <Button variant="link" className="h-auto justify-start px-0 py-0 text-left text-sm whitespace-normal" onClick={open}>
            {task.title}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3.5">
        <p className="line-clamp-3 break-words text-xs leading-relaxed text-muted-foreground">{task.prompt}</p>
      </CardContent>
    </Card>
  )
}

function CreateDialog({ open, setOpen, create }: {
  open: boolean; setOpen: (open: boolean) => void; create: (input: object) => Promise<void>;
}) {
  const [title, setTitle] = useState("")
  const [prompt, setPrompt] = useState("")
  const [engine, setEngine] = useState<Engine>("dsh")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError("")
    try {
      await create({ title, prompt, engine })
      setOpen(false)
      setTitle("")
      setPrompt("")
    } catch (error) {
      setError(error instanceof Error ? error.message : "无法新建任务。")
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建任务</DialogTitle>
          <DialogDescription>选择执行器并写下要完成的工作。</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="task-title">标题</Label>
            <Input id="task-title" value={title} onChange={e => setTitle(e.target.value)} required maxLength={120} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="engine">执行器</Label>
            <Select value={engine} onValueChange={value => setEngine(value as Engine)}>
              <SelectTrigger id="engine"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="dsh">DSH</SelectItem><SelectItem value="codex">Codex</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="task-prompt">任务说明</Label>
            <Textarea id="task-prompt" className="min-h-24" value={prompt} onChange={e => setPrompt(e.target.value)} required maxLength={16000} />
          </div>
          {error && <ErrorAlert message={error} />}
          <DialogFooter><Button disabled={busy} type="submit">创建卡片</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type TaskAction = "move" | "run" | "stop"

function TaskDialog({ task, running, onClose, action }: {
  task: Task; running?: Task; onClose: () => void; action: (type: TaskAction, payload: object) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState(task.prompt)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [stopping, setStopping] = useState(false)
  const active = task.status === "running"

  async function change(type: TaskAction, payload: object) {
    setBusy(true)
    setError("")
    try {
      await action(type, payload)
      if (type === "stop") setStopping(true)
    } catch (error) {
      setError(error instanceof Error ? error.message : "无法更新任务。")
    } finally { setBusy(false) }
  }
  useEffect(() => { if (!active) setStopping(false) }, [active])

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-h-[88vh] overflow-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{task.title}</DialogTitle>
          <DialogDescription className="break-all">{engines[task.engine]} · {stateLabel(task.status)} · {task.workdir}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="run-prompt">任务说明</Label>
          <Textarea id="run-prompt" disabled={active} value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={16000} className="min-h-24" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {active ? <Button variant="destructive" disabled={busy || stopping} onClick={() => void change("stop", {})}>
            <Square aria-hidden="true" />{stopping ? "正在停止…" : "停止运行"}
          </Button> : <>
            <Button disabled={!!running || !prompt.trim() || busy} onClick={() => void change("run", { prompt, resume: false })}>开始运行</Button>
            {task.session && <Button variant="outline" disabled={!!running || !prompt.trim() || busy} onClick={() => void change("run", { prompt, resume: true })}>继续会话</Button>}
            <Select value={task.status} disabled={busy} onValueChange={status => void change("move", { status })}>
              <SelectTrigger aria-label="移动卡片"><SelectValue /></SelectTrigger>
              <SelectContent>{columns.filter(column => column.status !== "running").map(column =>
                <SelectItem key={column.status} value={column.status}>{column.label}</SelectItem>
              )}</SelectContent>
            </Select>
          </>}
        </div>
        {running && !active && <p className="text-sm text-muted-foreground">正在运行「{running.title}」。</p>}
        {error && <ErrorAlert message={error} />}
        {task.runs.length > 0 && <>
          <Separator />
          <div className="grid gap-3">
            <h3 className="font-medium">运行记录</h3>
            {task.runs.map(run => <section key={run.id} className="grid gap-2 rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={run.error ? "destructive" : "secondary"}>{runLabels[run.status]}</Badge>
                <time className="text-xs text-muted-foreground">{new Date(run.started).toLocaleString()}</time>
              </div>
              {run.session && <code className="break-all text-xs text-muted-foreground">{run.session}</code>}
              {run.error && <ErrorAlert message={run.error} />}
              {run.output && <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-3 text-xs">{run.output}</pre>}
            </section>)}
          </div>
        </>}
        <Separator />
        <div className="grid gap-2">
          <h3 className="font-medium">状态记录</h3>
          {[...task.history].reverse().map((entry, index) => <div key={index} className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline">{entry.from ? `${stateLabel(entry.from)} → ${stateLabel(entry.to)}` : "创建任务"}</Badge>
            <time className="text-xs text-muted-foreground">{new Date(entry.at).toLocaleString()}</time>
          </div>)}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function App() {
  const [board, setBoard] = useState<BoardData | null>(null)
  const [error, setError] = useState("")
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<State | null>(null)
  const revision = useRef(0)

  const refresh = useCallback(async () => {
    const current = ++revision.current
    try {
      const response = await fetch("./state")
      if (!response.ok) throw new Error()
      const data = await response.json()
      if (current === revision.current) {
        setBoard(data)
        setError("")
      }
    } catch {
      if (current === revision.current) setError("暂时无法连接 DSH 看板。")
    }
  }, [])
  useEffect(() => {
    void refresh()
    const id = setInterval(refresh, 2500)
    return () => clearInterval(id)
  }, [refresh])
  const task = board?.cards.find(card => card.id === selected)
  const running = board?.cards.find(card => card.status === "running")

  async function update(payload: object) {
    let card
    try { card = await send(payload) }
    catch (error) { void refresh(); throw error }
    ++revision.current
    setBoard(current => current && ({
      ...current, cards: current.cards.some(entry => entry.id === card.id)
        ? current.cards.map(entry => entry.id === card.id ? card : entry)
        : [...current.cards, card],
    }))
  }

  function drop(id: string, status: State) {
    const card = board?.cards.find(entry => entry.id === id)
    if (card && card.status !== "running" && card.status !== status && status !== "running") {
      void update({ action: "move", id, from: card.status, status }).catch(err => setError(err.message))
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-lg bg-primary p-2 text-primary-foreground"><Columns3 className="size-5" aria-hidden="true" /></div>
            <h1 className="text-lg font-semibold">任务看板</h1>
          </div>
          <Button disabled={!board} onClick={() => setCreating(true)}><Plus aria-hidden="true" />新建任务</Button>
        </div>
      </header>
      <main className="mx-auto grid max-w-7xl gap-5 px-5 py-6 sm:px-8">
        {board && <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <Terminal className="size-4 shrink-0" aria-hidden="true" /><span className="break-all">{board.workdir}</span>
        </div>}
        {error && <ErrorAlert message={error} />}
        {board && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" onDragEnd={() => setDropTarget(null)}>
          {columns.map(column => {
            const tasks = board.cards.filter(task => task.status === column.status)
            return (
              <section key={column.status} aria-label={column.label}
                className={`min-h-48 rounded-xl border p-3 ${dropTarget === column.status ? "bg-accent" : "bg-muted/60"}`}
                onDragOver={event => {
                  if (column.status === "running" || !event.dataTransfer.types.includes("text/x-board-card")) return
                  event.preventDefault()
                  setDropTarget(column.status)
                }}
                onDrop={event => {
                  event.preventDefault()
                  setDropTarget(null)
                  drop(event.dataTransfer.getData("text/x-board-card"), column.status)
                }}>
                <div className="mb-3 flex items-center gap-2 px-1 py-1">
                  <span className={`size-2 rounded-full ${column.mark}`} />
                  <h2 className="text-sm font-semibold">{column.label}</h2>
                  <Badge variant="outline" className="ml-auto">{tasks.length}</Badge>
                </div>
                <div className="grid gap-2.5">
                  {tasks.map(task => <TaskTile key={task.id} task={task} canMove={task.status !== "running"} open={() => setSelected(task.id)} />)}
                  {!tasks.length && <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-4 text-xs text-muted-foreground">
                    <CircleDot className="size-3" aria-hidden="true" />暂无任务
                  </div>}
                </div>
              </section>
            )
          })}
        </div>}
      </main>
      <CreateDialog open={creating} setOpen={setCreating} create={payload => update({ ...payload, action: "create" })} />
      {task && <TaskDialog key={task.id} task={task} running={running} onClose={() => setSelected(null)}
        action={(action, payload) => update({ ...payload, action, id: task.id, from: task.status })} />}
    </div>
  )
}

createRoot(document.getElementById("root")!).render(<App />)
