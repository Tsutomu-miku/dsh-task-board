import { type FormEvent, useEffect, useState } from "react"
import { ArrowUp, Cpu, RotateCcw, Square } from "lucide-react"
import { Alert, AlertDescription } from "../../shared/components/ui/alert"
import { Button } from "../../shared/components/ui/button"
import { Textarea } from "../../shared/components/ui/textarea"
import { ModelPicker } from "../../shared/components/model-picker"
import { useEnvironment } from "../../shared/hooks/use-environment"
import type { BoardSaveFn, Executor, ModelSelection, TaskItem } from "../../shared/types/board"

export function ComposerBox({
  task,
  executor,
  running,
  save,
}: {
  task: TaskItem
  executor?: Executor
  running?: TaskItem
  save: BoardSaveFn
}) {
  const [draft, setDraft] = useState(task.runs.length ? "" : task.prompt)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [showModel, setShowModel] = useState(false)
  const [freshSession, setFreshSession] = useState(false)
  const [model, setModel] = useState<ModelSelection | null>(null)

  const active = task.status === "running"
  const resume = Boolean(task.session && !freshSession)
  const previous = resume ? task.runs.find(run => run.session === task.session) : undefined
  const workdir = previous?.executor.workdir ?? executor?.workdir ?? task.workdir
  const { environment, checking } = useEnvironment(workdir, showModel && !active)
  const canSend = !running && Boolean(executor?.enabled) && Boolean(draft.trim()) && !busy

  useEffect(() => {
    if (!active) setStopping(false)
  }, [active])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSend) return
    const submitted = draft
    setBusy(true)
    setError("")
    try {
      await save({
        action: "run",
        id: task.id,
        from: task.status,
        prompt: submitted,
        resume,
        ...(model ? { model } : {}),
      })
      setDraft(current => (current === submitted ? "" : current))
      setFreshSession(false)
      setModel(null)
      setShowModel(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleStop() {
    setStopping(true)
    setError("")
    try {
      await save({ action: "stop", id: task.id, runId: task.runs[0]?.id })
    } catch (err) {
      setError((err as Error).message)
      setStopping(false)
    }
  }

  return (
    <div className="shrink-0">
      <form onSubmit={handleSubmit} className="conversation-column grid gap-2 px-4 pt-2 pb-4 md:px-6 md:pb-5">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="conversation-composer-card grid min-w-0 gap-2 p-3">
          <Textarea
            value={draft}
            aria-label="发送消息"
            placeholder={resume ? "继续追问当前会话，Enter 发送，Shift+Enter 换行…" : "输入要交给执行器的任务说明…"}
            className="max-h-48 min-h-[54px] resize-none border-0 bg-transparent px-1 py-0.5 text-[14px] leading-6 shadow-none focus-visible:ring-0"
            maxLength={16000}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return
              e.preventDefault()
              e.stopPropagation()
              if (canSend) e.currentTarget.form?.requestSubmit()
            }}
          />

          {showModel && !active && (
            <div className="rounded-xl border border-[var(--board-line-soft)] bg-[var(--board-lane)] p-3">
              <ModelPicker
                id="conversation-model"
                compact
                models={environment?.models[task.engine] ?? []}
                value={model}
                onChange={setModel}
                defaultLabel={resume ? "沿用上次运行" : "跟随执行器默认"}
                checking={checking}
                disabled={busy}
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {!active && (
              <>
                {task.session && (
                  <Button
                    type="button"
                    size="xs"
                    variant={freshSession ? "secondary" : "ghost"}
                    aria-pressed={freshSession}
                    onClick={() => setFreshSession(v => !v)}
                    className={freshSession ? "text-[var(--board-brand)]" : "text-muted-foreground"}
                  >
                    <RotateCcw className="size-3.5" aria-hidden="true" />
                    {freshSession ? "即将另起新会话" : "另起会话"}
                  </Button>
                )}

                <Button
                  type="button"
                  size="xs"
                  variant={showModel || model ? "secondary" : "ghost"}
                  aria-expanded={showModel}
                  onClick={() => setShowModel(v => !v)}
                  className="max-w-[220px] text-muted-foreground"
                >
                  <Cpu className="size-3.5" aria-hidden="true" />
                  <span className="truncate">
                    {model ? `${model.id}${model.effort ? ` · ${model.effort}` : ""}` : "切换模型"}
                  </span>
                </Button>
              </>
            )}

            <div className="ml-auto flex items-center gap-2.5">
              {!active && (
                <span className="hidden text-[11px] text-muted-foreground/75 sm:inline">
                  Enter 发送 · Shift+Enter 换行
                </span>
              )}

              {active ? (
                <button
                  type="button"
                  aria-label={stopping ? "正在停止…" : "停止运行"}
                  title="停止运行"
                  disabled={stopping}
                  onClick={() => void handleStop()}
                  className="conversation-stop-btn inline-flex items-center justify-center disabled:opacity-50"
                >
                  <Square className="size-3.5 fill-current" aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="submit"
                  aria-label={resume ? "发送" : "开始会话"}
                  title={resume ? "发送消息" : "开始任务会话"}
                  disabled={!canSend}
                  className="conversation-send-btn inline-flex items-center justify-center disabled:opacity-35"
                >
                  <ArrowUp className="size-[18px]" strokeWidth={2.2} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </div>

        {!executor?.enabled && !active && (
          <p className="px-1 text-xs text-muted-foreground">当前执行器已停用，请先在执行器页面启用。</p>
        )}
        {running && !active && (
          <p className="px-1 text-xs text-muted-foreground">当前正在运行「{running.title}」，完成后可发送新任务。</p>
        )}
      </form>
    </div>
  )
}
