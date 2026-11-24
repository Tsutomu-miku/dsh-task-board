const failedStatuses = new Set(["failed", "declined"])

export function reportCodexActivity({ type, item }, emit, commandOutput) {
  if (!item) return
  const started = type === "item.started"
  const completed = type === "item.completed"
  const updated = type === "item.updated"
  if (item.type === "todo_list") {
    const lines = item.items?.map(row => `${row.completed ? "✓" : "○"} ${row.text}`) ?? []
    if (lines.length) emit("status", ["任务计划", ...lines].join("\n"))
    return
  }
  if (!started && !completed && !(updated && item.type === "command_execution")) return
  const failed = failedStatuses.has(item.status)
  const resultKind = failed ? "error" : "tool_result"
  switch (item.type) {
    case "command_execution": {
      if (started) emit("command", item.command)
      else {
        const full = item.aggregated_output ?? ""
        const previous = commandOutput.get(item.id) ?? ""
        const text = full.startsWith(previous) ? full.slice(previous.length) : full
        if (updated) {
          if (text) {
            commandOutput.set(item.id, full)
            emit("tool_result", text)
          }
          break
        }
        commandOutput.delete(item.id)
        const exit = Number.isInteger(item.exit_code) ? `退出码 ${item.exit_code}` : failed ? "命令未完成" : "命令完成"
        emit(item.exit_code ? "error" : resultKind, [exit, text].filter(Boolean).join("\n"))
      }
      break
    }
    case "mcp_tool_call": {
      const label = `${item.server}/${item.tool}`
      const blocks = item.result?.content ?? []
      const text = blocks.filter(block => block.type === "text").map(block => block.text).join("\n")
      if (started) emit("tool", [label, JSON.stringify(item.arguments)].filter(Boolean).join("\n"))
      else emit(resultKind, [label, item.error?.message, text || JSON.stringify(item.result?.structured_content),
        blocks.some(block => block.type !== "text") ? "包含非文本结果" : ""].filter(Boolean).join("\n"))
      break
    }
    case "file_change": {
      const files = item.changes?.map(file => `${file.kind} ${file.path}`) ?? []
      emit(completed ? resultKind : "tool", [failed ? "文件变更失败" : "文件变更", ...files].join("\n"))
      break
    }
    case "collab_tool_call":
      emit(started ? "tool" : resultKind, `协作工具 ${item.tool}${completed ? (failed ? "失败" : "完成") : ""}`)
      break
    case "web_search":
      emit(started ? "tool" : resultKind, `${started ? "搜索" : "搜索完成"} · ${item.query}`)
      break
    case "error":
      if (completed) emit("error", item.message)
      break
  }
}
