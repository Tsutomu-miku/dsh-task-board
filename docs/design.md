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
| 日志更新 | 仅对打开的活跃运行轮询日志接口 | 复用宿主鉴权，支持页面重开后恢复。当前单机单任务规模适合有界轮询。 |

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
| `src/components/ui/`、`src/styles.css` | shadcn 组件与宿主主题映射。控件不持有业务状态。 |

依赖从入口指向各模块。HTTP 层调用看板服务，服务依赖存储与执行适配器。前端和后端的边界是 JSON 请求与响应。常见的新增操作应能限定在所属功能、接口接线和对应测试。

## 数据与生命周期

- 执行器有稳定 ID、工具类型、名称、启用状态，可选择默认项。DSH 调用宿主模型和预设，Codex 可以配置只读或可写工作区。可配置固定工作目录，留空时使用卡片目录。
- 卡片可以绑定一个执行器。每次开始运行时保存当次执行器快照、工作目录和随后返回的会话 ID。后续修改名称或目录不会改写历史。新会话读当前配置，续跑沿用原会话的工作目录并使用当前 Codex 权限。
- 卡片状态与运行结果分别记录。一次运行最多保留最近 250 条事件和最终结果。事件按顺序持久化，人工停止只作用于提交的运行 ID。
- 每个 DSH profile 同时只运行一张卡片，并用 SQLite 文件锁避免多个宿主同时写入。重启时把遗留运行标记为中断，保留会话和事件。用户选择是否续跑。
- 迁移沿用已有卡片 JSON 和运行记录。无执行器 ID 的旧卡片按原类型关联默认 DSH 或 Codex 执行器，旧运行保留原工作目录、输出和会话。迁移与中断恢复在一个事务内完成。

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
DSH_HOME="$dsh_check_home" dsh plugin --profile web add "$PWD/dsh-task-board-0.3.0.tgz"
DSH_HOME="$dsh_check_home" dsh web --port 0 --no-open
```
