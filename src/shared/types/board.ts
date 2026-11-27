export const ENGINES = {
  dsh: "DSH",
  codex: "Codex",
} as const

export type Engine = keyof typeof ENGINES

export const COLUMNS = [
  { status: "todo", label: "待办", description: "等待分配或启动的任务" },
  { status: "running", label: "执行中", description: "正在由执行器运行的任务" },
  { status: "blocked", label: "已阻塞", description: "等待人工处理或补充信息" },
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

export type DefaultSendMode = "queue" | "priority"
export type SendMode = DefaultSendMode | "takeover"
export type ComposerSendMode = SendMode | "steer"

export interface QueuedMessage {
  id: string
  cardId: string
  executorId: string
  executorName: string
  mode: SendMode
  prompt: string
  error: string | null
}

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

export interface ExecutorProfile {
  instructions?: string | null
  agentTools?: boolean
  timeoutMs?: number | null
  maxTokens?: number | null
}

export interface Executor extends ExecutorProfile {
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
  models: Partial<Record<Engine, ModelChoice[]>>
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
  sourceWorkdir?: string
  delivery?: GitDelivery | null
  handoffNote?: string
  handoff?: { sourceRunId: string; afterRunId: string | null; includedRunIds: string[] }
}

export interface RunEvent {
  seq: number
  at: number
  kind: "status" | "command" | "tool" | "tool_result" | "output" | "error"
  message: string
}

export interface Transcript {
  canSteer?: boolean
  attachments?: TaskAttachment[]
  replies: { id: number; runId: string; text: string }[]
  preview: { runId: string; text: string } | null
}

export interface StatusTransition {
  from: TaskStatus | null
  to: TaskStatus
  cause: string
  at: number
}

export interface TaskMetadata {
  blockedReason?: string | null
  workspaceMode?: "isolated" | "shared"
}

export interface GitDelivery {
  workdir: string
  branch: string | null
  commit: string
  baseCommit: string
  files: string[]
  fileCount?: number
  diff?: string
  diffTruncated?: boolean
}

export interface TaskAttachment {
  id: string
  name: string
  size: number
  inline: boolean
  author: string
}

export interface TaskItem extends TaskMetadata {
  brief?: string
  archived?: boolean
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
  defaultSendMode: DefaultSendMode
  queue: QueuedMessage[]
  revision: number
}

export type BoardSync = { revision: number; unchanged: true } | (BoardState & { delta: boolean; removed?: string[] })

export type BoardAction =
  | ({ action: "create"; title: string; prompt: string; executorId?: string; workdir?: string; autoRun?: boolean } & TaskMetadata)
  | ({ action: "update"; id: string; from?: TaskStatus; title?: string; prompt?: string; executorId?: string; workdir?: string } & TaskMetadata)
  | { action: "delete"; id: string; from?: TaskStatus }
  | { action: "move"; id: string; from: TaskStatus; status: TaskStatus; blockedReason?: string }
  | { action: "run"; id: string; from: TaskStatus; prompt: string; resume?: boolean; model?: ModelSelection | null }
  | {
      action: "send"
      id: string
      executorId: string
      prompt: string
      mode?: SendMode
      runId?: string
      freshSession?: boolean
      model?: ModelSelection | null
    }
  | { action: "cancel-queued"; id: string; messageId: string }
  | { action: "set-default-send-mode"; mode: DefaultSendMode }
  | { action: "stop"; id: string; runId?: string }
  | (ExecutorProfile & {
      action: "save-executor"
      id?: string
      engine: Engine
      name: string
      workdir: string
      preset: string | null
      sandbox: SandboxMode | null
      model: ModelSelection | null
    })
  | { action: "toggle-executor"; id: string; enabled: boolean }
  | { action: "set-default-executor"; id: string }
  | { action: "steer"; id: string; runId: string; prompt: string }
  | { action: "archive"; id: string; archived: boolean }
  | { action: "delete-executor"; id: string }

export type BoardSaveFn = (input: BoardAction) => Promise<void>

export function statusLabel(status: TaskStatus): string {
  return COLUMNS.find(col => col.status === status)?.label ?? status
}
