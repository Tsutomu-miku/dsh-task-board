import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock,
  Loader2,
  PauseCircle,
} from "lucide-react"
import { RUN_STATUS_LABELS, statusLabel, type RunStatus, type TaskStatus } from "../types/board"
import { cn } from "../lib/utils"

const TASK_STATUS_STYLE: Record<TaskStatus, { icon: typeof CircleDashed; color: string; bg: string; spin?: boolean }> = {
  todo: { icon: CircleDashed, color: "text-[var(--status-todo)]", bg: "bg-[var(--status-todo-soft)]" },
  running: { icon: Loader2, color: "text-[var(--status-running)]", bg: "bg-[var(--status-running-soft)]", spin: true },
  review: { icon: Clock, color: "text-[var(--status-review)]", bg: "bg-[var(--status-review-soft)]" },
  done: { icon: CheckCircle2, color: "text-[var(--status-done)]", bg: "bg-[var(--status-done-soft)]" },
}

const RUN_STATUS_STYLE: Record<RunStatus, { icon: typeof CheckCircle2; color: string; bg: string; spin?: boolean }> = {
  running: { icon: Loader2, color: "text-[var(--status-running)]", bg: "bg-[var(--status-running-soft)]", spin: true },
  succeeded: { icon: CheckCircle2, color: "text-[var(--status-done)]", bg: "bg-[var(--status-done-soft)]" },
  failed: { icon: AlertCircle, color: "text-[var(--board-danger)]", bg: "bg-[var(--board-danger-soft)]" },
  stopped: { icon: PauseCircle, color: "text-[var(--status-todo)]", bg: "bg-[var(--status-todo-soft)]" },
  interrupted: { icon: AlertTriangle, color: "text-[var(--status-review)]", bg: "bg-[var(--status-review-soft)]" },
}

export function TaskStatusIcon({
  status,
  active = true,
  className,
}: {
  status: TaskStatus
  active?: boolean
  className?: string
}) {
  const { icon: Icon, color, spin } = TASK_STATUS_STYLE[status]
  return (
    <Icon
      className={cn("size-3.5 shrink-0", color, spin && active && "animate-spin", className)}
      strokeWidth={2}
      aria-hidden="true"
    />
  )
}

export function TaskStatusPill({ status, className }: { status: TaskStatus; className?: string }) {
  const { color, bg } = TASK_STATUS_STYLE[status]
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", bg, color, className)}>
      <TaskStatusIcon status={status} className="size-3" />
      <span>{statusLabel(status)}</span>
    </span>
  )
}

export function RunStatusPill({ status, className }: { status: RunStatus; className?: string }) {
  const { icon: Icon, color, bg, spin } = RUN_STATUS_STYLE[status]
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] leading-4 font-medium", bg, color, className)}>
      <Icon className={cn("size-3 shrink-0", spin && "animate-spin")} strokeWidth={2} aria-hidden="true" />
      <span>{RUN_STATUS_LABELS[status]}</span>
    </span>
  )
}
