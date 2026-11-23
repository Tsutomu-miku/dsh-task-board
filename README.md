# DSH 任务看板

面向 DSH Web 的本机任务看板插件，统一管理 DSH 原生会话与 Codex CLI 任务流转、可续跑会话、运行日志与执行器配置。基于 TypeScript、shadcn/ui、Tailwind CSS v4 与 Lucide Icons 构建，深度适配 DSH 浅色与深色主题。

## 核心能力

- **看板 & 列表双视图**：支持「待办 / 执行中 / 待验收 / 已完成」四列拖拽流转，以及紧凑列表视图，提供关键词搜索、工作目录与执行器组合筛选。
- **完整任务管理**：支持新建、编辑（标题/执行器/工作目录/说明）、安全删除任务卡片，WSL 环境下支持直接填写 Windows 路径并自动转换。
- **可续跑会话体验**：打开卡片即进入原生风格会话页，支持流式输出预览、带一键复制的 Markdown 代码块、单次切换模型/推理强度、另起新会话、查看结构化运行事件日志与跳转 DSH 原生会话。
- **执行器集中配置**：统一管理 DSH / Codex 执行器、默认模型、推理强度、固定工作目录、DSH 预设与 Codex 沙箱权限。

## 安装与升级

已验证 DSH `0.2.2-rc.5`、Node.js 22 与 WSL/Linux。

```sh
dsh plugin --profile web add ./dsh-task-board-0.6.0.tgz
dsh web
```

升级完全兼容 v0.2–v0.5 的 `task-board/board.sqlite` 数据库，保持同一个 Web profile 即可无损沿用历史任务、会话与运行记录。

## 开发与验证

```sh
npm ci
npm run typecheck
npm test
npm run build
npm pack
```

模块划分与视觉规范见 [docs/design.md](docs/design.md)。第三方 UI 许可见 [SHADCN-LICENSE.md](SHADCN-LICENSE.md)。
