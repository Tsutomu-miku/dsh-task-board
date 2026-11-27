import { useEffect, useState } from "react"
import { endpoint, fetchDelivery, fetchTaskDetail } from "../../shared/api/client"
import { Alert, AlertDescription } from "../../shared/components/ui/alert"
import { Button } from "../../shared/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../shared/components/ui/dialog"
import { Input } from "../../shared/components/ui/input"
import { Textarea } from "../../shared/components/ui/textarea"
import {
  COLUMNS, statusLabel, type BoardAction, type BoardSaveFn, type Executor, type GitDelivery, type ProjectDocument,
  type TaskDetail, type TaskItem, type TaskStatus, type WakeupCondition, type WakeupRule,
} from "../../shared/types/board"

const selectStyle = "h-9 w-full rounded-md border bg-card px-2 text-sm"
const conditions: Record<WakeupCondition, string> = {
  time: "到达时间", dependencies: "依赖与阶段已验收", status: "任务进入指定状态", "ci-success": "GitHub PR 的 CI 通过",
}
const ciLabels = { none: "无检查", pending: "运行中", success: "通过", failure: "失败" }
type View = "discussion" | "files" | "project" | "wakeup" | "delivery"
const views: Record<View, string> = { discussion: "讨论", files: "附件", project: "项目文档", wakeup: "唤醒", delivery: "交付" }

