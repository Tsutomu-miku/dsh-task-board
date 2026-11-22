import { useState } from "react"
import { ArrowUpRight, Bot, CircleCheck, CircleDot, CirclePlay, ClipboardCheck, CodeXml, Inbox } from "lucide-react"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "../components/ui/card"
import { columns, engines, runLabels, type Executor, type State, type Task } from "../contracts"

const columnIcons = { todo: CircleDot, running: CirclePlay, review: ClipboardCheck, done: CircleCheck }

function TaskCard({ card, executor, open }: { card: Task; executor?: Executor; open: () => void }) {
  const EngineIcon = card.engine === "dsh" ? Bot : CodeXml
  const lastRun = card.runs[0]
  return (
    <Card draggable={card.status !== "running"} onDragStart={event => {
      event.dataTransfer.setData("text/x-board-card", card.id)
      event.dataTransfer.effectAllowed = "move"
    }} className="task-card relative min-w-0 gap-3 rounded-xl py-3.5">
      <CardHeader className="flex min-w-0 items-start justify-between gap-2 px-3.5">
        <CardTitle className="min-w-0">
          <Button variant="ghost" className="h-auto min-h-5 min-w-0 justify-start rounded-sm p-0 text-left font-semibold wrap-anywhere whitespace-normal after:absolute after:inset-0 after:rounded-xl hover:bg-transparent" onClick={open}>{card.title}</Button>
        </CardTitle>
        <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </CardHeader>
      <CardContent className="px-3.5">
        <p className="line-clamp-3 wrap-anywhere text-[.8125rem] leading-relaxed text-muted-foreground">{card.prompt}</p>
      </CardContent>
      <CardFooter className="mx-3.5 flex-wrap gap-x-2 gap-y-1.5 border-t px-0 [.border-t]:pt-2.5">
        <Badge variant="secondary" className="max-w-full gap-1.5 rounded-md py-0.5">
          <EngineIcon className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate" title={executor?.name}>{executor?.name ?? engines[card.engine]}</span>
        </Badge>
        <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">{lastRun ? runLabels[lastRun.status] : "尚未运行"}</span>
      </CardFooter>
    </Card>
  )
}

export function BoardView({ cards, executors, open, move }: {
  cards: Task[]; executors: Executor[]; open: (id: string) => void; move: (id: string, status: State) => void;
}) {
  const [dropTarget, setDropTarget] = useState<State | null>(null)
  return (
    <div className="board-columns grid min-w-0 gap-3.5" onDragEnd={() => setDropTarget(null)}>
      {columns.map(column => {
        const tasks = cards.filter(task => task.status === column.status)
        const Icon = columnIcons[column.status]
        return (
          <section key={column.status} aria-label={column.label} data-status={column.status} data-drop-target={dropTarget === column.status}
            className="board-column min-h-44 min-w-0 rounded-xl border p-3 transition-colors"
            onDragOver={event => {
              if (column.status === "running" || !event.dataTransfer.types.includes("text/x-board-card")) return
              event.preventDefault()
              setDropTarget(column.status)
            }}
            onDrop={event => {
              event.preventDefault()
              setDropTarget(null)
              move(event.dataTransfer.getData("text/x-board-card"), column.status)
            }}>
            <div className="mb-3 flex items-center gap-2.5 px-0.5">
              <span className="board-column-icon grid size-8 place-items-center rounded-lg"><Icon className="size-4" aria-hidden="true" /></span>
              <h2 className="text-sm font-semibold">{column.label}</h2>
              <Badge variant="outline" className="board-column-count ml-auto rounded-full tabular-nums">{tasks.length}</Badge>
            </div>
            <div className="grid gap-2.5">
              {tasks.map(card => <TaskCard key={card.id} card={card} executor={executors.find(row => row.id === card.executorId)} open={() => open(card.id)} />)}
              {!tasks.length && <p className="flex min-h-24 items-center justify-center gap-2 rounded-lg border border-dashed px-2 py-4 text-xs text-muted-foreground"><Inbox className="size-4" aria-hidden="true" />暂无任务</p>}
            </div>
          </section>
        )
      })}
    </div>
  )
}
