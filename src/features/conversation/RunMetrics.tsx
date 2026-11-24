import { useEffect, useState } from "react"
import { formatDuration } from "../../shared/lib/format"
import type { RunRecord } from "../../shared/types/board"

const numberFormat = new Intl.NumberFormat("zh-CN")

export function RunMetrics({ run }: { run: RunRecord }) {
  const [now, setNow] = useState(Date.now)
  const active = run.status === "running"

  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])

  const end = run.finished ?? (active ? now : null)
  const elapsed = end === null ? null : Math.max(0, end - run.started)
  const usage = run.usage
  const tpm = usage?.scope === "run" && elapsed ? Math.round(usage.tokens * 60_000 / elapsed) : null

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground tabular-nums">
      {elapsed !== null && (
        <time dateTime={`PT${Math.floor(elapsed / 1000)}S`}>
          耗时 {formatDuration(0, elapsed)}
        </time>
      )}
      {usage && (
        <span>{usage.scope === "session" ? "会话累计 " : ""}{numberFormat.format(usage.tokens)} tokens</span>
      )}
      {tpm !== null && <span>平均 {numberFormat.format(tpm)} TPM</span>}
    </span>
  )
}
