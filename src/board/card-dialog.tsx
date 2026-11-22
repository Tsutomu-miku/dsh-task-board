import { useEffect, useState } from "react"
import { Play, RotateCcw, Square } from "lucide-react"
import { Alert, AlertDescription } from "../components/ui/alert"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog"
import { Label } from "../components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select"
import { Separator } from "../components/ui/separator"
import { Textarea } from "../components/ui/textarea"
import { columns, engines, stateLabel, type Executor, type ModelSelection, type Save, type Task } from "../contracts"
import { ModelPicker } from "../models/model-picker"
import { useEnvironment } from "../models/use-environment"
import { RunDetails } from "./run-details"

export function CardDialog({ task, executor, running, close, save, openSession }: {
  task: Task; executor?: Executor; running?: Task; close: () => void; save: Save; openSession: (id: string) => void;
}) {
  const [prompt, setPrompt] = useState(task.prompt)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [stopping, setStopping] = useState(false)
  const [model, setModel] = useState<ModelSelection | null>(null)
  const active = task.status === "running"
  const { environment, checking } = useEnvironment(executor?.workdir ?? task.workdir, !active)
  const modelOverride = model ? { model } : {}

  async function change(action: string, fields: object) {
    if (busy) return
    setBusy(true)
    setError("")
    try {
      await save({ ...fields, action, id: task.id, from: task.status })
      if (action === "stop") setStopping(true)
    } catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  useEffect(() => { if (!active) setStopping(false) }, [active])
  const canRun = !running && !!prompt.trim() && !!executor?.enabled && !busy

  return (
    <Dialog open onOpenChange={open => { if (!open) close() }}>
      <DialogContent className="max-h-[88vh] overflow-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{task.title}</DialogTitle>
          <DialogDescription className="break-all">{executor?.name ?? engines[task.engine]} · {stateLabel(task.status)} · {task.workdir}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="run-prompt">任务说明</Label>
          <Textarea id="run-prompt" disabled={active} value={prompt} onChange={event => setPrompt(event.target.value)} maxLength={16000} className="min-h-20" />
        </div>
        {!active && <ModelPicker id="run-model" models={environment?.models[task.engine] ?? []} value={model}
          onChange={setModel} defaultLabel="跟随执行器或上次运行" checking={checking} disabled={busy} />}
        <div className="flex flex-wrap items-center gap-2">
          {active ? <Button variant="destructive" disabled={busy || stopping} onClick={() => void change("stop", { runId: task.runs[0]?.id })}>
            <Square aria-hidden="true" />{stopping ? "正在停止…" : "停止运行"}
          </Button> : <>
            <Button disabled={!canRun} onClick={() => void change("run", { prompt, resume: false, ...modelOverride })}><Play aria-hidden="true" />开始运行</Button>
            {task.session && <Button variant="outline" disabled={!canRun} onClick={() => void change("run", { prompt, resume: true, ...modelOverride })}><RotateCcw aria-hidden="true" />继续会话</Button>}
            <Select value={task.status} disabled={busy} onValueChange={status => void change("move", { status })}>
              <SelectTrigger aria-label="移动卡片"><SelectValue /></SelectTrigger>
              <SelectContent>{columns.filter(column => column.status !== "running").map(column => <SelectItem key={column.status} value={column.status}>{column.label}</SelectItem>)}</SelectContent>
            </Select>
          </>}
        </div>
        {!executor?.enabled && !active && <p className="text-sm text-muted-foreground">此执行器已停用。</p>}
        {running && !active && <p className="text-sm text-muted-foreground">正在运行「{running.title}」。</p>}
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {task.runs.length > 0 && <>
          <Separator />
          <section className="grid gap-3" aria-label="运行记录">
            <h3 className="font-medium">运行记录</h3>
            {task.runs.map(run => <RunDetails key={run.id} run={run} openSession={openSession} />)}
          </section>
        </>}
        <Separator />
        <section className="grid gap-2" aria-label="状态记录">
          <h3 className="font-medium">状态记录</h3>
          {[...task.history].reverse().map((entry, index) => <div key={index} className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline">{entry.from ? `${stateLabel(entry.from)} → ${stateLabel(entry.to)}` : "创建任务"}</Badge>
            <time className="text-xs text-muted-foreground">{new Date(entry.at).toLocaleString()}</time>
          </div>)}
        </section>
      </DialogContent>
    </Dialog>
  )
}
