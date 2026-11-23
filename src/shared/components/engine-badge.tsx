import { Sparkles, Terminal } from "lucide-react"
import { ENGINES, type Engine } from "../types/board"
import { cn } from "../lib/utils"

export function EngineIcon({ engine, className }: { engine: Engine; className?: string }) {
  const Icon = engine === "dsh" ? Sparkles : Terminal
  return <Icon className={cn("size-3.5 shrink-0", className)} strokeWidth={1.9} aria-hidden="true" />
}

export function EngineAvatar({ engine, size = "sm" }: { engine: Engine; size?: "xs" | "sm" | "md" }) {
  const sizes = {
    xs: "size-5 rounded-md [&_svg]:size-3",
    sm: "size-7 rounded-lg [&_svg]:size-3.5",
    md: "size-10 rounded-xl [&_svg]:size-5",
  }
  const palette = engine === "dsh"
    ? "bg-[var(--engine-dsh-soft)] text-[var(--engine-dsh)] border-[color-mix(in_srgb,var(--engine-dsh)_22%,transparent)]"
    : "bg-[var(--engine-codex-soft)] text-[var(--engine-codex)] border-[color-mix(in_srgb,var(--engine-codex)_22%,transparent)]"

  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center border", sizes[size], palette)}>
      <EngineIcon engine={engine} />
    </span>
  )
}

export function EngineChip({ engine, label, className }: { engine: Engine; label?: string; className?: string }) {
  const palette = engine === "dsh"
    ? "bg-[var(--engine-dsh-soft)] text-[var(--engine-dsh)]"
    : "bg-[var(--engine-codex-soft)] text-[var(--engine-codex)]"

  return (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-4 font-medium",
        palette,
        className
      )}
    >
      <EngineIcon engine={engine} className="size-3" />
      <span className="truncate">{label ?? ENGINES[engine]}</span>
    </span>
  )
}
