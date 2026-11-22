export const engines = { dsh: "DSH", codex: "Codex" }
export type Engine = keyof typeof engines
export type ModelSelection = { id: string; provider?: string; effort?: string }
export type ModelChoice = ModelSelection & { name: string; providerName?: string; efforts: { id: string; name: string }[] }
export type Executor = {
  id: string; engine: Engine; name: string; enabled: boolean; workdir: string | null;
  preset: string | null; model?: ModelSelection | null; sandbox: "read-only" | "workspace-write" | null;
}
export type Environment = {
  presets: { id: string; name?: string; available: boolean }[];
  dshModel: string | null; codexVersion: string | null; models: Record<Engine, ModelChoice[]>;
}

export type Save = (input: object) => Promise<void>
export const columns = [
  { status: "todo", label: "待办", mark: "bg-slate-400" },
  { status: "running", label: "执行中", mark: "bg-sky-600" },
  { status: "review", label: "待验收", mark: "bg-amber-500" },
  { status: "done", label: "完成", mark: "bg-emerald-500" },
] as const
export const runLabels = {
  running: "运行中", succeeded: "成功", failed: "失败", stopped: "已停止", interrupted: "已中断",
}
export type State = typeof columns[number]["status"]
export type Run = {
  id: string; prompt: string; started: number; finished?: number; status: keyof typeof runLabels;
  output: string; error: string | null; session: string | null; executor: Executor;
}
export type RunEvent = { seq: number; at: number; kind: "status" | "tool" | "output" | "error"; message: string }
export type Transcript = {
  replies: { id: number; runId: string; text: string }[];
  preview: { runId: string; text: string } | null;
}
export type Task = {
  id: string; title: string; prompt: string; engine: Engine; executorId: string; status: State;
  workdir: string; session: string | null; runs: Run[];
  history: { from: State | null; to: State; cause: string; at: number }[];
}
export type BoardData = { cards: Task[]; workdir: string; executors: Executor[]; defaultExecutor: string | null }
export const stateLabel = (state: State) => columns.find(column => column.status === state)?.label