function dateField(value: number | null) {
  if (!value) return ""
  const date = new Date(value)
  return new Date(value - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function WakeupForm({ existing, task, tasks, executors, submit, cancel }: {
  existing: WakeupRule | null; task: TaskItem; tasks: TaskItem[]; executors: Executor[]
  submit: (action: BoardAction) => Promise<boolean>; cancel: () => void
}) {
  const [condition, setCondition] = useState<WakeupCondition>(existing?.condition ?? "time")
  const [executor, setExecutor] = useState(existing?.executorId ?? task.executorId)
  const [subject, setSubject] = useState(existing?.subjectId ?? task.id)
  const [status, setStatus] = useState<TaskStatus>(existing?.status ?? "done")
  const [at, setAt] = useState(dateField(existing?.at ?? null))
  const [interval, setInterval] = useState((existing?.interval ?? 0) / 60000)
  const [prompt, setPrompt] = useState(existing?.prompt ?? task.brief ?? task.prompt)
  const [enabled, setEnabled] = useState(existing?.enabled ?? true)

  return <form className="grid gap-3 rounded-lg border p-3" onSubmit={async event => {
    event.preventDefault()
    if (await submit({ action: "save-wakeup", id: task.id, wakeupId: existing?.id, condition, executorId: executor,
      subjectId: subject, status, at: at ? new Date(at).getTime() : undefined, interval: interval ? interval * 60000 : undefined,
      prompt, enabled })) cancel()
  }}>
    <div className="grid grid-cols-2 gap-2">
      <label className="grid gap-1 text-sm">条件<select className={selectStyle} value={condition} onChange={e => setCondition(e.target.value as WakeupCondition)}>
        {Object.entries(conditions).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select></label>
      <label className="grid gap-1 text-sm">执行器<select className={selectStyle} value={executor} onChange={e => setExecutor(e.target.value)} required>
        <option value="" disabled>请选择</option>
        {executors.map(row => <option key={row.id} value={row.id} disabled={!row.enabled}>{row.name}</option>)}
      </select></label>
      {condition === "time" && <>
        <label className="grid gap-1 text-sm">本地时间<Input type="datetime-local" value={at} required onChange={e => setAt(e.target.value)} /></label>
        <label className="grid gap-1 text-sm">每隔多少分钟（0 为单次）<Input type="number" value={interval} min="0" max="525600" onChange={e => setInterval(Number(e.target.value))} /></label>
      </>}
      {condition === "status" && <>
        <label className="grid gap-1 text-sm">观察任务<select className={selectStyle} value={subject} onChange={e => setSubject(e.target.value)}>
          {tasks.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}
        </select></label>
        <label className="grid gap-1 text-sm">目标状态<select className={selectStyle} value={status} onChange={e => setStatus(e.target.value as TaskStatus)}>
          {COLUMNS.map(col => <option key={col.status} value={col.status}>{col.label}</option>)}
        </select></label>
      </>}
    </div>
    <label className="grid gap-1 text-sm">执行消息<Textarea value={prompt} onChange={e => setPrompt(e.target.value)} required maxLength={16000} /></label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />启用规则</label>
    <div className="flex gap-2"><Button size="sm" type="submit">保存规则</Button><Button size="sm" variant="ghost" type="button" onClick={cancel}>取消</Button></div>
  </form>
}

export function TaskWorkspaceDialog({ task, tasks, executors, save, close, openTask, initialView = "discussion" }: {
  task: TaskItem; tasks: TaskItem[]; executors: Executor[]; save: BoardSaveFn; close: () => void
  openTask: (id: string) => void; initialView?: View
}) {
  const [view, setView] = useState<View>(initialView)
  const [detail, setDetail] = useState<TaskDetail>()
  const [delivery, setDelivery] = useState<GitDelivery | null>()
  const [epoch, setEpoch] = useState(0)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [replyTo, setReplyTo] = useState("")
  const [message, setMessage] = useState("")
  const [document, setDocument] = useState<Partial<ProjectDocument> | null>(null)
  const [editingRule, setEditingRule] = useState<WakeupRule | "new" | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    function load() {
      void fetchTaskDetail(task.id, controller.signal).then(setDetail).catch(err => {
        if (!controller.signal.aborted) setError((err as Error).message)
      })
    }
    load()
    const timer = window.setInterval(load, 2200)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [task.id, epoch])

  useEffect(() => {
    if (view !== "delivery") return
    const controller = new AbortController()
    void fetchDelivery(task.id, undefined, controller.signal).then(result => setDelivery(result.git)).catch(err => {
      if (!controller.signal.aborted) setError((err as Error).message)
    })
    return () => controller.abort()
  }, [task.id, task.runs[0]?.status, view, epoch])

  async function submit(input: BoardAction) {
    if (busy) return false
    setBusy(true)
    setError("")
    try {
      await save(input)
      setEpoch(value => value + 1)
      return true
    } catch (err) {
      setError((err as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  const comments = detail?.comments ?? []
  const pr = task.pullRequest
  const children = tasks.filter(item => item.parentId === task.id).sort((a, b) => (a.stage ?? 0) - (b.stage ?? 0))
  const related = tasks.filter(item => item.id === task.parentId || task.blockedBy?.includes(item.id))
  return <Dialog open onOpenChange={open => { if (!open) close() }}>
    <DialogContent className="max-h-[88vh] overflow-auto sm:max-w-3xl">
      <DialogHeader><DialogTitle>{task.title}</DialogTitle><DialogDescription>任务协作与交付</DialogDescription></DialogHeader>
      {(related.length > 0 || children.length > 0) && <div className="flex flex-wrap gap-1.5" aria-label="关联任务">
        {related.map(item => <Button key={item.id} size="xs" variant="outline" onClick={() => openTask(item.id)}>
          {item.id === task.parentId ? "父任务" : "前置"} · {item.title} · {statusLabel(item.status)}
        </Button>)}
        {children.map(item => <Button key={item.id} size="xs" variant="outline" onClick={() => openTask(item.id)}>
          阶段 {item.stage ?? 0} · {item.title} · {statusLabel(item.status)}
        </Button>)}
      </div>}
      <nav className="flex flex-wrap gap-1.5" aria-label="任务协作">
        {(Object.keys(views) as View[]).map(key => <Button key={key} size="sm" variant={view === key ? "default" : "outline"}
          aria-pressed={view === key} onClick={() => { setView(key); setError("") }}>{views[key]}</Button>)}
      </nav>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      {view === "discussion" && <section className="grid gap-3">
        {comments.filter(comment => !comment.parentId).map(comment => <article className="grid gap-2 rounded-lg border p-3" key={comment.id}>
          <div className="text-xs text-muted-foreground">{comment.author} · {new Date(comment.at).toLocaleString()}</div>
          <p className="whitespace-pre-wrap break-words text-sm">{comment.text}</p>
          {comments.filter(reply => reply.parentId === comment.id).map(reply => <div className="ml-3 border-l pl-3" key={reply.id}>
            <div className="text-xs text-muted-foreground">{reply.author} · {new Date(reply.at).toLocaleString()}</div>
            <p className="whitespace-pre-wrap break-words text-sm">{reply.text}</p>
          </div>)}
          <Button variant="ghost" className="justify-self-start" size="xs" onClick={() => setReplyTo(comment.id)}>回复此讨论</Button>
        </article>)}
        <form className="grid gap-2" onSubmit={async event => {
          event.preventDefault()
          if (await submit({ action: "post-comment", id: task.id, text: message, parentId: replyTo || undefined })) {
            setMessage(""); setReplyTo("")
          }
        }}>
          {replyTo && <div className="flex justify-between text-sm">回复 · {comments.find(item => item.id === replyTo)?.text.slice(0, 70)}
            <Button size="xs" variant="ghost" type="button" onClick={() => setReplyTo("")}>取消回复</Button>
          </div>}
          <Textarea aria-label="讨论内容" placeholder="添加评审反馈或讨论" value={message} onChange={e => setMessage(e.target.value)} required maxLength={16000} />
          <Button type="submit" size="sm" className="justify-self-end" disabled={busy}>发表评论</Button>
        </form>
      </section>}

      {view === "files" && <section className="grid gap-3">
        <label className="grid gap-1 text-sm">上传附件（单个文件最大 5 MiB）
          <Input type="file" disabled={busy} onChange={event => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (!file) return
            if (file.size > 5 * 1024 * 1024) { setError("附件超过 5 MiB。"); return }
            const reader = new FileReader()
            reader.onload = () => { void submit({ action: "add-attachment", id: task.id,
              name: file.name, mime: file.type, content: String(reader.result).split(",")[1] ?? "" }) }
            reader.onerror = () => setError("无法读取附件。")
            reader.readAsDataURL(file)
          }} />
        </label>
        {detail?.attachments.map(file => <article className="rounded-lg border p-3" key={file.id}>
          {file.inline && <img className="mb-2 max-h-56 max-w-full rounded object-contain"
            src={endpoint(`attachment?id=${file.id}&preview=1`).href} alt={file.name} />}
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <a className="break-all text-link underline" href={endpoint(`attachment?id=${file.id}`).href} download={file.name}>{file.name}</a>
            <span className="text-xs text-muted-foreground">{file.author} · {Math.ceil(file.size / 1024)} KiB</span>
            <Button size="xs" variant="ghost" disabled={busy} onClick={() => void submit({ action: "remove-attachment", id: task.id, resourceId: file.id })}>移除</Button>
          </div>
        </article>)}
      </section>}

      {view === "project" && <section className="grid gap-3">
        {!task.project ? <p className="text-sm text-muted-foreground">在任务设置中指定项目后，即可读写共享文档。</p> : <>
          <Button className="justify-self-start" size="sm" variant="outline" onClick={() => setDocument({})}>新建 {task.project} 文档</Button>
          {document && <form className="grid gap-2 rounded-lg border p-3" onSubmit={async event => {
            event.preventDefault()
            if (await submit({ action: "save-document", id: task.id, resourceId: document.id,
              title: document.title ?? "", text: document.text ?? "" })) setDocument(null)
          }}>
            <Input aria-label="文档标题" value={document.title ?? ""} onChange={e => setDocument({ ...document, title: e.target.value })} required maxLength={120} />
            <Textarea aria-label="文档内容" value={document.text ?? ""} onChange={e => setDocument({ ...document, text: e.target.value })} required maxLength={24000} />
            <div className="flex gap-2"><Button size="sm" type="submit" disabled={busy}>保存文档</Button>
              <Button size="sm" variant="ghost" type="button" onClick={() => setDocument(null)}>取消</Button></div>
          </form>}
          {detail?.documents.map(item => <details key={item.id} className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">{item.title}</summary>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm">{item.text}</p>
            <div className="mt-2 flex gap-2"><Button size="xs" variant="outline" onClick={() => setDocument(item)}>编辑</Button>
              <Button size="xs" variant="ghost" disabled={busy} onClick={() => void submit({ action: "remove-document", id: task.id, resourceId: item.id })}>删除</Button></div>
          </details>)}
        </>}
      </section>}

      {view === "wakeup" && <section className="grid gap-3">
        <Button size="sm" variant="outline" className="justify-self-start" disabled={task.archived} onClick={() => setEditingRule("new")}>新建唤醒规则</Button>
        {editingRule && <WakeupForm key={editingRule === "new" ? "new" : editingRule.id} existing={editingRule === "new" ? null : editingRule}
          task={task} tasks={tasks} executors={executors} submit={submit} cancel={() => setEditingRule(null)} />}
        {detail?.wakeups.map(rule => <article key={rule.id} className="grid gap-1 rounded-lg border p-3 text-sm">
          <p>{conditions[rule.condition]} · {rule.enabled ? "已启用" : "已停用"}{rule.at ? ` · ${new Date(rule.at).toLocaleString()}` : ""}</p>
          <p className="line-clamp-2 whitespace-pre-wrap text-muted-foreground">{rule.prompt}</p>
          {rule.lastRunAt && <p className="text-xs text-muted-foreground">最近触发 {new Date(rule.lastRunAt).toLocaleString()}</p>}
          {rule.error && <p className="text-destructive">{rule.error}</p>}
          <div className="flex gap-2"><Button size="xs" variant="outline" disabled={task.archived} onClick={() => setEditingRule(rule)}>编辑</Button>
            <Button size="xs" variant="ghost" disabled={busy} onClick={() => void submit({ action: "remove-wakeup", id: task.id, resourceId: rule.id })}>删除</Button></div>
        </article>)}
      </section>}

      {view === "delivery" && <section className="grid gap-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          {task.prUrl && <><a className="text-link underline" href={task.prUrl} target="_blank" rel="noreferrer">打开 GitHub PR</a>
            <Button size="xs" variant="outline" disabled={busy} onClick={() => void submit({ action: "refresh-pr", id: task.id })}>刷新 PR 和 CI</Button></>}
          <Button size="xs" variant="outline" onClick={() => setEpoch(value => value + 1)}>刷新 Git 变更</Button>
        </div>
        {pr && <p>PR {pr.status} · CI {ciLabels[pr.ci]} · {pr.branch} · {pr.commit.slice(0, 12)}</p>}
        {delivery === null && <p className="text-muted-foreground">此任务没有可读取的 Git 工作区。</p>}
        {delivery && <div className="grid min-w-0 gap-2">
          <p className="break-all font-mono">{delivery.branch || "分离 HEAD"} · {delivery.commit.slice(0, 12)}</p>
          <p className="break-all text-xs text-muted-foreground">{delivery.workdir}</p>
          {delivery.files.length > 0 && <ul className="list-disc space-y-1 pl-5">{delivery.files.map(file => <li key={file} className="break-all font-mono text-xs">{file}</li>)}</ul>}
          {delivery.diff && <pre className="max-h-96 overflow-auto rounded bg-secondary p-3 text-xs">{delivery.diff}</pre>}
          {delivery.diffTruncated && <p className="text-muted-foreground">补丁过大或无法完整读取。文件列表仍可用于定位变更。</p>}
        </div>}
        {task.runs[0]?.handoffNote && <p className="whitespace-pre-wrap">{task.runs[0].handoffNote}</p>}
      </section>}
    </DialogContent>
  </Dialog>
}
