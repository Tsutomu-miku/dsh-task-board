# DSH 任务看板

面向 DSH Web 的本机任务看板插件，统一管理 DSH 原生会话与 Codex CLI 任务流转、可续跑会话、运行日志与执行器配置。基于 TypeScript、shadcn/ui、Tailwind CSS v4 与 Lucide Icons 构建，深度适配 DSH 浅色与深色主题。

## 核心能力

- **看板 & 列表双视图**：支持「待办 / 执行中 / 待验收 / 已完成」四列拖拽流转，以及紧凑列表视图，提供关键词搜索、工作目录与执行器组合筛选。
- **完整任务管理**：支持新建、编辑（标题/执行器/工作目录/说明）、安全删除任务卡片，WSL 环境下支持直接填写 Windows 路径并自动转换。
- **可续跑会话体验**：DSH 和 Codex 卡片都在看板内显示消息和输入区，执行步骤默认折叠，点击查看实时明细。会话使用 DSH 原生配色、间距和组件表面样式，支持模型选择、流式预览和继续会话。DSH 卡片也可手动打开原生会话。
- **执行器集中配置**：统一管理 DSH / Codex 执行器、默认模型、推理强度、固定工作目录、DSH 预设与 Codex 沙箱权限。

## 安装与升级

本版本已在 DSH `0.2.2-rc.5` 与 Node.js 24 上验证。插件需要 Node.js 22.13 或更新版本，运行环境还需满足所用 DSH 版本的 Node.js 要求。

```sh
dsh plugin --profile web add ./dsh-task-board-0.8.0.tgz
dsh web
```

在本机终端执行即可。看板由 DSH Web 加载，Codex 执行器从本机 `PATH` 启动 CLI，并使用该终端的 Codex 配置与登录。默认使用 `~/.codex`。升级时继续使用原 DSH Web profile，以保留已有任务和日志。

## Agent context

Type `@` in the composer to choose the executor for one message. The selected executor receives the new request and bounded context from earlier runs on the card. Returning to an executor resumes its last successful session when the workspace and preset still match, with context for the intervening runs. Choose a fresh session to start with the new request alone.

Use the send-mode menu to send once or change the default for the DSH Web profile. **Queue** sends pending messages in order. **Send next** moves a message to the front and leaves the active run running. **Stop current run and take over** is available on the active card, and dispatches after that run has stopped and its outcome is saved. Pending messages persist across plugin restarts and can be canceled from the composer.

DSH agents and Codex runs started from the board can use `board_list_tasks`, `board_read_context`, and `board_read_turns` to find cards and page through their prior requests, outcomes and committed replies. Several agents can read the same board concurrently.

Other local MCP clients can launch the package's `dsh-task-board-mcp` executable over stdio. For example, with the standard DSH Web profile, register it in a standalone Codex CLI:

```sh
codex mcp add dsh-task-board -- "$HOME/.dsh/profiles/web/node_modules/.bin/dsh-task-board-mcp"
```

The server uses the Web profile under `DSH_HOME` by default. To read a different profile, pass `--profile-dir` with its directory. The server opens the existing SQLite database read-only and does not require DSH Web to be running. Configure this tool only for clients you want to access that local board.

## 开发与验证

```sh
npm ci
npm run typecheck
npm test
npm run build
npm pack
```

模块划分与视觉规范见 [docs/design.md](docs/design.md)。第三方 UI 许可见 [SHADCN-LICENSE.md](SHADCN-LICENSE.md)。
