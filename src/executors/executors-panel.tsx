import { useState } from "react"
import { Bot, CodeXml, Cpu, Pencil, Plus, Power, RefreshCw, Star } from "lucide-react"
import { Alert, AlertDescription } from "../components/ui/alert"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "../components/ui/card"
import { useEnvironment } from "../models/use-environment"
import { engines, type Executor, type Save } from "../contracts"
import { ExecutorDialog } from "./executor-dialog"

export function ExecutorsPanel({ executors, preferred, save }: { executors: Executor[]; preferred: string | null; save: Save }) {
  const [editing, setEditing] = useState<Executor | "new" | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const { environment, checking, error: environmentError, reload } = useEnvironment(null)

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
        <Button variant="outline" disabled={checking} onClick={reload}><RefreshCw aria-hidden="true" />检测运行环境</Button>
      </div>
      {(error || environmentError) && <Alert variant="destructive"><AlertDescription>{error || environmentError}</AlertDescription></Alert>}
      <div className="board-executors grid gap-4">
        {executors.map(row => <Card key={row.id} className="board-surface min-w-0 gap-4 py-4">
          <CardHeader className="flex min-w-0 items-start gap-3 px-4 md:px-5">
            <span className="board-section-icon grid size-10 shrink-0 place-items-center rounded-xl">
              {row.engine === "dsh" ? <Bot className="size-5" aria-hidden="true" /> : <CodeXml className="size-5" aria-hidden="true" />}
            </span>
            <div className="min-w-0 space-y-2">
              <CardTitle className="leading-snug wrap-anywhere">{row.name}</CardTitle>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary">{engines[row.engine]}</Badge>
                <Badge variant="outline">{row.enabled ? "已启用" : "已停用"}</Badge>
                {row.id === preferred && <Badge>默认</Badge>}
              </div>
            </div>
          </CardHeader>
          <CardContent className="grow px-4 md:px-5">
            <dl className="grid gap-2 rounded-lg border bg-muted/60 p-3 text-sm">
              <div className="grid grid-cols-[5.5rem_1fr] gap-2"><dt className="text-muted-foreground">工作目录</dt><dd className="break-all">{row.workdir ?? "使用卡片的工作目录"}</dd></div>
              <div className="grid grid-cols-[5.5rem_1fr] gap-2"><dt className="flex items-center gap-1.5 text-muted-foreground"><Cpu className="size-3.5" aria-hidden="true" />模型</dt><dd className="break-all">{row.model?.id ?? `跟随 ${engines[row.engine]}${row.engine === "dsh" && environment?.dshModel ? ` · ${environment.dshModel}` : " 默认"}`}{row.model?.effort && ` · ${row.model.effort}`}</dd></div>
              {row.engine === "dsh" ? <>
                <div className="grid grid-cols-[5.5rem_1fr] gap-2"><dt className="text-muted-foreground">预设</dt><dd>{environment?.presets.find(preset => preset.id === row.preset)?.name ?? row.preset ?? "跟随 DSH"}</dd></div>
              </> : <>
                <div className="grid grid-cols-[5.5rem_1fr] gap-2"><dt className="text-muted-foreground">CLI</dt><dd>{checking ? "检测中" : environment?.codexVersion ?? "未检测到 Codex"}</dd></div>
                <div className="grid grid-cols-[5.5rem_1fr] gap-2"><dt className="text-muted-foreground">沙箱</dt><dd>{row.sandbox === "workspace-write" ? "可写工作区" : "只读"}</dd></div>
              </>}
            </dl>
          </CardContent>
          <CardFooter className="flex-wrap gap-2 px-4 md:px-5">
              <Button size="sm" variant="outline" onClick={() => setEditing(row)}><Pencil aria-hidden="true" />编辑</Button>
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void change(row.id, { action: "toggle-executor", enabled: !row.enabled })}><Power aria-hidden="true" />{row.enabled ? "停用" : "启用"}</Button>
              {row.enabled && row.id !== preferred && <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void change(row.id, { action: "set-default-executor" })}><Star aria-hidden="true" />设为默认</Button>}
          </CardFooter>
        </Card>)}
      </div>
      {editing && <ExecutorDialog existing={editing === "new" ? undefined : editing} close={() => setEditing(null)} save={save} />}
    </section>
  )
}
