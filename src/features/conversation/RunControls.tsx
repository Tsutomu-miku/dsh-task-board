import { useState, type FormEvent } from "react"
import { Alert, AlertDescription } from "../../shared/components/ui/alert"
import { Button } from "../../shared/components/ui/button"
import { Input } from "../../shared/components/ui/input"
import type { ApprovalRequest, BoardAction, BoardSaveFn, TaskItem } from "../../shared/types/board"

export function RunControls({ task, canSteer, approval, save }: {
  task: TaskItem; canSteer?: boolean; approval?: ApprovalRequest; save: BoardSaveFn
}) {
  const [message, setMessage] = useState("")
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [answered, setAnswered] = useState(false)
  const runId = task.runs[0]?.id
  if (!runId || (!canSteer && !approval)) return null

  async function act(input: BoardAction) {
    if (busy) return false
    setBusy(true)
    setError("")
    try { await save(input); return true }
    catch (err) { setError((err as Error).message); return false }
    finally { setBusy(false) }
  }

  async function steer(event: FormEvent) {
    event.preventDefault()
    if (await act({ action: "steer", id: task.id, runId, prompt: message })) setMessage("")
  }

  async function respond(decision: "accept" | "decline") {
    if (!approval) return
    if (await act({ action: "approve", id: task.id, runId, approvalId: approval.id, decision, answer: answers })) setAnswered(true)
  }

  return <section className="mx-auto grid w-full max-w-3xl gap-2 px-4 py-2" aria-label="运行控制">
    {approval && !answered && <form className="grid gap-2 rounded-lg border p-3 text-sm" onSubmit={event => { event.preventDefault(); void respond("accept") }}>
      <p className="whitespace-pre-wrap break-words font-medium">{approval.summary}</p>
      {approval.questions?.map(item => <label className="grid gap-1" key={item.id}>
        {item.question}
        {item.options.length > 0 && <span className="flex flex-wrap gap-1.5">{item.options.map(option =>
          <Button key={option.label} size="xs" variant="outline" type="button" title={option.description}
            onClick={() => setAnswers(current => ({ ...current, [item.id]: option.label }))}>{option.label}</Button>)}</span>}
        <Input required value={answers[item.id] ?? ""} onChange={e => setAnswers({ ...answers, [item.id]: e.target.value })} />
      </label>)}
      <div className="flex gap-2"><Button size="sm" type="submit" disabled={busy}>{approval.kind === "questions" ? "提交回答" : "批准本次"}</Button>
        <Button size="sm" variant="outline" type="button" disabled={busy} onClick={() => void respond("decline")}>拒绝</Button></div>
    </form>}
    {canSteer && <form className="flex gap-2" onSubmit={steer}>
      <Input aria-label="发送运行中纠偏" placeholder="在当前轮次补充指示…" value={message} onChange={e => setMessage(e.target.value)} maxLength={16000} required />
      <Button size="sm" variant="outline" type="submit" disabled={busy}>纠偏</Button>
    </form>}
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
  </section>
}
