# DSH 任务看板

任务看板是 DeepSeek Harness 的 Cordis 插件。安装在 Web profile 后，从 DSH 左侧的「任务看板」打开。面板使用 shadcn/ui，任务接口沿用 DSH Web 登录。

## 安装

已验证 DSH `0.2.1-rc.5`、Node.js 22.23.1 和 Linux。插件需要 Node.js 22.13 或更新版本，以及 POSIX 进程组支持。安装依赖 DSH 的插件管理命令和 `pnpm`。

在安装包所在目录执行第一行。第二行可在要工作的项目目录执行。若 Web 已启动，重新启动一次即可加载。

```sh
dsh plugin --profile web add ./dsh-task-board-0.2.0.tgz
dsh web
```

进入 `dsh web` 输出的登录地址，再点侧栏的「任务看板」。新建卡片默认使用本次启动 Web 的目录。卡片会记住创建时的工作目录。

DSH 执行使用当前 Web profile 的模型和权限配置，并创建可在该 profile 的会话列表找到的原生会话。Codex 执行使用宿主 PATH 上的 `codex` 和它自己的登录状态，默认使用 `read-only` 沙箱。

要固定新卡片的项目目录或允许 Codex 写入工作区，在 Web profile 的 `cordis.patch.yml` 加入下列配置。执行权限由维护宿主的用户决定。

```yaml
- id: task-board
  config:
    workspace: /absolute/path/to/project
    codexSandbox: workspace-write
```

## 工作流与存储

- 卡片支持待办、执行中、待验收、完成。可以拖拽待办、待验收和完成卡片，也可以在详情里切换状态。
- 同一 profile 同时运行一张卡片。可新建会话、继续已保存的会话或请求停止。执行成功进入待验收。失败、停止和中断回到待办。
- SQLite 保存卡片、状态变更、运行结果和会话编号，目录为 Web profile 下的 `task-board/`。同一个 profile 只允许一个看板宿主写入。
- 单次运行的时间上限为 30 分钟。宿主异常退出后，遗留的执行会显示为已中断，卡片回到待办，由用户决定是否继续。执行过的外部操作需要在继续前核对。

## 开发与打包

```sh
npm ci
npm run typecheck
npm run build
npm test
npm pack
```

`cordis.patch.yml` 声明插件装载项，`client.js` 注册 DSH 主面板和侧栏，`index.mjs` 注册 DSH 鉴权的 Fetch 路由。shadcn/ui 组件版权见 `SHADCN-LICENSE.md`。

[DSH Bundle 发布文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md) · [DSH Web 客户端扩展接口](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/web-client.md)
