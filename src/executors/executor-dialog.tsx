import { useState, type FormEvent } from "react"
import { Alert, AlertDescription } from "../components/ui/alert"
import { Button } from "../components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select"
import type { Engine, Executor, ModelSelection, Save } from "../contracts"
import { ModelPicker } from "../models/model-picker"
import { useEnvironment } from "../models/use-environment"

export function ExecutorDialog({ existing, close, save }: {
  existing?: Executor; close: () => void; save: Save;
}) {
  const [engine, setEngine] = useState<Engine>(existing?.engine ?? "dsh")
  const [name, setName] = useState(existing?.name ?? "")
  const [workdir, setWorkdir] = useState(existing?.workdir ?? "")
  const [catalogWorkspace, setCatalogWorkspace] = useState(existing?.workdir ?? null)
  const [model, setModel] = useState<ModelSelection | null>(existing?.model ?? null)
  const { environment, checking } = useEnvironment(catalogWorkspace)
  const [preset, setPreset] = useState(existing?.preset ?? "default")
  const [sandbox, setSandbox] = useState(existing?.sandbox ?? "read-only")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const presets = environment?.presets ?? []

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError("")
    try {
      await save({ action: "save-executor", id: existing?.id, engine, name, workdir: workdir.trim(),
        preset: engine === "dsh" && preset !== "default" ? preset : null, sandbox, model })
      close()
    } catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  return (
    <Dialog open onOpenChange={open => { if (!open && !busy) close() }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? "编辑执行器" : "新增执行器"}</DialogTitle>
          <DialogDescription>新会话使用这里保存的配置。</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="executor-name">名称</Label>
            <Input id="executor-name" required maxLength={80} value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="executor-engine">类型</Label>
            <Select value={engine} disabled={!!existing} onValueChange={value => { setEngine(value as Engine); setModel(null) }}>
              <SelectTrigger id="executor-engine"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="dsh">DSH</SelectItem><SelectItem value="codex">Codex</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="executor-workdir">固定工作目录</Label>
            <Input id="executor-workdir" placeholder="留空时使用卡片的工作目录" value={workdir} onChange={e => setWorkdir(e.target.value)} onBlur={() => setCatalogWorkspace(workdir.trim() || null)} />
          </div>
          {engine === "dsh" ? <div className="grid gap-2">
            <Label htmlFor="executor-preset">DSH 预设</Label>
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger id="executor-preset"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="default">跟随 DSH 默认预设</SelectItem>
                {preset !== "default" && !presets.some(row => row.id === preset) && <SelectItem value={preset} disabled>{preset}（不可用）</SelectItem>}
                {presets.map(row => <SelectItem key={row.id} value={row.id} disabled={!row.available}>{row.name ?? row.id}</SelectItem>)}
              </SelectContent>
            </Select>
          </div> : <div className="grid gap-2">
            <Label htmlFor="executor-sandbox">Codex 沙箱</Label>
            <Select value={sandbox} onValueChange={value => setSandbox(value as NonNullable<Executor["sandbox"]>)}>
              <SelectTrigger id="executor-sandbox"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="read-only">只读</SelectItem><SelectItem value="workspace-write">可写工作区</SelectItem></SelectContent>
            </Select>
          </div>}
          <ModelPicker id="executor-model" models={environment?.models[engine] ?? []} value={model}
            onChange={setModel} defaultLabel={`跟随 ${engine === "dsh" ? "DSH" : "Codex"} 默认模型`} checking={checking} />
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <DialogFooter><Button type="submit" disabled={busy}>保存执行器</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
