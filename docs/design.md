# DSH 任务看板架构与设计

## 目标

在 DSH Web 中以卡片和列表视角管理本机 DSH 与 Codex 执行器任务，支持任务生命周期流转、可续跑会话、运行日志排查与执行器集中配置。插件通过 Cordis 挂载，完全复用 DSH Web 的认证、会话引擎与主题变量。

## 代码结构与依赖分层

### 后端 (`server/`)

依赖单向流动：`index.mjs` → `http/` + `domain/` + `storage/` + `runners/`。

| 路径 | 职责 |
| --- | --- |
| `index.mjs` | Cordis 插件入口，解析配置并装配存储、领域服务、执行适配器与路由。 |
| `server/config.mjs` | 配置校验与工作目录解析（含 WSL Windows 路径 `wslpath` 兼容）。 |
| `server/errors.mjs` | `BoardError` 与统一字段/UUID 校验函数。 |
| `server/storage/` | SQLite WAL 生命周期、进程排他锁与 Repository（`card`、`executor`、`reply`、`event`），不感知 DSH Context。 |
| `server/domain/` | 看板核心业务（`board-service`、`cards`、`executors`、`runs`、`models`），处理卡片 CRUD、状态流转、依赖与并发调度、重启中断恢复和旧库迁移。 |
| `server/runners/` | 统一执行调度器（`index.mjs`）、缓存环境发现（`environment.mjs`），以及解耦的 `dsh/` 与 `codex/` 子适配器。 |
| `server/http/router.mjs` | DSH 鉴权 Fetch 路由、JSON 请求校验和统一错误映射。 |

### 前端 (`src/`)

按 Feature-Sliced 方式划分，使用 TypeScript、React、shadcn/ui、Tailwind CSS v4 与 `lucide-react`：

| 路径 | 职责 |
| --- | --- |
| `src/client.tsx` | 注册 DSH 侧栏（`Kanban` 图标）与主面板入口，注入插件样式表。 |
| `src/styles/tokens.css` | 将 DSH 宿主主题变量（`--dsw-alias-*`、`--dsw-static-*`、`--dsw-elevation-*`）映射为看板语义色板与 shadcn Token。 |
| `src/styles/app.css` | `@scope (.dsh-task-board)` 作用域内的布局、泳道/卡片层级、浮层阴影与 Markdown 排版。 |
| `src/shared/` | 共享类型契约（`types/board.ts`）、类型化 API 客户端（`api/client.ts`）、状态与环境 Hooks（`hooks/`）、shadcn 原子组件（`components/ui/`）及引擎/状态/模型组件。 |
| `src/features/layout/` | `AppShell` 顶栏、运行中快捷胶囊、分段导航与全局视图切换。 |
| `src/features/board/` | 看板页工具栏（搜索、工作目录/执行器筛选、看板/列表切换）、五列拖拽泳道、任务卡片、列表视图、任务新建/编辑弹窗与删除确认。 |
| `src/features/conversation/` | 任务会话页、流式回复、浮动输入区、可折叠的运行活动和状态流转弹窗。 |
| `src/features/executors/` | 执行器管理页：环境健康概览、双列设置卡片、执行器编辑弹窗。 |

## 视觉与样式规范

- **层次与表面**：采用「画布 (`--dsw-alias-bg-base`) → 凹陷泳道 (`--dsw-specific-sidebar-fill`) → 抬升卡片 (`--dsw-alias-bg-layer-1` + 发丝描边与多层轻柔阴影)」三层空间结构，浅色与深色模式均保持清晰的图底分离。
- **响应式宽度**：看板使用 `max-width: 1380px` 宽屏容器配合 CSS Container Queries（1 → 2 → 5 列），避免泳道挤压；执行器页保持 `980px`，会话正文与输入区对齐 DSH 原生阅读轴（`~848px`）。
- **语义色与 Lucide 图标**：统一使用 `lucide-react` 图标表达状态与能力（`CircleDashed` 待办、`Loader2` 执行中、`Clock` 待验收、`CheckCircle2` 已完成、`Sparkles` DSH、`Terminal` Codex），色彩仅聚焦于状态标、引擎徽章和交互焦点。

## 数据兼容与验证

- 旧卡片 JSON 中的运行记录在事务中迁移至独立表。数据库版本游标让未变更的轮询只返回版本号，变更时传递修改或删除的卡片。折叠时只读取当前运行的最新命令，展开后分页读取日志。每页按事件时间从早到晚显示，时间相同时按序号排列。会话轮询只读取新回复，后台标签页暂停轮询。
- 日志来自执行器的外部事件。DSH 工具名、参数和文本结果来自当前请求对应的会话事件。Codex 命令、退出码与工具结果来自 App Server 的 JSON-RPC 事件。会话在运行中展示最新一条命令。
- 平均 TPM 以本次运行收到的 token 用量除以执行时长（分钟）。DSH 汇总当前运行已提交的模型步骤。Codex App Server 上报会话累计用量，运行预算减去本轮之前已知的会话用量。
- 看板会话通过 `src/styles/conversation.css` 使用 DSH 原生主题变量。用户消息使用 DSH 气泡底色，执行过程采用原生会话的细分隔和单列步骤，输入框使用 DSH 的柔和阴影与圆角。执行步骤默认折叠，标题保留运行状态和事件数，展开即可查看实时明细。 [原生消息样式](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.5/packages/client/ui-chat/src/client/chat/MessageItem.module.css) · [原生执行过程样式](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.5/packages/client/ui-chat/src/client/chat/TurnProcessNodeView.module.css) · [原生输入区样式](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.5/packages/client/ui-conversation/src/client/skeleton/InputBar.module.css)
- DSH 工具与外部 stdio MCP 共用 SQLite WAL 的只读上下文查询。看板启动的 DSH 工具以当前 Agent 实例识别正在运行的卡片，Codex 由限本轮的凭证将写请求交由宿主处理。
- 默认单轮超时一小时。可配置 `parallelism`（默认 4）、`timeoutMs`（默认 3,600,000）和 `maxTokens`（默认 0，不限），执行器可覆盖后两项。Token 预算依赖执行器上报可计量用量。宿主关闭时请求中断，并等待运行收尾。
- 验证流程：

```sh
npm run typecheck
npm test
npm run build
npm pack
```

## 调度与数据

每张卡只能同时执行一轮。不同的 Git 工作树可并行，直接运行的工作目录在路径相交时串行。旧会话继续使用已记录的目录。新的隔离任务从源仓库 HEAD 建立工作树。阶段和显式依赖在派发时校验，只有前置任务验收进入 `done` 后才开放。领取消息和创建运行同属一个 SQLite 事务。原始任务说明独立于本轮请求保存。

运行记录保留执行配置快照、会话、Git 摘要和结构化交接说明。最新 Git Diff 由工作树实时计算。附件数据、讨论、项目文档、通知和唤醒规则保存在同一 profile。清理卡片不会删除 Git 工作树或分支；归档会保留数据和代码交付物。

Codex 的交互运行使用本机 App Server 的 stdio JSON-RPC。DSH 纠偏使用已归属给看板的运行所对应 Agent 的下一步收件箱。条件唤醒由宿主轮询与状态变更共同评估，调度消息和更新规则在同一事务提交。
