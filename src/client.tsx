import { Columns3 } from "lucide-react"
import { App } from "./app"
import { endpoint } from "./api"

type Context = {
  effect: (setup: () => () => void) => void
  slots: {
    inject: (name: string, setup: () => unknown) => void
    register: <Props extends object>(options: Record<string, unknown>, component: React.ComponentType<Props>) => unknown
  }
  uiWorkspace: { openSession: (id: string) => void }
}

export const inject = ["slots", "uiWorkspace"]

export function apply(ctx: Context) {
  ctx.effect(() => {
    const style = document.createElement("link")
    style.rel = "stylesheet"
    style.href = endpoint("styles.css").href
    document.head.append(style)
    return () => style.remove()
  })
  ctx.slots.inject("main", () => ctx.slots.register({ name: "main", key: "task-board" }, () => (
    <App openSession={id => ctx.uiWorkspace.openSession(id)} />
  )))
  ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
    name: "sidebar.panellist", id: "task-board", order: 30, label: "任务看板",
  }, ({ size }: { size: number }) => <Columns3 size={size} aria-hidden="true" />))
}
