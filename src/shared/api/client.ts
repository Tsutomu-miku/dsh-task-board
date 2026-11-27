import type { BoardAction, BoardSync, EnvironmentInfo, GitDelivery, PullRequest, RunEvent, TaskDetail, Transcript } from "../types/board"

export function endpoint(path: string): URL {
  return new URL(`api/dsh-task-board/${path}`, document.baseURI)
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(endpoint(path), init)
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.error ?? "看板请求失败，请检查 DSH 连接。")
  }
  return response.json() as Promise<T>
}

export function fetchBoardState(after: number, signal?: AbortSignal): Promise<BoardSync> {
  return request<BoardSync>(after ? `state?after=${after}` : "state", { signal })
}

export function fetchTaskDetail(id: string, signal?: AbortSignal) {
  return request<TaskDetail>(`task-detail?card=${id}`, { signal })
}

export function fetchDelivery(id: string, runId?: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ card: id })
  if (runId) query.set("run", runId)
  return request<{ git: GitDelivery | null; pullRequest?: PullRequest }>(`delivery?${query}`, { signal })
}

export function postBoardAction(input: BoardAction): Promise<unknown> {
  return request("action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  })
}

export function fetchEnvironment(workspace: string | null, refresh: boolean, signal?: AbortSignal): Promise<EnvironmentInfo> {
  const params = new URLSearchParams()
  if (workspace) params.set("workspace", workspace)
  if (refresh) params.set("refresh", "1")
  const query = params.toString()
  return request<EnvironmentInfo>(query ? `environment?${query}` : "environment", { signal })
}

export function fetchConversation(cardId: string, after: number, signal: AbortSignal): Promise<Transcript> {
  const query = new URLSearchParams({ card: cardId, after: String(after) })
  return request<Transcript>(`conversation?${query}`, { signal })
}

export interface ActivityPage {
  events: RunEvent[]
  hasMore: boolean
  latestCommand: string | null
}

export function fetchRunActivity(
  runId: string, page: { before?: number; after?: number; limit: number }, signal: AbortSignal,
): Promise<ActivityPage> {
  const query = new URLSearchParams({ run: runId, limit: String(page.limit) })
  if (page.before !== undefined) query.set("before", String(page.before))
  if (page.after !== undefined) query.set("after", String(page.after))
  return request<ActivityPage>(`activity?${query}`, { signal })
}
