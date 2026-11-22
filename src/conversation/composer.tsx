import { type FormEvent, useEffect, useState } from "react"
import { ArrowUp, Cpu, Plus, Square } from "lucide-react"
import { Alert, AlertDescription } from "../components/ui/alert"
import { Button } from "../components/ui/button"
import { Card } from "../components/ui/card"
import { Textarea } from "../components/ui/textarea"
import type { Executor, ModelSelection, Save, Task } from "../contracts"
import { ModelPicker } from "../models/model-picker"
import { useEnvironment } from "../models/use-environment"

export function Composer({ task, executor, running, save }: {
  task: Task; executor?: Executor; running?: Task; save: Save;
}) {
  const [draft, setDraft] = useState(task.runs.length ? "" : task.prompt)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [showModel, setShowModel] = useState(false)
  const [fresh, setFresh] = useState(false)
  const [model, setModel] = useState<ModelSelection | null>(null)
  const active = task.status === "running"
  const resume = !!task.session && !fresh
  const previous = resume ? task.runs.find(run => run.session === task.session) : undefined
  const workdir = previous?.executor.workdir ?? executor?.workdir ?? task.workdir
  const { environment, checking } = useEnvironment(workdir, showModel && !active)
  const canSend = !running && !!executor?.enabled && !!draft.trim() && !busy

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSend) return
    const submitted = draft
    setBusy(true)
    setError("")
    try {
      await save({ action: "run", id: task.id, from: task.status, prompt: submitted, resume, ...(model ? { model } : {}) })
      setDraft(current => current === submitted ? "" : current)
      setFresh(false)
      setModel(null)
      setShowModel(false)
    } catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }

  async function stop() {
    setStopping(true)
    setError("")
    try { await save({ action: "stop", id: task.id, runId: task.runs[0]?.id }) }
    catch (error) { setError((error as Error).message); setStopping(false) }
  }
  useEffect(() => { if (!active) setStopping(false) }, [active])

  return (
    <div>
      <form onSubmit={send} className="mx-auto grid max-w-[52rem] gap-2 px-4 pt-2 pb-4 md:px-6 md:pb-5">
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <Card className="conversation-composer grid min-w-0 gap-2 p-2.5">
          <Textarea value={draft} aria-label="发送消息" placeholder={resume ? "继续追问…" : "输入要交给执行器的任务…"}
            className="max-h-48 min-h-16 resize-none border-0 bg-transparent text-[.9375rem] shadow-none focus-visible:ring-0 dark:bg-transparent" maxLength={16000}
            onChange={event => setDraft(event.target.value)} onKeyDown={event => {
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return
              event.preventDefault()
              event.stopPropagation()
              if (canSend) event.currentTarget.form?.requestSubmit()
            }} />
          {showModel && !active && <div className="px-2">
            <ModelPicker id="conversation-model" models={environment?.models[task.engine] ?? []} value={model}
              onChange={setModel} defaultLabel={resume ? "沿用上次运行" : "跟随执行器"} checking={checking} disabled={busy} />
          </div>}
          <div className="flex flex-wrap items-center gap-2 border-t px-1 pt-2">
            {!active && <>
              <Button type="button" size="sm" variant={showModel ? "secondary" : "ghost"} className="max-w-full" aria-expanded={showModel} onClick={() => setShowModel(value => !value)}><Cpu aria-hidden="true" /><span className="truncate">{model?.id ?? "模型"}</span></Button>
              {task.session && <Button type="button" size="sm" variant={fresh ? "secondary" : "ghost"} aria-pressed={fresh} onClick={() => setFresh(value => !value)}><Plus aria-hidden="true" />{fresh ? "即将另起会话" : "另起会话"}</Button>}
            </>}
            {active ? <Button type="button" className="conversation-send ml-auto rounded-full" variant="destructive" disabled={stopping} onClick={() => void stop()}><Square aria-hidden="true" />{stopping ? "正在停止…" : "停止运行"}</Button>
              : <Button type="submit" className="conversation-send ml-auto rounded-full" disabled={!canSend}>{resume ? "发送" : "开始会话"}<ArrowUp aria-hidden="true" /></Button>}
          </div>
        </Card>
        {!executor?.enabled && !active ? <p className="text-xs text-muted-foreground">请先启用此执行器。</p>
          : running && !active ? <p className="text-xs text-muted-foreground">正在运行「{running.title}」。</p> : null}
      </form>
    </div>
  )
}
