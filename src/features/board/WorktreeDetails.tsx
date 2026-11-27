import type { TaskWorktree } from "../../shared/types/board"

export function WorktreeDetails({ worktree }: { worktree: TaskWorktree }) {
  return <div className="grid gap-1 text-xs">
    <p className="break-all font-mono">{worktree.branch}</p>
    <p className="break-all text-muted-foreground">{worktree.path}</p>
    {worktree.target && <p className="break-all text-muted-foreground">合回 {worktree.target} · {worktree.repo}</p>}
    {worktree.risks.map(risk => <p key={risk} className="text-destructive">{risk}</p>)}
  </div>
}
