import { type FormEvent, useId, useRef, useState } from "react"
import { ArrowUp, AtSign, Cpu, RotateCcw, Square } from "lucide-react"
import { Alert, AlertDescription } from "../../shared/components/ui/alert"
import { Button } from "../../shared/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../shared/components/ui/select"
import { Textarea } from "../../shared/components/ui/textarea"
import { ModelPicker } from "../../shared/components/model-picker"
import { useEnvironment } from "../../shared/hooks/use-environment"
import { ENGINES, type BoardSaveFn, type DefaultSendMode, type Executor, type ModelSelection, type QueuedMessage, type SendMode, type TaskItem } from "../../shared/types/board"
import { composerCopy } from "./composer-copy"
import { SendModeMenu } from "./SendModeMenu"

export function ComposerBox({ task, executors, running, queue, preference, save }: {
  task: TaskItem
  executors: Executor[]
  running?: TaskItem
  queue: QueuedMessage[]
  preference: DefaultSendMode
  save: BoardSaveFn
}) {
  const waiting = queue.filter(item => item.cardId === task.id)
  const [draft, setDraft] = useState(() => task.runs.length || waiting.length ? "" : task.prompt)
  const [target, setTarget] = useState<string | null>(null)
  const [selectedMode, setSelectedMode] = useState<{ mode: SendMode; runId?: string } | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [stoppingRun, setStoppingRun] = useState<string>()
  const [showModel, setShowModel] = useState(false)
  const [freshSession, setFreshSession] = useState(false)
  const [model, setModel] = useState<ModelSelection | null>(null)
  const composerId = useId()
  const textarea = useRef<HTMLTextAreaElement>(null)
  const copy = composerCopy()

  const enabled = executors.filter(item => item.enabled)
  const executor = executors.find(item => item.id === (target ?? task.executorId))
  const activeRunId = running?.id === task.id ? running.runs[0]?.id : undefined
  const stopping = Boolean(activeRunId && stoppingRun === activeRunId)
  const workdir = executor?.workdir ?? task.workdir
  const previous = task.runs.find(run =>
    run.session && run.status === "succeeded" && run.executor.id === executor?.id &&
    run.executor.workdir === workdir && run.executor.preset === executor?.preset)
  const { environment, checking } = useEnvironment(workdir, showModel)
  const mode = selectedMode?.mode ?? preference
  const mention = target === null ? /^@([^\r\n]*)$/.exec(draft)?.[1]?.toLowerCase() : undefined
  const candidates = mention === undefined ? [] : enabled.filter(item => item.name.toLowerCase().startsWith(mention))

  function selectExecutor(id: string | null) {
    setTarget(id)
    setModel(null)
    setFreshSession(false)
  }

  function changeDraft(value: string) {
    if (target === null && value.startsWith("@")) {
      const entered = value.slice(1).toLowerCase()
      const matches = enabled.filter(item =>
        entered.startsWith(item.name.toLowerCase()) && /^\s/.test(value.slice(item.name.length + 1)))
      const best = matches.reduce<Executor | null>((longest, item) =>
        !longest || item.name.length > longest.name.length ? item : longest, null)
      if (best && matches.filter(item => item.name.length === best.name.length).length === 1 &&
        (value.endsWith("\n") || !enabled.some(item => item.name.toLowerCase().startsWith(entered)))) {
        selectExecutor(best.id)
        setDraft(value.slice(best.name.length + 1).trimStart())
        return
      }
    }
    setDraft(value)
  }

  function pickMention(id: string) {
    selectExecutor(id)
    setDraft("")
    textarea.current?.focus()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !draft.trim() || !executor?.enabled) return
    if (candidates.length) {
      pickMention(candidates[0].id)
      return
    }
    const submitted = draft
    setBusy(true)
    setError("")
    try {
      await save({
        action: "send",
        id: task.id,
        executorId: executor.id,
        prompt: submitted,
        ...(selectedMode ? { mode: selectedMode.mode } : {}),
        ...(mode === "takeover" ? { runId: selectedMode?.runId } : {}),
        ...(freshSession ? { freshSession } : {}),
        ...(model ? { model } : {}),
      })
      setDraft(current => current === submitted ? "" : current)
      selectExecutor(null)
      setSelectedMode(null)
      setShowModel(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleStop(runId: string) {
    setStoppingRun(runId)
    setError("")
    try {
      await save({ action: "stop", id: task.id, runId })
    } catch (err) {
      setError((err as Error).message)
      setStoppingRun(undefined)
    }
  }

  async function cancel(messageId: string) {
    setError("")
    try {
      await save({ action: "cancel-queued", id: task.id, messageId })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function changePreference(next: DefaultSendMode) {
    setError("")
    try {
      await save({ action: "set-default-send-mode", mode: next })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const sendLabel = running ? copy[mode] : task.runs.length ? copy.send : copy.start

  return (
    <div className="shrink-0">
      <form onSubmit={handleSubmit} aria-label={copy.message} className="conversation-column conversation-dock grid gap-2 pt-2 pb-4 md:pb-5">
        {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}

        {waiting.length > 0 && (
          <section aria-label={copy.queued} className="grid gap-1 rounded-xl border border-[var(--board-line-soft)] px-3 py-2">
            <span role="status" className="text-xs font-medium text-muted-foreground">{copy.queued} · {waiting.filter(item => !item.error).length}</span>
            <ol className="m-0 grid max-h-28 list-none gap-0.5 overflow-y-auto p-0">
              {waiting.map(item => (
                <li key={item.id} className="flex min-w-0 items-center gap-2 text-xs">
                  <span className="shrink-0 text-muted-foreground">@{item.executorName}</span>
                  <span title={item.prompt} className="min-w-0 flex-1 truncate">{item.prompt}</span>
                  <span title={item.error ?? undefined} className="text-muted-foreground">
                    {item.error ? copy.queueFailed : copy[item.mode]}
                  </span>
                  <Button type="button" size="xs" variant="ghost" aria-label={`${item.error ? copy.dismiss : copy.cancel} · ${item.prompt}`} onClick={() => void cancel(item.id)}>
                    {item.error ? copy.dismiss : copy.cancel}
                  </Button>
                </li>
              ))}
            </ol>
          </section>
        )}

        <div className="conversation-composer-card grid min-w-0 gap-3 px-2.5 pt-2.5 pb-2">
          <Textarea
            ref={textarea}
            name="message"
            value={draft}
            required
            readOnly={busy}
            aria-label={copy.message}
            placeholder={copy.placeholder}
            className="conversation-input max-h-48 min-h-[44px] resize-none border-0 bg-transparent px-1 py-0.5 shadow-none focus-visible:ring-0"
            maxLength={16000}
            onChange={event => changeDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return
              event.preventDefault()
              event.stopPropagation()
              if (candidates.length) {
                pickMention(candidates[0].id)
              } else {
                event.currentTarget.form?.requestSubmit()
              }
            }}
          />

          {candidates.length > 0 && (
            <div aria-label={copy.chooseAgent} role="group" className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
              {candidates.map((item, index) => (
                <Button key={item.id} type="button" size="xs" variant={index === 0 ? "secondary" : "outline"} onClick={() => pickMention(item.id)}>
                  @{item.name} <span className="text-muted-foreground">{ENGINES[item.engine]}</span>
                </Button>
              ))}
            </div>
          )}

          {showModel && executor && (
            <div className="rounded-xl border border-[var(--board-line-soft)] bg-[var(--board-lane)] p-3">
              <ModelPicker
                id={`${composerId}-model`}
                compact
                models={environment?.models[executor.engine] ?? []}
                value={model}
                onChange={setModel}
                defaultLabel={previous && !freshSession ? copy.usePreviousModel : copy.executorModel}
                checking={checking}
                disabled={busy}
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <Select value={target ?? "default"} onValueChange={value => selectExecutor(value === "default" ? null : value)} disabled={busy}>
              <SelectTrigger size="sm" aria-label={copy.agent} className="gap-1">
                <AtSign className="size-3.5" aria-hidden="true" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent side="top">
                <SelectItem value="default">{copy.followDefault}{target === null && executor ? ` · ${executor.name}` : ""}</SelectItem>
                {executors.map(item => (
                  <SelectItem key={item.id} value={item.id} disabled={!item.enabled}>
                    {item.name} · {ENGINES[item.engine]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {previous && (
              <Button type="button" size="xs" variant={freshSession ? "secondary" : "ghost"} aria-pressed={freshSession} onClick={() => setFreshSession(value => !value)}>
                <RotateCcw className="size-3.5" aria-hidden="true" />
                {freshSession ? copy.newSession : copy.resetSession}
              </Button>
            )}

            <Button type="button" size="xs" variant={showModel || model ? "secondary" : "ghost"} aria-expanded={showModel}
              onClick={() => setShowModel(value => !value)} disabled={!executor?.enabled}
              className="max-w-[220px] text-muted-foreground"
            >
              <Cpu className="size-3.5" aria-hidden="true" />
              <span className="truncate">{model ? `${model.id}${model.effort ? ` · ${model.effort}` : ""}` : copy.model}</span>
            </Button>

            <div className="ml-auto flex items-center gap-2">
              <SendModeMenu selected={selectedMode?.mode ?? null} preference={preference} allowTakeover={Boolean(activeRunId)} disabled={busy}
                onSelect={next => setSelectedMode(next ? { mode: next, ...(next === "takeover" ? { runId: activeRunId } : {}) } : null)}
                onPreference={next => void changePreference(next)}
              />
              {activeRunId && (
                <button type="button" aria-label={stopping ? copy.stopping : copy.stop}
                  title={copy.stop} disabled={stopping} onClick={() => void handleStop(activeRunId)}
                  className="conversation-stop-btn inline-flex items-center justify-center disabled:opacity-50"
                >
                  <Square className="size-3.5 fill-current" aria-hidden="true" />
                </button>
              )}
              <button type="submit" aria-label={sendLabel} title={sendLabel}
                disabled={busy || !executor?.enabled}
                className="conversation-send-btn inline-flex items-center justify-center disabled:opacity-35"
              >
                <ArrowUp className="size-[18px]" strokeWidth={2.2} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        {!executor?.enabled && <p className="px-1 text-xs text-muted-foreground">{copy.disabled}</p>}
        {running && running.id !== task.id && (
          <p className="px-1 text-xs text-muted-foreground">{copy.activeTask} · {running.title}</p>
        )}
      </form>
    </div>
  )
}
