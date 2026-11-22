import { useEffect, useState } from "react"
import { Plus, RefreshCw } from "lucide-react"
import { Alert, AlertDescription } from "../components/ui/alert"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { request } from "../api"
import { engines, type Environment, type Executor, type Save } from "../contracts"
import { ExecutorDialog } from "./executor-dialog"

export function ExecutorsPanel({ executors, preferred, save }: { executors: Executor[]; preferred: string | null; save: Save }) {
  const [editing, setEditing] = useState<Executor | "new" | null>(null)
  const [environment, setEnvironment] = useState<Environment | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    setChecking(true)
    void request<Environment>("environment", { signal: controller.signal }).then(value => setEnvironment(value)).catch(error => {
      if (!controller.signal.aborted) setError(error.message)
    }).finally(() => { if (!controller.signal.aborted) setChecking(false) })
    return () => controller.abort()
  }, [refreshKey])

  async function change(id: string, payload: object) {
    setBusy(id)
    setError("")
    try { await save({ ...payload, id }) }
    catch (error) { setError((error as Error).message) }
    finally { setBusy(null) }
  }

  return (
    <section className="grid min-w-0 gap-4" aria-label="执行器配置">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setEditing("new")}><Plus aria-hidden="true" />新增执行器</Button>
        <Button variant="outline" disabled={checking} onClick={() => setRefreshKey(key => key + 1)}><RefreshCw aria-hidden="true" />检测运行环境</Button>
      </div>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="grid gap-3 md:grid-cols-2">
        {executors.map(row => <Card key={row.id} className="gap-4 py-4">
          <CardHeader className="gap-2 px-4">
            <CardTitle>{row.name}</CardTitle>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary">{engines[row.engine]}</Badge>
              <Badge variant="outline">{row.enabled ? "已启用" : "已停用"}</Badge>
              {row.id === preferred && <Badge>默认</Badge>}
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 px-4">
            <dl className="grid gap-2 text-sm">
              <div className="grid grid-cols-[5.5rem_1fr] gap-2"><dt className="text-muted-foreground">工作目录</dt><dd className="break-all">{row.workdir ?? "使用卡片的工作目录"}</dd></div>
              {row.engine === "dsh" ? <>
                <div className="grid grid-cols-[5.5rem_1fr] gap-2"><dt className="text-muted-foreground">预设</dt><dd>{environment?.presets.find(preset => preset.id === row.preset)?.name ?? row.preset ?? "跟随 DSH"}</dd></div>
                <div className="grid grid-cols-[5.5rem_1fr] gap-2"><dt className="text-muted-foreground">宿主模型</dt><dd>{checking ? "检测中" : environment?.dshModel ?? "请检查 DSH 模型设置"}</dd></div>
              </> : <>
                <div className="grid grid-cols-[5.5rem_1fr] gap-2"><dt className="text-muted-foreground">CLI</dt><dd>{checking ? "检测中" : environment?.codexVersion ?? "未检测到 Codex"}</dd></div>
                <div className="grid grid-cols-[5.5rem_1fr] gap-2"><dt className="text-muted-foreground">沙箱</dt><dd>{row.sandbox === "workspace-write" ? "可写工作区" : "只读"}</dd></div>
              </>}
            </dl>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing(row)}>编辑</Button>
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void change(row.id, { action: "toggle-executor", enabled: !row.enabled })}>{row.enabled ? "停用" : "启用"}</Button>
              {row.enabled && row.id !== preferred && <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void change(row.id, { action: "set-default-executor" })}>设为默认</Button>}
            </div>
          </CardContent>
        </Card>)}
      </div>
      {editing && <ExecutorDialog existing={editing === "new" ? undefined : editing} close={() => setEditing(null)} save={save} environment={environment} />}
    </section>
  )
}
