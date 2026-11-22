import { useState } from "react"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { columns, engines, runLabels, type Executor, type State, type Task } from "../contracts"

function TaskCard({ card, executor, open }: { card: Task; executor?: Executor; open: () => void }) {
  return (
    <Card draggable={card.status !== "running"} onDragStart={event => {
      event.dataTransfer.setData("text/x-board-card", card.id)
      event.dataTransfer.effectAllowed = "move"
    }} className="min-w-0 gap-2 py-3">
      <CardHeader className="gap-2 px-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant="secondary">{executor?.name ?? engines[card.engine]}</Badge>
          <span className="text-xs text-muted-foreground">{card.runs[0] ? runLabels[card.runs[0].status] : "尚未运行"}</span>
        </div>
        <CardTitle className="leading-snug">
          <Button variant="link" className="h-auto max-w-full justify-start px-0 py-0 text-left text-sm break-words whitespace-normal" onClick={open}>{card.title}</Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3">
        <p className="line-clamp-3 wrap-anywhere text-xs leading-relaxed text-muted-foreground">{card.prompt}</p>
      </CardContent>
    </Card>
  )
}

export function BoardView({ cards, executors, open, move }: {
  cards: Task[]; executors: Executor[]; open: (id: string) => void; move: (id: string, status: State) => void;
}) {
  const [dropTarget, setDropTarget] = useState<State | null>(null)
  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4" onDragEnd={() => setDropTarget(null)}>
      {columns.map(column => {
        const tasks = cards.filter(task => task.status === column.status)
        return (
          <section key={column.status} aria-label={column.label}
            className={`min-h-48 min-w-0 rounded-lg border p-3 ${dropTarget === column.status ? "bg-accent" : "bg-muted/60"}`}
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
            <div className="mb-3 flex items-center gap-2 px-1 py-1">
              <span className={`size-2 rounded-full ${column.mark}`} />
              <h2 className="text-sm font-semibold">{column.label}</h2>
              <Badge variant="outline" className="ml-auto">{tasks.length}</Badge>
            </div>
            <div className="grid gap-2.5">
              {tasks.map(card => <TaskCard key={card.id} card={card} executor={executors.find(row => row.id === card.executorId)} open={() => open(card.id)} />)}
              {!tasks.length && <p className="px-1 py-2 text-xs text-muted-foreground">暂无任务</p>}
            </div>
          </section>
        )
      })}
    </div>
  )
}
