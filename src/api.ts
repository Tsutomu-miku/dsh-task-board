export function endpoint(name: string) {
  return new URL(`api/dsh-task-board/${name}`, document.baseURI)
}

export async function request<T>(name: string, init?: RequestInit): Promise<T> {
  const response = await fetch(endpoint(name), init)
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error ?? "看板请求失败，请检查 DSH 连接。")
  }
  return response.json()
}
