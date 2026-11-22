import { useState } from "react"
import { Bot, ChevronRight, CodeXml } from "lucide-react"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "../components/ui/card"
import { columns, engines, runLabels, type Executor, type State, type Task } from "../contracts"

function TaskCard({ card, executor, open }: { card: Task; executor?: Executor; open: () => void }) {
  const EngineIcon = card.engine === "dsh" ? Bot : CodeXml
  const lastRun = card.runs[0]
  return (
    <Card draggable={card.status !== "running"} onDragStart={event => {
      event.dataTransfer.setData("text/x-board-card", card.id)
      event.dataTransfer.effectAllowed = "move"
    }} className="task-card relative min-w-0 gap-2 p-3">
      <CardHeader className="flex min-w-0 items-start justify-between gap-2 p-0">
        <CardTitle className="min-w-0">
          <Button variant="ghost" className="task-card-button h-auto min-h-5 min-w-0 max-w-full justify-start p-0 text-left text-sm leading-5 font-medium wrap-anywhere whitespace-normal" onClick={open}>{card.title}</Button>
        </CardTitle>
        <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </CardHeader>
      <CardContent className="p-0">
        <p className="line-clamp-3 wrap-anywhere text-[13px] leading-5 text-muted-foreground">{card.prompt}</p>
      </CardContent>
      <CardFooter className="flex-wrap gap-x-2 gap-y-1 p-0 pt-1 text-xs leading-[18px] text-muted-foreground">
        <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
          <EngineIcon className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate" title={executor?.name}>{executor?.name ?? engines[card.engine]}</span>
        </span>
        {lastRun && <span className="whitespace-nowrap">· {runLabels[lastRun.status]}</span>}
      </CardFooter>
    </Card>
  )
}

export function BoardView({ cards, executors, open, move }: {
  cards: Task[]; executors: Executor[]; open: (id: string) => void; move: (id: string, status: State) => void;
}) {
  const [dropTarget, setDropTarget] = useState<State | null>(null)
  return (
    <div className="board-columns grid min-w-0 gap-4" onDragEnd={() => setDropTarget(null)}>
      {columns.map(column => {
        const tasks = cards.filter(task => task.status === column.status)
        return (
          <section key={column.status} aria-label={column.label} data-status={column.status} data-drop-target={dropTarget === column.status}
            className="board-column min-w-0"
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
            <div className="board-column-heading flex items-center gap-2">
              <span className="board-column-mark size-1.5" aria-hidden="true" />
              <h2 className="text-sm font-medium">{column.label}</h2>
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">{tasks.length}</span>
            </div>
            <div className="grid gap-2.5 pt-3">
              {tasks.map(card => <TaskCard key={card.id} card={card} executor={executors.find(row => row.id === card.executorId)} open={() => open(card.id)} />)}
              {!tasks.length && <p className="px-1 py-2 text-[13px] leading-5 text-muted-foreground">暂无任务</p>}
            </div>
          </section>
        )
      })}
    </div>
  )
}
