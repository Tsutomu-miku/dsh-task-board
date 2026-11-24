import { Check, ChevronDown } from "lucide-react"
import { DropdownMenu as Menu } from "radix-ui"
import { buttonVariants } from "../../shared/components/ui/button"
import { useBoardPortal } from "../../shared/hooks/use-portal"
import type { DefaultSendMode, SendMode } from "../../shared/types/board"
import { composerCopy } from "./composer-copy"

const modes = ["queue", "priority"] as const
const itemStyle = "flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50"

export function SendModeMenu({ selected, preference, allowTakeover, disabled, onSelect, onPreference }: {
  selected: SendMode | null
  preference: DefaultSendMode
  allowTakeover: boolean
  disabled: boolean
  onSelect: (value: SendMode | null) => void
  onPreference: (value: DefaultSendMode) => void
}) {
  const copy = composerCopy()
  const portal = useBoardPortal()
  const choices: SendMode[] = allowTakeover || selected === "takeover" ? [...modes, "takeover"] : [...modes]
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <button type="button" className={buttonVariants({ variant: "outline", size: "xs" })}
          aria-label={`${copy.sendMode} · ${copy[selected ?? preference]}`} disabled={disabled}
        >
          {copy[selected ?? preference]}
          <ChevronDown className="size-3.5" aria-hidden="true" />
        </button>
      </Menu.Trigger>
      <Menu.Portal container={portal}>
        <Menu.Content side="top" align="end" sideOffset={6} className="z-50 min-w-44 rounded-xl border border-input bg-popover p-1.5 text-popover-foreground shadow-lg">
          <Menu.Label className="px-2 py-1 text-[11px] text-muted-foreground">{copy.thisSend}</Menu.Label>
          <Menu.RadioGroup aria-label={copy.thisSend} value={selected ?? "default"} onValueChange={value => onSelect(value === "default" ? null : value as SendMode)}>
            <ModeItem value="default" text={`${copy.defaultLabel} · ${copy[preference]}`} />
            {choices.map(mode => (
              <ModeItem key={mode} value={mode} text={copy[mode]} disabled={mode === "takeover" && !allowTakeover} />
            ))}
          </Menu.RadioGroup>
          <Menu.Separator className="my-1 border-t border-border" />
          <Menu.Label className="px-2 py-1 text-[11px] text-muted-foreground">{copy.defaultMode}</Menu.Label>
          <Menu.RadioGroup aria-label={copy.defaultMode} value={preference} onValueChange={value => onPreference(value as DefaultSendMode)}>
            {modes.map(mode => <ModeItem key={mode} value={mode} text={copy[mode]} />)}
          </Menu.RadioGroup>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}

function ModeItem({ value, text, disabled }: { value: string; text: string; disabled?: boolean }) {
  return (
    <Menu.RadioItem value={value} disabled={disabled} className={itemStyle}>
      <span className="size-3.5" aria-hidden="true">
        <Menu.ItemIndicator><Check className="size-3.5" /></Menu.ItemIndicator>
      </span>
      {text}
    </Menu.RadioItem>
  )
}
