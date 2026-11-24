import { useId, useState } from "react"
import { Check, ChevronDown, X } from "lucide-react"
import { Popover } from "radix-ui"
import { buttonVariants } from "../../shared/components/ui/button"
import { useBoardPortal } from "../../shared/hooks/use-portal"
import { useEnvironment } from "../../shared/hooks/use-environment"
import { effortLabel, groupModels, modelKey } from "../../shared/lib/model-catalog"
import type { Engine, ModelSelection } from "../../shared/types/board"
import { composerCopy } from "./composer-copy"

export function ComposerModelPopover({ engine, workdir, value, inherited, resume, disabled, onChange }: {
  engine: Engine
  workdir: string
  value: ModelSelection | null
  inherited: ModelSelection | null
  resume: boolean
  disabled: boolean
  onChange: (model: ModelSelection | null) => void
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const portal = useBoardPortal()
  const copy = composerCopy()
  const { environment, checking, error } = useEnvironment(workdir, open)
  const models = environment?.models[engine] ?? []
  const selectedKey = value && modelKey(value)
  const selected = models.find(model => modelKey(model) === selectedKey)
  const groups = groupModels(models)
  const effective = value ?? inherited
  const summary = effective ? [effective.id, effective.effort].filter(Boolean).join(" · ") : copy.modelDefault
  const caption = `${copy.model} · ${summary}`
  const defaultLabel = resume ? copy.usePreviousModel : copy.executorModel

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" disabled={disabled} title={caption}
          className={`${buttonVariants({ variant: "outline", size: "sm" })} max-w-[min(14rem,100%)]`}>
          <span className="truncate">{caption}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal container={portal}>
        <Popover.Content side="top" align="start" sideOffset={8} collisionPadding={12} aria-labelledby={`${id}-title`}
          className="z-50 grid w-80 max-w-(--radix-popover-content-available-width) max-h-[min(26rem,var(--radix-popover-content-available-height))] gap-2 overflow-y-auto rounded-xl border border-input bg-popover p-2 text-popover-foreground shadow-lg">
          <div className="flex items-center justify-between pl-2">
            <h2 id={`${id}-title`} className="text-sm font-medium">{copy.model}</h2>
            <Popover.Close type="button" aria-label={copy.dismiss}
              className={buttonVariants({ variant: "ghost", size: "icon-xs" })}>
              <X className="size-3.5" aria-hidden="true" />
            </Popover.Close>
          </div>
          <fieldset className="m-0 grid min-w-0 gap-0.5 overflow-y-auto border-0 p-0 max-h-56">
            <legend className="sr-only">{copy.model}</legend>
            <ModelOption name={id} checked={!value} onSelect={() => onChange(null)}>
              {defaultLabel}
            </ModelOption>
            {value && !selected && (
              <ModelOption name={id} checked disabled>
                {value.id} · {checking ? copy.modelLoading : copy.modelUnavailable}
              </ModelOption>
            )}
            {[...groups].map(([provider, entries]) => (
              <div key={provider} className="grid min-w-0 gap-0.5">
                {provider && <div className="truncate px-2 pt-1 text-xs text-muted-foreground">{provider}</div>}
                {entries.map(model => (
                  <ModelOption key={modelKey(model)} name={id} checked={modelKey(model) === selectedKey}
                    onSelect={() => onChange({ id: model.id, provider: model.provider })}>
                    {model.name}
                  </ModelOption>
                ))}
              </div>
            ))}
          </fieldset>
          {(checking || error || !models.length) && (
            <p role="status" className="px-2 text-xs text-muted-foreground">
              {checking ? copy.modelLoading : error || copy.modelEmpty}
            </p>
          )}
          {value && selected && selected.efforts.length > 0 && (
            <fieldset className="m-0 min-w-0 border-0 px-2 pt-1 pb-0">
              <legend className="text-xs text-muted-foreground">{copy.effort}</legend>
              <div className="flex flex-wrap gap-1">
                {[{ id: "", name: copy.effortDefault }, ...selected.efforts].map(effort => (
                  <label key={effort.id} className="cursor-pointer">
                    <input className="peer sr-only" type="radio" name={`${id}-effort`}
                      checked={(value.effort ?? "") === effort.id}
                      onChange={() => onChange({ ...value, effort: effort.id || undefined })}
                    />
                    <span className="block rounded-md border border-input px-2 py-1 text-xs hover:bg-accent peer-checked:border-ring peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                      {effortLabel(effort, copy.locale === "zh")}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function ModelOption({ name, checked, disabled, onSelect, children }: {
  name: string
  checked: boolean
  disabled?: boolean
  onSelect?: () => void
  children: React.ReactNode
}) {
  return (
    <label className="min-w-0 cursor-pointer">
      <input className="peer sr-only" type="radio" name={name} checked={checked} disabled={disabled} onChange={onSelect} />
      <span className="flex min-w-0 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent peer-checked:bg-accent peer-disabled:opacity-60 peer-focus-visible:ring-2 peer-focus-visible:ring-inset peer-focus-visible:ring-ring">
        <span className="truncate">{children}</span>
        {checked && <Check className="size-3.5 shrink-0" aria-hidden="true" />}
      </span>
    </label>
  )
}
