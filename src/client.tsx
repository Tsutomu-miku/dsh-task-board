import { Kanban } from "lucide-react"
import { useEffect } from "react"
import { AppShell } from "./features/layout/AppShell"
import { NativeTaskAction } from "./features/conversation/NativeTaskAction"
import { endpoint } from "./shared/api/client"

type Context = {
  effect: (setup: () => () => void) => void
  slots: {
    inject: (name: string, setup: () => unknown) => void
    register: <Props extends object>(
      options: Record<string, unknown>,
      component: React.ComponentType<Props>
    ) => unknown
  }
  uiWorkspace: { openSession: (id: string) => void }
  layout: { selectPanel: (id: string) => void }
}

const panel = "task-board"
const nativeHeader = "conversation.session.header.utilities"
export const inject = ["slots", "uiWorkspace", "layout"]

export function apply(ctx: Context) {
  let requestedTask: string | null = null

  function openDetails(id: string) {
    requestedTask = id
    ctx.layout.selectPanel(panel)
  }

  function BoardPanel() {
    const initialTaskId = requestedTask
    useEffect(() => {
      if (requestedTask === initialTaskId) requestedTask = null
    }, [initialTaskId])
    return <AppShell initialTaskId={initialTaskId} openSession={id => ctx.uiWorkspace.openSession(id)} />
  }

  ctx.effect(() => {
    const style = document.createElement("link")
    style.rel = "stylesheet"
    style.href = endpoint("styles.css").href
    document.head.append(style)
    return () => style.remove()
  })

  ctx.slots.inject("main", () =>
    ctx.slots.register({ name: "main", key: panel }, BoardPanel)
  )

  ctx.slots.inject(nativeHeader, () =>
    ctx.slots.register({ name: nativeHeader, id: "task-board.details", order: 30 }, ({ sessionId }: { sessionId: string }) => (
      <NativeTaskAction sessionId={sessionId} openDetails={openDetails} />
    ))
  )

  ctx.slots.inject("sidebar.panellist", () =>
    ctx.slots.register(
      { name: "sidebar.panellist", id: panel, order: 30, label: "任务看板" },
      ({ size }: { size: number }) => <Kanban size={size} strokeWidth={1.8} aria-hidden="true" />
    )
  )
}
