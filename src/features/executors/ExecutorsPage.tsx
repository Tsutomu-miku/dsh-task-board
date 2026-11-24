import { useState } from "react"
import {
  CheckCircle2,
  Cpu,
  FolderOpen,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Terminal,
} from "lucide-react"
import { Alert, AlertDescription } from "../../shared/components/ui/alert"
import { Badge } from "../../shared/components/ui/badge"
import { Button } from "../../shared/components/ui/button"
import { EngineAvatar, EngineChip } from "../../shared/components/engine-badge"
import { useEnvironment } from "../../shared/hooks/use-environment"
import { ENGINES, SANDBOX_LABELS, type BoardSaveFn, type Executor } from "../../shared/types/board"
import { ExecutorFormDialog } from "./ExecutorFormDialog"

export function ExecutorsPage({
  executors,
  preferred,
  defaultWorkdir,
  workspaceHost,
  save,
}: {
  executors: Executor[]
  preferred: string | null
  defaultWorkdir: string
  workspaceHost?: "wsl" | "local"
  save: BoardSaveFn
}) {
  const [editing, setEditing] = useState<Executor | "new" | null>(null)
  const [error, setError] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)
  const { environment, checking, error: envError, reload } = useEnvironment(null)

  async function mutate(id: string, action: { action: "toggle-executor"; enabled: boolean } | { action: "set-default-executor" }) {
    setBusyId(id)
    setError("")
    try {
      await save({ ...action, id })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="grid min-w-0 gap-5" aria-label="执行器配置">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--board-line)] bg-[var(--board-lane)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
            <CheckCircle2 className="size-3.5 text-[var(--status-done)]" aria-hidden="true" />
            已启用 {executors.filter(item => item.enabled).length} / {executors.length}
          </span>
          <span className="text-border">|</span>
          <span className="inline-flex items-center gap-1.5">
            <Terminal className="size-3.5" aria-hidden="true" />
            Codex: {checking ? "检测中…" : (environment?.codexVersion ?? "未检测到")}
          </span>
          {environment?.dshModel && (
            <>
              <span className="text-border">|</span>
              <span className="inline-flex items-center gap-1.5">
                <Cpu className="size-3.5" aria-hidden="true" />
                DSH 默认: {environment.dshModel}
              </span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={checking} onClick={reload}>
            <RefreshCw className={`size-3.5 ${checking ? "animate-spin" : ""}`} aria-hidden="true" />
            检测环境
          </Button>
          <Button size="sm" className="rounded-full px-3.5" onClick={() => setEditing("new")}>
            <Plus className="size-4" strokeWidth={2.1} aria-hidden="true" />
            新增执行器
          </Button>
        </div>
      </div>

      {(error || envError) && (
        <Alert variant="destructive">
          <AlertDescription>{error || envError}</AlertDescription>
        </Alert>
      )}

      <div className="executor-grid">
        {executors.map(row => {
          const isDefault = row.id === preferred
          return (
            <article
              key={row.id}
              className={`settings-card-surface flex min-w-0 flex-col gap-4 p-5 ${!row.enabled ? "opacity-75" : ""}`}
            >
              <div className="flex min-w-0 items-start gap-3.5">
                <EngineAvatar engine={row.engine} size="md" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-[15px] leading-5 font-semibold text-foreground">{row.name}</h3>
                    {isDefault && (
                      <Badge className="gap-1 bg-[var(--board-brand-soft)] text-[var(--board-brand)]">
                        <Star className="size-3 fill-current" aria-hidden="true" />
                        默认
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <EngineChip engine={row.engine} />
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        row.enabled
                          ? "bg-[var(--status-done-soft)] text-[var(--status-done)]"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      <span
                        className={`size-1.5 rounded-full ${row.enabled ? "bg-[var(--status-done)]" : "bg-muted-foreground/50"}`}
                        aria-hidden="true"
                      />
                      {row.enabled ? "已启用" : "已停用"}
                    </span>
                  </div>
                </div>
              </div>

              <dl className="grid gap-2.5 rounded-xl border border-[var(--board-line-soft)] bg-[var(--board-lane)] p-3.5 text-[12.5px] leading-5">
                <div className="grid grid-cols-[5.5rem_1fr] items-start gap-2">
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <FolderOpen className="size-3.5 shrink-0" aria-hidden="true" />
                    工作目录
                  </dt>
                  <dd className="min-w-0 break-all text-foreground/90">
                    {row.workdir ?? "继承任务卡片工作目录"}
                  </dd>
                </div>

                <div className="grid grid-cols-[5.5rem_1fr] items-start gap-2">
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <Cpu className="size-3.5 shrink-0" aria-hidden="true" />
                    模型
                  </dt>
                  <dd className="min-w-0 break-all text-foreground/90">
                    {row.model?.id ??
                      `跟随 ${ENGINES[row.engine]}${row.engine === "dsh" && environment?.dshModel ? ` · ${environment.dshModel}` : " 默认"}`}
                    {row.model?.effort && ` · ${row.model.effort}`}
                  </dd>
                </div>

                {row.engine === "dsh" ? (
                  <div className="grid grid-cols-[5.5rem_1fr] items-start gap-2">
                    <dt className="flex items-center gap-1.5 text-muted-foreground">
                      <SlidersHorizontal className="size-3.5 shrink-0" aria-hidden="true" />
                      预设
                    </dt>
                    <dd className="min-w-0 text-foreground/90">
                      {environment?.presets.find(p => p.id === row.preset)?.name ?? row.preset ?? "跟随 DSH 默认"}
                    </dd>
                  </div>
                ) : (
                  <div className="grid grid-cols-[5.5rem_1fr] items-start gap-2">
                    <dt className="flex items-center gap-1.5 text-muted-foreground">
                      {row.sandbox === "workspace-write" ? (
                        <ShieldCheck className="size-3.5 shrink-0 text-[var(--status-review)]" aria-hidden="true" />
                      ) : (
                        <Shield className="size-3.5 shrink-0" aria-hidden="true" />
                      )}
                      沙箱权限
                    </dt>
                    <dd className="min-w-0 text-foreground/90">
                      {SANDBOX_LABELS[row.sandbox ?? "read-only"]}
                    </dd>
                  </div>
                )}
              </dl>

              <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => setEditing(row)}>
                  <Pencil className="size-3.5" aria-hidden="true" />
                  编辑
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId !== null}
                  onClick={() => void mutate(row.id, { action: "toggle-executor", enabled: !row.enabled })}
                >
                  <Power className="size-3.5" aria-hidden="true" />
                  {row.enabled ? "停用" : "启用"}
                </Button>
                {row.enabled && !isDefault && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-muted-foreground hover:text-foreground"
                    disabled={busyId !== null}
                    onClick={() => void mutate(row.id, { action: "set-default-executor" })}
                  >
                    <Star className="size-3.5" aria-hidden="true" />
                    设为默认
                  </Button>
                )}
              </div>
            </article>
          )
        })}
      </div>

      {editing && (
        <ExecutorFormDialog
          existing={editing === "new" ? undefined : editing}
          defaultWorkdir={defaultWorkdir}
          workspaceHost={workspaceHost}
          onClose={() => setEditing(null)}
          save={save}
        />
      )}
    </section>
  )
}
