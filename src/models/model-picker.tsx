import { Cpu } from "lucide-react"
import { Label } from "../components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "../components/ui/select"
import type { ModelChoice, ModelSelection } from "../contracts"

const inherit = "default"
const labels: Record<string, string> = { none: "关闭", minimal: "极低", low: "低", medium: "中", high: "高", xhigh: "很高", max: "最高", ultra: "超高" }
const keyOf = (model: ModelSelection) => JSON.stringify([model.provider ?? null, model.id])

export function ModelPicker({ id, models, value, onChange, defaultLabel, checking, disabled }: {
  id: string; models: ModelChoice[]; value: ModelSelection | null; onChange: (value: ModelSelection | null) => void;
  defaultLabel: string; checking: boolean; disabled?: boolean;
}) {
  const selected = value && models.find(model => keyOf(model) === keyOf(value))
  const groups = new Map<string, ModelChoice[]>()
  for (const item of models) {
    const key = item.providerName ?? item.provider ?? ""
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  function choose(key: string) {
    const model = models.find(item => keyOf(item) === key)
    onChange(model ? { id: model.id, provider: model.provider } : null)
  }
  return (
    <div className="grid min-w-0 gap-3">
      <div className="grid gap-2">
        <Label htmlFor={id}><Cpu aria-hidden="true" className="size-4" />模型</Label>
        <Select value={value ? keyOf(value) : inherit} onValueChange={choose} disabled={disabled}>
          <SelectTrigger id={id} className="w-full min-w-0"><SelectValue /></SelectTrigger>
          <SelectContent position="popper" className="max-w-[min(28rem,90vw)]">
            <SelectItem value={inherit}>{defaultLabel}</SelectItem>
            {value && !selected && <SelectItem value={keyOf(value)} disabled>{value.id}（{checking ? "正在检查" : "当前不可用"}）</SelectItem>}
            {[...groups].map(([group, entries]) => <SelectGroup key={group}>
              {group && <SelectLabel>{group}</SelectLabel>}
              {entries.map(model => <SelectItem key={keyOf(model)} value={keyOf(model)}>{model.name}</SelectItem>)}
            </SelectGroup>)}
          </SelectContent>
        </Select>
        {!disabled && !models.length && <p className="text-xs text-muted-foreground">{checking ? "正在读取模型目录…" : "当前未发现可选模型，可检查运行环境的登录与提供商设置。"}</p>}
      </div>
      {value && selected && (selected.efforts.length > 0 || value.effort) && <div className="grid gap-2">
        <Label htmlFor={`${id}-effort`}>推理强度</Label>
        <Select value={value.effort ?? inherit} disabled={disabled} onValueChange={effort => onChange({ ...value, effort: effort === inherit ? undefined : effort })}>
          <SelectTrigger id={`${id}-effort`}><SelectValue /></SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value={inherit}>模型默认</SelectItem>
            {value.effort && !selected.efforts.some(row => row.id === value.effort) && <SelectItem value={value.effort} disabled>{value.effort}（当前不可用）</SelectItem>}
            {selected.efforts.map(row => <SelectItem key={row.id} value={row.id}>{labels[row.id] ?? row.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>}
    </div>
  )
}
