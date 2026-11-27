import { useState, type FormEvent } from "react"
import { FolderOpen, Layers, Shield, SlidersHorizontal, Tag } from "lucide-react"
import { EngineAvatar } from "../../shared/components/engine-badge"
import { Alert, AlertDescription } from "../../shared/components/ui/alert"
import { Button } from "../../shared/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../shared/components/ui/dialog"
import { Input } from "../../shared/components/ui/input"
import { Label } from "../../shared/components/ui/label"
import { Textarea } from "../../shared/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../shared/components/ui/select"
import { ModelPicker } from "../../shared/components/model-picker"
import { useEnvironment } from "../../shared/hooks/use-environment"
import { SANDBOX_LABELS, type BoardSaveFn, type Engine, type Executor, type ModelSelection, type SandboxMode } from "../../shared/types/board"

export function ExecutorFormDialog({
  existing,
  defaultWorkdir,
  workspaceHost,
  onClose,
  save,
}: {
  existing?: Executor
  defaultWorkdir: string
  workspaceHost?: "wsl" | "local"
  onClose: () => void
  save: BoardSaveFn
}) {
  const [engine, setEngine] = useState<Engine>(existing?.engine ?? "dsh")
  const [name, setName] = useState(existing?.name ?? "")
  const [workdir, setWorkdir] = useState(existing?.workdir ?? "")
  const [catalogWorkspace, setCatalogWorkspace] = useState<string | null>(existing?.workdir ?? null)
  const [model, setModel] = useState<ModelSelection | null>(existing?.model ?? null)
  const [preset, setPreset] = useState(existing?.preset ?? "default")
  const [sandbox, setSandbox] = useState<SandboxMode>(existing?.sandbox ?? "read-only")
  const [instructions, setInstructions] = useState(existing?.instructions ?? "")
  const [skills, setSkills] = useState(existing?.skills?.join("\n") ?? "")
  const [agentTools, setAgentTools] = useState(existing?.agentTools ?? false)
  const [env, setEnv] = useState(Object.entries(existing?.env ?? {}).map(([key, value]) => `${key}=${value}`).join("\n"))
  const [secrets, setSecrets] = useState(existing?.secretEnv?.join("\n") ?? "")
  const [mcp, setMcp] = useState(existing?.mcpServers?.join("\n") ?? "")
  const [timeout, setTimeoutMinutes] = useState(existing?.timeoutMs ? String(existing.timeoutMs / 60_000) : "")
  const [budget, setBudget] = useState(existing?.maxTokens?.toString() ?? "")
  const [approval, setApproval] = useState(existing?.approvalPolicy === "on-request")
  const [command, setCommand] = useState(existing?.command ?? "")
  const [args, setArgs] = useState(existing?.args?.join("\n") ?? "")
  const [inputMode, setInputMode] = useState(existing?.inputMode ?? "stdin")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const { environment, checking } = useEnvironment(catalogWorkspace)
  const presets = environment?.presets ?? []

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError("")
    try {
      const lines = (value: string) => value.split(/\r?\n/).map(item => item.trim()).filter(Boolean)
      const variables = engine === "dsh" ? [] : env.split(/\r?\n/).filter(line => line.trim()).map(line => {
        const separator = line.indexOf("=")
        if (separator < 1) throw new Error("每个环境变量需按 NAME=value 填写。")
        return [line.slice(0, separator).trim(), line.slice(separator + 1)]
      })
      await save({
        action: "save-executor",
        id: existing?.id,
        engine,
        name,
        workdir: workdir.trim(),
        preset: engine === "dsh" && preset !== "default" ? preset : null,
        sandbox: engine === "codex" ? sandbox : null,
        model: engine === "command" ? null : model,
        instructions: instructions.trim() || null,
        skills: lines(skills),
        agentTools: engine !== "command" && agentTools,
        env: Object.fromEntries(variables),
        secretEnv: engine === "dsh" ? [] : lines(secrets),
        mcpServers: engine === "codex" ? lines(mcp) : [],
        timeoutMs: timeout ? Math.round(Number(timeout) * 60_000) : null,
        maxTokens: budget && engine !== "command" ? Number(budget) : null,
        approvalPolicy: approval ? "on-request" : "never",
        ...(engine === "command" ? { command, args: lines(args), inputMode } : {}),
      })
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? "编辑执行器" : "新增执行器"}</DialogTitle>
          <DialogDescription>新建会话将使用此处保存的模型、目录与运行配置。</DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-1.5">
            <Label htmlFor="executor-name">
              <Tag className="size-3.5 text-muted-foreground" aria-hidden="true" />
              名称
            </Label>
            <Input
              id="executor-name"
              placeholder="例如：Codex 代码审查"
              required
              maxLength={80}
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="executor-engine">
              <Layers className="size-3.5 text-muted-foreground" aria-hidden="true" />
              引擎类型
            </Label>
            <Select
              value={engine}
              disabled={Boolean(existing)}
              onValueChange={value => {
                setEngine(value as Engine)
                setModel(null)
              }}
            >
              <SelectTrigger id="executor-engine" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dsh"><span className="flex items-center gap-2"><EngineAvatar engine="dsh" size="xs" />DSH（原生宿主会话）</span></SelectItem>
                <SelectItem value="codex"><span className="flex items-center gap-2"><EngineAvatar engine="codex" size="xs" />Codex（本机 CLI）</span></SelectItem>
                <SelectItem value="command"><span className="flex items-center gap-2"><EngineAvatar engine="command" size="xs" />本机命令（Claude Code、Gemini CLI 等）</span></SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="executor-workdir">
              <FolderOpen className="size-3.5 text-muted-foreground" aria-hidden="true" />
              固定工作目录
              <span className="text-xs font-normal text-muted-foreground">（可选）</span>
            </Label>
            <Input
              id="executor-workdir"
              placeholder={`留空时使用卡片目录（默认：${defaultWorkdir}）`}
              value={workdir}
              onChange={e => setWorkdir(e.target.value)}
              onBlur={() => setCatalogWorkspace(workdir.trim() || null)}
            />
            {workspaceHost === "wsl" && (
              <p className="text-xs text-muted-foreground">支持 WSL 绝对路径或已挂载的 Windows 路径。</p>
            )}
          </div>

          {engine === "dsh" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="executor-preset">
                <SlidersHorizontal className="size-3.5 text-muted-foreground" aria-hidden="true" />
                DSH 预设
              </Label>
              <Select value={preset} onValueChange={setPreset}>
                <SelectTrigger id="executor-preset" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">跟随 DSH 默认预设</SelectItem>
                  {preset !== "default" && !presets.some(row => row.id === preset) && (
                    <SelectItem value={preset} disabled>
                      {preset}（不可用）
                    </SelectItem>
                  )}
                  {presets.map(row => (
                    <SelectItem key={row.id} value={row.id} disabled={!row.available}>
                      {row.name ?? row.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : engine === "codex" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="executor-sandbox">
                <Shield className="size-3.5 text-muted-foreground" aria-hidden="true" />
                Codex 沙箱权限
              </Label>
              <Select value={sandbox} onValueChange={value => setSandbox(value as SandboxMode)}>
                <SelectTrigger id="executor-sandbox" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="read-only">只读（安全审查，禁止修改文件）</SelectItem>
                  <SelectItem value="workspace-write">可写工作区（允许编辑目录内文件）</SelectItem>
                  <SelectItem value="danger-full-access">{SANDBOX_LABELS["danger-full-access"]}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : <div className="grid gap-2">
            <label className="grid gap-1.5 text-sm">可执行程序<Input value={command} onChange={e => setCommand(e.target.value)} required placeholder="claude" /></label>
            <label className="grid gap-1.5 text-sm">命令参数（每行一个）<Textarea value={args} onChange={e => setArgs(e.target.value)} placeholder="-p" /></label>
            <label className="grid gap-1.5 text-sm">传递任务消息<select className="h-9 rounded-md border bg-card px-2" value={inputMode}
              onChange={e => setInputMode(e.target.value as typeof inputMode)}>
              <option value="stdin">标准输入</option><option value="arg">附加为最后一个参数</option>
            </select></label>
          </div>}

          {engine !== "command" && <ModelPicker
            id="executor-model"
            models={environment?.models[engine] ?? []}
            value={model}
            onChange={setModel}
            defaultLabel={`跟随 ${engine === "dsh" ? "DSH" : "Codex"} 默认模型`}
            checking={checking}
          />}
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">角色、协作与运行预算</summary>
            <div className="mt-3 grid gap-3">
              <label className="grid gap-1.5 text-sm">角色指令<Textarea value={instructions} maxLength={16000} onChange={e => setInstructions(e.target.value)} /></label>
              <label className="grid gap-1.5 text-sm">已安装技能（每行一个名称）<Textarea value={skills} onChange={e => setSkills(e.target.value)} /></label>
              {engine !== "command" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={agentTools} onChange={e => setAgentTools(e.target.checked)} />允许 Agent 自动委派与接力</label>}
              {engine === "codex" && sandbox !== "danger-full-access" && <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={approval} onChange={e => setApproval(e.target.checked)} />允许在看板中审批 Codex 权限请求
              </label>}
              {engine === "codex" && <label className="grid gap-1.5 text-sm">Codex 已配置的 MCP 绑定（每行一个名称）<Textarea value={mcp} onChange={e => setMcp(e.target.value)} /></label>}
              {engine !== "dsh" && <>
                <label className="grid gap-1.5 text-sm">环境变量（每行 NAME=value）<Textarea value={env} onChange={e => setEnv(e.target.value)} /></label>
                <label className="grid gap-1.5 text-sm">从宿主读取的密钥变量名（每行一个）<Textarea value={secrets} onChange={e => setSecrets(e.target.value)} /></label>
              </>}
              <label className="grid gap-1.5 text-sm">运行超时（分钟，留空继承）<Input type="number" min="0.017" max="1440" step="any" value={timeout} onChange={e => setTimeoutMinutes(e.target.value)} /></label>
              {engine !== "command" && <label className="grid gap-1.5 text-sm">每轮 Token 预算（0 为不限，留空继承）<Input type="number" min="0" max="100000000" value={budget} onChange={e => setBudget(e.target.value)} /></label>}
            </div>
          </details>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={busy}>
              保存执行器
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
