import { Check, ChevronDown } from "lucide-react"
import { DropdownMenu as Menu } from "radix-ui"
import { buttonVariants } from "../../shared/components/ui/button"
import { useBoardPortal } from "../../shared/hooks/use-portal"
import type { SendMode } from "../../shared/types/board"
import { composerCopy } from "./composer-copy"

const itemStyle = "flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-accent"

export function SendModeMenu({ mode, allowTakeover, disabled, onSelect }: {
  mode: SendMode
  allowTakeover: boolean
  disabled: boolean
  onSelect: (value: SendMode) => void
}) {
  const copy = composerCopy()
  const portal = useBoardPortal()
  const choices: SendMode[] = allowTakeover ? ["queue", "priority", "takeover"] : ["queue", "priority"]
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <button type="button" className={buttonVariants({ variant: "outline", size: "xs" })}
          aria-label={`${copy.sendMode} · ${copy[mode]}`} disabled={disabled}
        >
          {copy[mode]}
          <ChevronDown className="size-3.5" aria-hidden="true" />
        </button>
      </Menu.Trigger>
      <Menu.Portal container={portal}>
        <Menu.Content side="top" align="end" sideOffset={6} className="z-50 min-w-44 rounded-xl border border-input bg-popover p-1.5 text-popover-foreground shadow-lg">
          <Menu.Label className="px-2 py-1 text-[11px] text-muted-foreground">{copy.thisSend}</Menu.Label>
          <Menu.RadioGroup aria-label={copy.thisSend} value={mode} onValueChange={value => onSelect(value as SendMode)}>
            {choices.map(choice => (
              <Menu.RadioItem key={choice} value={choice} className={itemStyle}>
                <span className="size-3.5" aria-hidden="true">
                  <Menu.ItemIndicator><Check className="size-3.5" /></Menu.ItemIndicator>
                </span>
                {copy[choice]}
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}
