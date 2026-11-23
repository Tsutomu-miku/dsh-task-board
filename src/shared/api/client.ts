import type { BoardAction, BoardState, EnvironmentInfo, RunEvent, Transcript } from "../types/board"

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

export function fetchBoardState(signal?: AbortSignal): Promise<BoardState> {
  return request<BoardState>("state", { signal })
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

export function fetchConversation(cardId: string, signal?: AbortSignal): Promise<Transcript> {
  return request<Transcript>(`conversation?card=${encodeURIComponent(cardId)}`, { signal })
}

export function fetchRunEvents(runId: string, signal?: AbortSignal): Promise<RunEvent[]> {
  return request<RunEvent[]>(`events?run=${encodeURIComponent(runId)}`, { signal })
}
