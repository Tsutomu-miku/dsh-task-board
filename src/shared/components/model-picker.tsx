import { Cpu, Gauge } from "lucide-react"
import { Label } from "./ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "./ui/select"
import type { ModelChoice, ModelSelection } from "../types/board"

const INHERIT_VALUE = "default"

const EFFORT_LABELS: Record<string, string> = {
  none: "关闭",
  minimal: "极低",
  low: "低",
  medium: "中",
  high: "高",
  xhigh: "很高",
  max: "最高",
  ultra: "超高",
}

const modelKey = (model: ModelSelection) => JSON.stringify([model.provider ?? null, model.id])

export function ModelPicker({
  id,
  models,
  value,
  onChange,
  defaultLabel,
  checking,
  disabled,
  compact = false,
}: {
  id: string
  models: ModelChoice[]
  value: ModelSelection | null
  onChange: (value: ModelSelection | null) => void
  defaultLabel: string
  checking: boolean
  disabled?: boolean
  compact?: boolean
}) {
  const selected = value ? models.find(model => modelKey(model) === modelKey(value)) : undefined
  const groups = new Map<string, ModelChoice[]>()
  for (const item of models) {
    const groupKey = item.providerName ?? item.provider ?? ""
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), item])
  }

  function handleSelect(key: string) {
    const match = models.find(item => modelKey(item) === key)
    onChange(match ? { id: match.id, provider: match.provider } : null)
  }

  const showEffort = Boolean(value && selected && (selected.efforts.length > 0 || value.effort))

  return (
    <div className={compact ? "grid grid-cols-1 gap-2.5 sm:grid-cols-2" : "grid min-w-0 gap-3.5"}>
      <div className="grid min-w-0 gap-1.5">
        <Label htmlFor={id} className="text-xs text-muted-foreground">
          <Cpu className="size-3.5" aria-hidden="true" />
          模型
        </Label>
        <Select value={value ? modelKey(value) : INHERIT_VALUE} onValueChange={handleSelect} disabled={disabled}>
          <SelectTrigger id={id} size={compact ? "sm" : "default"} className="w-full min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className="max-w-[min(28rem,90vw)]">
            <SelectItem value={INHERIT_VALUE}>{defaultLabel}</SelectItem>
            {value && !selected && (
              <SelectItem value={modelKey(value)} disabled>
                {value.id}（{checking ? "正在检查" : "当前不可用"}）
              </SelectItem>
            )}
            {[...groups].map(([group, entries]) => (
              <SelectGroup key={group || "_default"}>
                {group && <SelectLabel>{group}</SelectLabel>}
                {entries.map(model => (
                  <SelectItem key={modelKey(model)} value={modelKey(model)}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        {!disabled && !models.length && (
          <p className="text-xs text-muted-foreground">
            {checking ? "正在读取模型目录…" : "未发现可选模型，请检查运行环境登录与提供商配置。"}
          </p>
        )}
      </div>

      {showEffort && value && selected && (
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor={`${id}-effort`} className="text-xs text-muted-foreground">
            <Gauge className="size-3.5" aria-hidden="true" />
            推理强度
          </Label>
          <Select
            value={value.effort ?? INHERIT_VALUE}
            disabled={disabled}
            onValueChange={effort => onChange({ ...value, effort: effort === INHERIT_VALUE ? undefined : effort })}
          >
            <SelectTrigger id={`${id}-effort`} size={compact ? "sm" : "default"} className="w-full min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value={INHERIT_VALUE}>模型默认</SelectItem>
              {value.effort && !selected.efforts.some(row => row.id === value.effort) && (
                <SelectItem value={value.effort} disabled>
                  {value.effort}（当前不可用）
                </SelectItem>
              )}
              {selected.efforts.map(row => (
                <SelectItem key={row.id} value={row.id}>
                  {EFFORT_LABELS[row.id] ?? row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}
