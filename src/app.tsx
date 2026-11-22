import { useEffect, useState } from "react"
import { Columns3, Plus, Settings2 } from "lucide-react"
import { Alert, AlertDescription } from "./components/ui/alert"
import { Button } from "./components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select"
import { BoardView } from "./board/board-view"
import { ConversationPage } from "./conversation/conversation-page"
import { CreateCardDialog } from "./board/create-card-dialog"
import { ExecutorsPanel } from "./executors/executors-panel"
import { BoardPortal } from "./portal"
import { useBoard } from "./use-board"
import type { State } from "./contracts"

export function App({ openSession }: { openSession: (id: string) => void }) {
  const { board, error, save } = useBoard()
  const [page, setPage] = useState<"board" | "executors">("board")
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [workspace, setWorkspace] = useState("all")
  const [moveError, setMoveError] = useState("")
  const [portal, setPortal] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const element = document.createElement("div")
    element.className = "dsh-task-board"
    document.body.append(element)
    setPortal(element)
    return () => element.remove()
  }, [])

  const task = board?.cards.find(card => card.id === selected)
  const running = board?.cards.find(card => card.status === "running")
  const workspaces = board ? [...new Set(board.cards.map(card => card.workdir))].sort() : []
  const cards = board?.cards.filter(card => workspace === "all" || workspace === card.workdir) ?? []
  function move(id: string, status: State) {
    const card = board?.cards.find(entry => entry.id === id)
    if (!card || card.status === "running" || card.status === status || status === "running") return
    setMoveError("")
    void save({ action: "move", id, status, from: card.status }).catch(error => setMoveError(error.message))
  }
  return (
    <BoardPortal.Provider value={portal}>
      <div className="dsh-task-board" data-task-board>
        {task ? <ConversationPage key={task.id} task={task} executor={board?.executors.find(row => row.id === task.executorId)}
          running={running} close={() => setSelected(null)} save={save} openSession={openSession} /> :
        <div className="mx-auto grid max-w-7xl gap-4 p-4 md:p-6">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
            <h1 className="flex items-center gap-2 text-lg font-semibold"><Columns3 className="size-5" aria-hidden="true" />任务看板</h1>
            <nav aria-label="任务看板导航" className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
              <Button size="sm" variant={page === "board" ? "secondary" : "ghost"} onClick={() => setPage("board")} aria-current={page === "board" ? "page" : undefined}>看板</Button>
              <Button size="sm" variant={page === "executors" ? "secondary" : "ghost"} onClick={() => setPage("executors")} aria-current={page === "executors" ? "page" : undefined}><Settings2 aria-hidden="true" />执行器</Button>
            </nav>
          </header>
          {(error || moveError) && <Alert variant="destructive"><AlertDescription>{error || moveError}</AlertDescription></Alert>}
          {board && page === "executors" && <ExecutorsPanel executors={board.executors} preferred={board.defaultExecutor} save={save} />}
          {board && page === "board" && <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Select value={workspace} onValueChange={setWorkspace}>
                <SelectTrigger aria-label="按工作目录筛选" className="max-w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">所有工作目录</SelectItem>{workspaces.map(dir => <SelectItem key={dir} value={dir}>{dir}</SelectItem>)}</SelectContent>
              </Select>
              <Button disabled={!board.defaultExecutor} onClick={() => setCreating(true)}><Plus aria-hidden="true" />新建任务</Button>
            </div>
            {!board.defaultExecutor && <p className="text-sm text-muted-foreground">请在执行器页面启用一个执行器。</p>}
            <BoardView cards={cards} executors={board.executors} open={setSelected} move={move} />
          </>}
        </div>}
      </div>
      {creating && portal && board && <CreateCardDialog close={() => setCreating(false)} save={save} executors={board.executors} preferred={board.defaultExecutor} />}
    </BoardPortal.Provider>
  )
}
