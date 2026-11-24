import { useEffect, useId, useState } from "react"
import { fetchBoardState, postBoardAction } from "../../shared/api/client"
import type { DefaultSendMode } from "../../shared/types/board"
import { composerCopy } from "./composer-copy"

const modes = ["queue", "priority"] as const

export function SendModePreference() {
  const copy = composerCopy()
  const id = useId()
  const [saved, setSaved] = useState<DefaultSendMode>()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const controller = new AbortController()
    fetchBoardState(controller.signal).then(board => {
      if (!controller.signal.aborted) setSaved(board.defaultSendMode)
    }).catch(error => {
      if (!controller.signal.aborted) setError(error.message)
    })
    return () => controller.abort()
  }, [])

  async function changeMode(mode: DefaultSendMode) {
    setSaving(true)
    setError("")
    try {
      await postBoardAction({ action: "set-default-send-mode", mode })
      setSaved(mode)
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <fieldset className="dsh-task-board min-w-0" disabled={saved === undefined || saving} aria-describedby={`${id}-hint`}>
      <legend className="text-sm font-medium">{copy.defaultMode}</legend>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
        <p id={`${id}-hint`} className="mr-auto text-xs text-muted-foreground">{copy.defaultModeHint}</p>
        <div className="flex flex-wrap gap-4">
          {modes.map(mode => (
            <div key={mode} className="flex items-center gap-2 text-sm">
              <input type="radio" id={`${id}-${mode}`} name={id} value={mode} checked={saved === mode}
                onChange={() => void changeMode(mode)}
                className="size-4 accent-[var(--board-brand)]"
              />
              <label htmlFor={`${id}-${mode}`} className="py-1">{copy[mode]}</label>
            </div>
          ))}
        </div>
      </div>
      {saving && <p role="status" className="mt-1 text-xs text-muted-foreground">{copy.savingMode}</p>}
      {error && <p role="alert" className="mt-1 text-xs text-[var(--board-danger)]">{error}</p>}
    </fieldset>
  )
}
