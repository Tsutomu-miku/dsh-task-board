# DSH 任务看板架构与设计（v0.6）

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
| `server/domain/` | 看板核心业务（`board-service`、`cards`、`executors`、`runs`、`models`），处理卡片 CRUD、状态流转、单并发运行调度、重启中断恢复和旧库迁移。 |
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
| `src/features/board/` | 看板页工具栏（搜索、工作目录/执行器筛选、看板/列表切换）、四列拖拽泳道、任务卡片、列表视图、任务新建/编辑弹窗与删除确认。 |
| `src/features/conversation/` | 任务会话页：半透明吸顶页头、流式对话气泡、带语言标和复制按钮的代码块、浮动输入区、模型切换条和运行日志时间线弹窗。 |
| `src/features/executors/` | 执行器管理页：环境健康概览、双列设置卡片、执行器编辑弹窗。 |

## 视觉与样式规范

- **层次与表面**：采用「画布 (`--dsw-alias-bg-base`) → 凹陷泳道 (`--dsw-specific-sidebar-fill`) → 抬升卡片 (`--dsw-alias-bg-layer-1` + 发丝描边与多层轻柔阴影)」三层空间结构，浅色与深色模式均保持清晰的图底分离。
- **响应式宽度**：看板使用 `max-width: 1380px` 宽屏容器配合 CSS Container Queries（1 → 2 → 4 列），避免四列挤压；执行器页保持 `980px`，会话正文与输入区对齐 DSH 原生阅读轴（`~848px`）。
- **语义色与 Lucide 图标**：统一使用 `lucide-react` 图标表达状态与能力（`CircleDashed` 待办、`Loader2` 执行中、`Clock` 待验收、`CheckCircle2` 已完成、`Sparkles` DSH、`Terminal` Codex），色彩仅聚焦于状态标、引擎徽章和交互焦点。

## 数据兼容与验证

- 沿用既有 SQLite 表结构（`cards`、`executors`、`board_settings`、`run_events`、`assistant_replies`），v0.2–v0.5 数据库零损升级。
- 验证流程：

```sh
npm run typecheck
npm test
npm run build
npm pack
```
