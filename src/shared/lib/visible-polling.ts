export function pollWhileVisible(update: (signal: AbortSignal) => Promise<void>, interval?: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let current: AbortController | undefined
  let stopped = false

  async function poll() {
    if (stopped || document.hidden || current) return
    const request = new AbortController()
    current = request
    try {
      await update(request.signal)
    } finally {
      if (current === request) {
        current = undefined
        if (!stopped && !document.hidden && interval !== undefined) timer = setTimeout(poll, interval)
      }
    }
  }

  function stopPending() {
    clearTimeout(timer)
    current?.abort()
    current = undefined
  }
  function onVisibility() {
    if (document.hidden) stopPending()
    else void poll()
  }

  document.addEventListener("visibilitychange", onVisibility)
  void poll()
  return () => {
    stopped = true
    stopPending()
    document.removeEventListener("visibilitychange", onVisibility)
  }
}
