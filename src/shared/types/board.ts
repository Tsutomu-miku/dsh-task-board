export const ENGINES = {
  dsh: "DSH",
  codex: "Codex",
  command: "本机命令",
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
  skills?: string[]
  agentTools?: boolean
  env?: Record<string, string>
  secretEnv?: string[]
  mcpServers?: string[]
  timeoutMs?: number | null
  maxTokens?: number | null
  approvalPolicy?: "on-request" | "never"
  command?: string
  args?: string[]
  inputMode?: "arg" | "stdin"
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

export interface ApprovalRequest {
  id: string
  kind: "approval" | "questions"
  summary: string
  questions?: { id: string; header?: string; question: string; options: { label: string; description?: string }[] }[]
}

export interface Transcript {
  canSteer?: boolean
  approval?: ApprovalRequest
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
  parentId?: string | null
  stage?: number
  blockedBy?: string[]
  blockedReason?: string | null
  priority?: number
  labels?: string[]
  project?: string | null
  workspaceMode?: "isolated" | "shared"
  prUrl?: string | null
}

export interface GitDelivery {
  workdir: string
  branch: string | null
  commit: string
  baseCommit: string
  files: string[]
  diff?: string
  diffTruncated?: boolean
}

export interface PullRequest {
  status: string
  mergeState: string
  branch: string
  commit: string
  ci: "none" | "pending" | "success" | "failure"
  checkedAt: number
}

export interface BoardNotification {
  id: string
  cardId: string
  kind: string
  message: string
  at: number
  read: boolean
}

export interface TaskComment {
  id: string
  parentId: string | null
  author: string
  text: string
  at: number
}

export interface TaskAttachment {
  id: string
  name: string
  size: number
  inline: boolean
  author: string
}

export interface ProjectDocument {
  id: string
  title: string
  text: string
}

export type WakeupCondition = "time" | "dependencies" | "status" | "ci-success"

export interface WakeupRule {
  id: string
  condition: WakeupCondition
  subjectId: string | null
  status: TaskStatus | null
  executorId: string
  prompt: string
  at: number | null
  interval: number | null
  enabled: boolean
  lastRunAt: number | null
  error: string | null
}

export interface TaskDetail {
  comments: TaskComment[]
  attachments: TaskAttachment[]
  documents: ProjectDocument[]
  wakeups: WakeupRule[]
}

export interface TaskItem extends TaskMetadata {
  brief?: string
  archived?: boolean
  pullRequest?: PullRequest | null
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
  notifications: BoardNotification[]
  unreadNotifications: number
}

export type BoardSync = { revision: number; unchanged: true } | (BoardState & { delta: boolean; removed?: string[] })

export type BoardAction =
  | ({ action: "create"; title: string; prompt: string; executorId?: string; workdir?: string; autoRun?: boolean } & TaskMetadata)
  | ({ action: "update"; id: string; from?: TaskStatus; title?: string; prompt?: string; executorId?: string; workdir?: string } & TaskMetadata)
  | { action: "delete"; id: string; from?: TaskStatus }
  | { action: "move"; id: string; from: TaskStatus; status: TaskStatus }
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
  | { action: "approve"; id: string; runId: string; approvalId: string; decision: "accept" | "decline"; answer?: Record<string, string> }
  | { action: "archive"; id: string; archived: boolean }
  | { action: "refresh-pr"; id: string }
  | { action: "post-comment"; id: string; text: string; parentId?: string }
  | { action: "add-attachment"; id: string; name: string; mime: string; content: string }
  | { action: "remove-attachment" | "remove-wakeup" | "remove-document"; id: string; resourceId: string }
  | { action: "save-document"; id: string; title: string; text: string; resourceId?: string }
  | { action: "save-wakeup"; id: string; wakeupId?: string; condition: WakeupCondition; subjectId?: string;
      status?: TaskStatus; executorId: string; prompt: string; at?: number; interval?: number; enabled?: boolean }
  | { action: "read-notification"; notificationId: string }
  | { action: "read-all-notifications" }
  | { action: "delete-executor"; id: string }

export type BoardSaveFn = (input: BoardAction) => Promise<void>

export function statusLabel(status: TaskStatus): string {
  return COLUMNS.find(col => col.status === status)?.label ?? status
}
