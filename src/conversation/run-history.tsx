import { Badge } from "../components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog"
import { stateLabel, type Task } from "../contracts"
import { RunDetails } from "../board/run-details"

export function RunHistory({ task, close, openSession }: { task: Task; close: () => void; openSession: (id: string) => void }) {
  return (
    <Dialog open onOpenChange={open => { if (!open) close() }}>
      <DialogContent className="max-h-[88vh] overflow-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>运行记录</DialogTitle>
          <DialogDescription>{task.title}</DialogDescription>
        </DialogHeader>
        {task.runs.length ? <section className="grid gap-3" aria-label="运行列表">
          {task.runs.map(run => <RunDetails key={run.id} run={run} openSession={openSession} />)}
        </section> : <p className="text-sm text-muted-foreground">暂无运行记录</p>}
        <section className="grid gap-2 border-t pt-3" aria-label="状态记录">
          <h3 className="font-medium">状态记录</h3>
          {[...task.history].reverse().map((entry, index) => <div key={index} className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline">{entry.from ? `${stateLabel(entry.from)} → ${stateLabel(entry.to)}` : "创建任务"}</Badge>
            <time className="text-xs text-muted-foreground">{new Date(entry.at).toLocaleString()}</time>
          </div>)}
        </section>
      </DialogContent>
    </Dialog>
  )
}
