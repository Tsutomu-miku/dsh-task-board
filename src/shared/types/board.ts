export const ENGINES = {
  dsh: "DSH",
  codex: "Codex",
} as const

export type Engine = keyof typeof ENGINES

export const COLUMNS = [
  { status: "todo", label: "待办", description: "等待分配或启动的任务" },
  { status: "running", label: "执行中", description: "正在由执行器运行的任务" },
  { status: "review", label: "待验收", description: "已完成运行，等待确认结果" },
  { status: "done", label: "已完成", description: "已验收归档的任务" },
] as const

export type TaskStatus = (typeof COLUMNS)[number]["status"]

export const RUN_STATUS_LABELS = {
  running: "运行中",
  succeeded: "成功",
  failed: "失败",
  stopped: "已停止",
  interrupted: "已中断",
} as const

export type RunStatus = keyof typeof RUN_STATUS_LABELS

export const SANDBOX_LABELS = {
  "read-only": "只读",
  "workspace-write": "可写工作区",
  "danger-full-access": "完全访问（Full Access）",
} as const

export type SandboxMode = keyof typeof SANDBOX_LABELS

export interface ModelSelection {
  id: string
  provider?: string
  effort?: string
}

export interface ModelChoice extends ModelSelection {
  name: string
  providerName?: string
  efforts: { id: string; name: string }[]
}

export interface Executor {
  id: string
  engine: Engine
  name: string
  enabled: boolean
  workdir: string | null
  preset: string | null
  model?: ModelSelection | null
  sandbox: SandboxMode | null
}

export interface EnvironmentInfo {
  presets: { id: string; name?: string; available: boolean }[]
  dshModel: string | null
  codexVersion: string | null
  models: Record<Engine, ModelChoice[]>
}

export interface RunRecord {
  id: string
  prompt: string
  started: number
  finished?: number
  usage?: { tokens: number; scope: "run" | "session" }
  status: RunStatus
  output: string
  error: string | null
  session: string | null
  executor: Executor
}

export interface RunEvent {
  seq: number
  at: number
  kind: "status" | "command" | "tool" | "tool_result" | "output" | "error"
  message: string
}

export interface Transcript {
  replies: { id: number; runId: string; text: string }[]
  preview: { runId: string; text: string } | null
}

export interface StatusTransition {
  from: TaskStatus | null
  to: TaskStatus
  cause: string
  at: number
}

export interface TaskItem {
  id: string
  title: string
  prompt: string
  engine: Engine
  executorId: string
  status: TaskStatus
  workdir: string
  created: number
  session: string | null
  runs: RunRecord[]
  history: StatusTransition[]
}

export interface BoardState {
  cards: TaskItem[]
  workdir: string
  workspaceHost?: "wsl" | "local"
  executors: Executor[]
  defaultExecutor: string | null
}

export type BoardAction =
  | { action: "create"; title: string; prompt: string; executorId?: string; workdir?: string }
  | { action: "update"; id: string; from?: TaskStatus; title?: string; prompt?: string; executorId?: string; workdir?: string }
  | { action: "delete"; id: string; from?: TaskStatus }
  | { action: "move"; id: string; from: TaskStatus; status: TaskStatus }
  | { action: "run"; id: string; from: TaskStatus; prompt: string; resume?: boolean; model?: ModelSelection | null }
  | { action: "stop"; id: string; runId?: string }
  | {
      action: "save-executor"
      id?: string
      engine: Engine
      name: string
      workdir: string
      preset: string | null
      sandbox: SandboxMode | null
      model: ModelSelection | null
    }
  | { action: "toggle-executor"; id: string; enabled: boolean }
  | { action: "set-default-executor"; id: string }

export type BoardSaveFn = (input: BoardAction) => Promise<void>

export function statusLabel(status: TaskStatus): string {
  return COLUMNS.find(col => col.status === status)?.label ?? status
}
