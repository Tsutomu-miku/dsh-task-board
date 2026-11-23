export function formatShortPath(fullPath: string): string {
  const normalized = fullPath.replace(/\/+$/, "")
  if (!normalized || normalized === "/") return "/"
  const segments = normalized.split("/").filter(Boolean)
  if (segments.length <= 2) return normalized
  return `…/${segments.slice(-2).join("/")}`
}

export function formatFolderName(fullPath: string): string {
  const normalized = fullPath.replace(/\/+$/, "")
  if (!normalized || normalized === "/") return "/"
  const parts = normalized.split("/").filter(Boolean)
  return parts[parts.length - 1] ?? normalized
}

export function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (diffSec < 45) return "刚刚"
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} 分钟前`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour} 小时前`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 7) return `${diffDay} 天前`
  return new Date(timestamp).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })
}

export function formatDuration(started: number, finished?: number): string {
  const ms = Math.max(0, (finished ?? Date.now()) - started)
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remSeconds = seconds % 60
  return remSeconds ? `${minutes}m ${remSeconds}s` : `${minutes}m`
}
