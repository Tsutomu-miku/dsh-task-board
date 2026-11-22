# DSH 任务看板设计

## 目标

在 DSH Web 内管理本机 DSH 与 Codex 执行器，按卡片组织任务，查看每次运行的日志和结果。插件由 Cordis 加载，由 DSH Web 处理登录和授权。任务从 DSH 直接执行。

本版的工作流是待办、执行中、待验收、完成。用户选择执行器后开始运行，成功后进入待验收。失败、停止或宿主退出会留下可追查的运行记录。项目级自动交接、多机调度和定时任务属于独立需求。

## 技术选型

| 部位 | 选择 | 原因 |
| --- | --- | --- |
| 界面 | TypeScript、DSH 共享的 React、shadcn/ui、Tailwind CSS | 保留现有控件，通过 Cordis 的侧栏和主面板挂载。组件直接读取 DSH 的主题变量。样式限定在面板及弹层内，避免改动宿主。 |
| 宿主代码 | Node.js ESM | DSH 直接加载插件入口。TypeScript 编译只用于浏览器产物。 |
| 接口 | DSH 的鉴权 Fetch 路由 | 复用宿主登录与权限，在同一浏览器会话里读写看板。客户端只调用插件接口。 |
| 本地存储 | Node.js 22 的 SQLite、WAL | 沿用 0.2 数据库，支持事务、持久化运行事件和重启恢复。单机部署只需现有 DSH 与 Codex。 |
| DSH 执行 | 宿主 Session Controller、预设、会话事件 | 保留 DSH 的模型、权限、会话续跑和会话入口。 |
| Codex 执行 | 本机 `codex exec --json` 与专用工作进程 | 沿用 CLI 的登录和沙箱配置。工作进程跟踪取消和宿主退出，回传结构化运行事件。 |
| 会话更新 | SQLite 保留已提交的回复，活跃会话轮询预览 | 复用宿主鉴权。运行记录按需读取。 |

DSH Web 的主面板与工作区导航使用 Cordis 的扩展接口，交付前要在安装版 DSH 中验证。 [DSH Web 客户端](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/web-client.md) · [DSH 布局与主题](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-layout/README.md)

## 模块和依赖

| 路径 | 责任 |
| --- | --- |
| `index.mjs` | Cordis 插件入口，装配存储、业务服务、DSH/Codex 适配器和 HTTP 路由。 |
| `server/http.mjs` | 路由、请求校验、响应和状态码，不负责调度或读写 SQLite。 |
| `server/storage/` | 数据库生命周期、迁移、事务和存取语句，不读取 DSH Context。 |
| `server/board/` | 执行器配置、卡片流转、运行生命周期。通过装配时传入的适配器执行任务。 |
| `server/runners/` | 与 DSH 会话和 Codex CLI 交互，将运行结果和事件交给看板。适配器不直接写数据库。 |
| `src/client.tsx`、`src/app.tsx` | 注册 DSH 面板和导航，组织功能页面和共享请求状态。 |
| `src/board/`、`src/executors/` | 按功能维护卡片、编辑表单、运行详情和执行器列表。 |
| `src/components/ui/`、`src/styles.css`、`src/surfaces.css` | shadcn 控件、DSH 主题映射和插件内卡片、列、会话输入区的表面样式。控件不持有业务状态。 |

依赖从入口指向各模块。HTTP 层调用看板服务，服务依赖存储与执行适配器。前端和后端的边界是 JSON 请求与响应。常见的新增操作应能限定在所属功能、接口接线和对应测试。

## DSH Web 视觉规范

以下依据固定到本机使用的 `dsh-v0.2.1-rc.5`。DSH 本体用 CSS Modules 和 `ui-primitives`。插件按项目约定保留 shadcn/ui 和 Tailwind，用 `src/styles.css` 映射宿主变量，通过 `src/surfaces.css` 应用原生布局和表面样式。 [Web 样式规范](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.5/docs/web-styling.md) · [圆角标准](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.5/docs/ui-radius.md)

| 部位 | 原生依据 | 插件做法 |
| --- | --- | --- |
| 页面框架和字号 | 「插件」与「自动化任务」共用 960px 内容区、20/28px 的 500 字重标题、13px 次级文字。 [插件页](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.5/packages/client/ui-plugin-manager/src/client/PluginManagerPage.module.css) · [自动化任务页](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.5/packages/client/ui-schedule/src/client/TaskManagerPage.module.css) | 普通页头和轻量筛选区共用内容轴。看板根据面板宽度切换四列、两列或一列。列本身保持中性底色，颜色只用于状态标记。 |
| 卡片和浮层 | 任务类卡片用 R16，设置卡用 R20 和发丝边。浮层用 `--dsw-elevation-panel` 或 `--dsw-elevation-prominent`，阴影的第一层自带发丝边。 [圆角标准](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.5/docs/ui-radius.md) · [官方阴影实现](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.5/packages/client/ui-theme/src/styles/gradient-shadow-text.css) | 可拖拽的任务卡采用 R16 和宿主面板阴影，作为看板主要交互面。执行器和单条运行记录采用设置卡样式。 |
| 会话 | 原生输入框使用 R28、`--dsw-specific-input-major`、`--dsw-elevation-soft`，配 34px 的圆形发送按钮。正文跟随宿主字号。 [输入框源码](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.5/packages/client/ui-conversation/src/client/skeleton/InputBar.module.css) | 用户消息使用圆角气泡。回复按正文排版，运行记录从页头展开。输入区和正文共用内容轴。 |

