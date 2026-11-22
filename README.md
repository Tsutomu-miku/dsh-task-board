# DSH 任务看板

以 DSH Web 插件管理本机任务、DSH 和 Codex 执行器。看板、配置表单与运行详情使用 shadcn/ui，并跟随 DSH 的主题和字体。

## 安装与升级

已验证 DSH `0.2.1-rc.5`、Node.js 22.23.1 和 WSL/Linux。需要 Node.js 22.13 或以上、`dsh` 和 `pnpm`。执行 Codex 任务还需要本机的 `codex` CLI 和登录状态。

```sh
dsh plugin --profile web add ./dsh-task-board-0.3.0.tgz
dsh web
```

升级时先等正在执行的任务结束，再重启 Web。原有 0.2 卡片和运行历史会自动关联到对应的默认执行器。保持同一个 Web profile 即可沿用数据。

## 使用

1. 从 DSH 侧栏打开「任务看板」，切到「执行器」编辑或新增配置。DSH 使用宿主的模型和所选预设，Codex 使用本机 CLI 及配置的沙箱。
2. 在「看板」新建卡片并选择执行器。执行器设置了固定目录时，新会话使用该目录。默认目录由 Web 启动目录决定。
3. 在卡片详情里开始运行、查看日志或停止。DSH 日志可打开原生会话。继续会话时沿用会话原工作目录。
4. 成功后的卡片进入「待验收」。可以拖动卡片或通过详情菜单调整状态。

SQLite 数据在 Web profile 下的 `task-board/board.sqlite`。每个 profile 同时执行一张卡片。宿主异常退出后，进行中的运行会标记为中断，保留运行记录和已保存的会话。

## 开发

```sh
npm ci
npm run typecheck
npm test
npm run build
npm pack
```

`npm test` 覆盖旧库迁移、写入锁、默认执行器、停止竞争和续跑配置。打包后使用隔离的 DSH Web profile 验证浏览器行为，详见[设计与验收](docs/design.md)。第三方组件版权见 [SHADCN-LICENSE.md](SHADCN-LICENSE.md)。
