const copy = {
  zh: {
    locale: "zh",
    agent: "本轮执行器", executor: "执行器", followDefault: "任务默认",
    queue: "排队", priority: "插队", takeover: "停止当前并接管",
    sendMode: "发送方式", thisSend: "本次发送", defaultMode: "任务看板默认发送方式",
    defaultModeHint: "已有任务运行时，新消息按此方式等待执行。", savingMode: "正在保存…",
    queued: "等待发送", queueFailed: "派发失败",
    cancel: "取消", dismiss: "关闭", send: "发送", start: "开始会话",
    stop: "停止运行", stopping: "正在停止…",
    message: "消息", placeholder: "输入消息，或输入 @ 选择执行器",
    chooseAgent: "选择执行器", resetSession: "另起会话", newSession: "即将另起会话",
    model: "模型", modelDefault: "默认", usePreviousModel: "沿用上次运行", executorModel: "跟随执行器默认",
    modelLoading: "正在读取模型…", modelEmpty: "没有可选模型。", modelUnavailable: "当前不可用",
    effort: "推理强度", effortDefault: "模型默认",
    disabled: "请选择已启用的执行器。", shortcut: "Enter 发送 · Shift+Enter 换行",
    activeTask: "正在运行", handoff: "已带入上轮上下文",
  },
  en: {
    locale: "en",
    agent: "Executor for this message", executor: "Executor", followDefault: "Task default",
    queue: "Queue", priority: "Send next", takeover: "Stop current run and take over",
    sendMode: "Send mode", thisSend: "This message", defaultMode: "Task Board default send mode",
    defaultModeHint: "Applies when a task is already running.", savingMode: "Saving…",
    queued: "Queued messages", queueFailed: "Could not start",
    cancel: "Cancel", dismiss: "Dismiss", send: "Send", start: "Start session",
    stop: "Stop run", stopping: "Stopping…",
    message: "Message", placeholder: "Enter a message, or type @ to choose an executor",
    chooseAgent: "Choose executor", resetSession: "Start a fresh session", newSession: "Starting a fresh session",
    model: "Model", modelDefault: "Default", usePreviousModel: "Use the previous model", executorModel: "Use the executor default",
    modelLoading: "Loading models…", modelEmpty: "No models available.", modelUnavailable: "Unavailable",
    effort: "Reasoning effort", effortDefault: "Model default",
    disabled: "Choose an enabled executor.", shortcut: "Enter to send · Shift+Enter for a new line",
    activeTask: "Running", handoff: "Context carried over",
  },
}

export function composerCopy() {
  const lang = document.documentElement.lang || navigator.language
  return lang.toLowerCase().startsWith("zh") ? copy.zh : copy.en
}