## 数据与生命周期

- 执行器有稳定 ID、工具类型、名称、启用状态，可选择默认项。DSH 调用宿主模型和预设，Codex 可以配置只读或可写工作区。可配置固定工作目录，留空时使用卡片目录。
- 卡片可以绑定一个执行器。每次开始运行时保存当次执行器快照、工作目录和随后返回的会话 ID。后续修改名称或目录不会改写历史。新会话读当前配置，续跑沿用原会话的工作目录并使用当前 Codex 权限。
- 卡片状态与运行结果分别记录。一次运行最多保留最近 250 条事件和最终结果。事件按顺序持久化，人工停止只作用于提交的运行 ID。
- 每个 DSH profile 同时只运行一张卡片，并用 SQLite 文件锁避免多个宿主同时写入。重启时把遗留运行标记为中断，保留会话和事件。用户选择是否续跑。
- 迁移沿用已有卡片 JSON 和运行记录。无执行器 ID 的旧卡片按原类型关联默认 DSH 或 Codex 执行器，旧运行保留原工作目录、输出和会话。迁移与中断恢复在一个事务内完成。

## 模型目录与运行

- DSH 模型目录来自当前宿主，使用提供商和模型 ID 区分同名模型。开始任务前按宿主解析模型配置，在原生会话作用域应用模型。DSH 0.2.1-rc.5 的兼容操作隔离在 `server/runners/dsh-model.mjs`，跳过会更新全局默认的会话控制入口。 [DSH 会话控制](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/api/session-controller)
- Codex 模型目录通过本机 App Server 的 stdio 连接读取，按工作目录缓存 15 秒。目录查询完成后关闭子进程。执行仍由 `codex exec` 负责，选中的模型和推理强度作为本次启动参数。 [Codex App Server](https://learn.chatgpt.com/docs/app-server#list-models-modellist)
- Codex 工作进程将 `TMPDIR`、`TMP` 和 `TEMP` 指向当前 DSH profile 下的 `task-board/codex-tmp`。这样 DSH Web 可以在启动它的临时会话结束后继续创建沙箱挂载。工作目录、会话 ID 和沙箱权限仍按执行器设置与运行快照传入。
- 新会话默认使用执行器的模型，续跑默认沿用上次运行的明确选择。卡片临时选择只影响本次运行。运行快照保存请求的模型，旧执行器和旧运行的模型字段为空时沿用原本的默认行为。目录查询失败时保留已有配置，并在界面显示目录可用情况。

## 任务会话

卡片打开独立会话页。发送、追问和停止通过原有运行服务提交，运行记录从页头按需打开。默认用卡片已保存的 DSH 会话或 Codex thread 续跑，用户也可以选择另起会话。会话内的 Markdown 由 react-markdown 渲染，HTML 与外部图片保持关闭。

会话页按时间显示看板提交的提示词和助手回复。0.5 将新的已提交回复单独写入 SQLite，旧版本的运行输出作为历史回退。DSH 的流式预览来自原生事件，仅显示当前运行拥有的输出。Codex 显示 CLI 发出的回复事件。刷新或重启后，从数据库恢复提交过的消息和执行器会话 ID。也可从会话页打开 DSH 原生会话查看其完整记录。

## 验收

1. 从已有 0.2 数据库启动，能查看原卡片、状态、历史和会话，并关联到正确的执行器。
2. 能新增、编辑、启用、停用执行器和设置默认。新增卡片能使用已启用的执行器。停用后，历史依然可查。
3. 在真实 DSH Web 主面板使用 shadcn 表单和弹层。切换宿主深色主题后，面板与弹层同步变色。
4. DSH 与 Codex 都能运行并记录会话。运行中可查日志、停止，结束后能继续同一会话。重启后能查记录，中断任务由用户决定是否重试。
5. 执行 `npm run typecheck`、`npm test`、`npm run build`，再用隔离 DSH Web profile 安装打包产物进行浏览器验证。

浏览器验证从一份独立的 `DSH_HOME` 开始。依次安装包、启动 Web、打开侧栏入口。在测试 profile 中创建执行器和卡片，使用测试模型服务验证 DSH 会话。Codex 测试使用当前机器已登录的 CLI，仅发送返回固定文本的任务。DSH 测试的会话和配置留在隔离 profile 中。

```sh
npm run typecheck
npm test
npm run build
npm pack
dsh_check_home=$(mktemp -d)
DSH_HOME="$dsh_check_home" dsh plugin --profile web add "$PWD/dsh-task-board-0.5.3.tgz"
DSH_HOME="$dsh_check_home" dsh web --port 0 --no-open
```
