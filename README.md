# DSH 任务看板

在 DSH Web 里管理本机任务，把同一张卡片交给 DSH 或 Codex 执行。卡片保留任务说明、会话和运行记录，支持按轮切换执行器并交接上下文。 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)

## 安装与升级

准备好 Node.js 24.9 或更新版本，以及 pnpm。下文使用已在 macOS 上验证的 DSH `0.2.2-rc.5`。插件支持 macOS、Linux 和 WSL。使用 Codex 执行器时，先登录 Codex CLI，并确保启动 DSH Web 的终端能运行 `codex --version`。

### 直接安装

仓库里已经提交了构建好的 `dist/`，装到 profile 不需要本地构建工具链：

```zsh
dsh plugin --profile web add github:Tsutomu-miku/dsh-task-board
```

装完重启 DSH Web 即可。

### 从源码构建

```zsh
git clone https://github.com/Tsutomu-miku/dsh-task-board.git
cd dsh-task-board
npm ci
npm run build
npm pack
```

### 安装插件包

`npm pack` 会输出安装包的文件名。已有 `.tgz` 安装包时，可直接在文件所在目录执行以下命令，文件名按实际版本替换。

```zsh
npx --yes --package=@deepseek-ai/dsh@0.2.2-rc.5 -- dsh plugin --profile web add ./dsh-task-board-0.9.2.tgz
npx --yes --package=@deepseek-ai/dsh@0.2.2-rc.5 -- dsh web
```

终端已有 `dsh` 命令时，可直接执行上面从 `dsh` 开始的部分。打开 DSH Web 后，在侧边栏选择 **任务看板**。升级时沿用原 `web` profile，安装新版包后重启 DSH Web，再刷新页面。已有卡片、运行记录和会话会保留。

## 开始使用

1. 在 **执行器** 页面启用或新建 DSH、Codex 执行器。按需设置模型、推理强度、固定工作目录和权限。
2. 创建任务卡片，填写任务名称和说明，选择由谁执行。勾选「创建后自动运行」会将任务说明作为第一条消息加入队列。工作目录、关联任务和标签等可在「更多选项」中填写。
3. 在输入框输入 `@`，或用底部的 **执行器** 控件指定本轮执行器。用旁边的 **模型** 浮层调整本轮模型和推理强度。接手的 Agent 会收到任务说明和近期运行结果，并可按需读取更早的上下文。切回原执行器时，工作目录与预设兼容的会话可以续跑。
4. 展开 **执行过程** 查看分页日志。任务运行时可查看最近命令和耗时，执行器上报用量时也会显示 token 统计。

看板提供拖拽和列表两种视图。可按关键词、工作目录和执行器筛选任务。DSH 执行的轮次也可以打开原生会话。

### 并发、依赖与交付

- 默认最多同时运行 4 张卡。Git 任务从当前已提交的 HEAD 创建 `board/<任务 ID>` 分支和独立工作树。同一任务复用工作树，不同任务目录按路径防止写入重叠。需要使用原目录的未提交文件时，在任务设置中选「直接使用目录」。工作树和分支保留在本机，方便验收与恢复。
- 创建子任务时选择父任务和阶段，也可以添加独立的前置任务。相同阶段的任务可并发。后续阶段和依赖方在前置卡片进入「已完成」后自动从等待队列调度。归档可从看板筛选并恢复。
- 点击「交付」查看分支、提交、已修改文件和 Git Diff。在任务设置填写 GitHub PR 链接后可查看 PR 状态与 CI。公开 PR 可直接查询，私有 PR 需要登录本机 GitHub CLI。

### 协作与自动化

- 「协作」支持讨论串、附件、项目共享文档和唤醒规则。文本评论不触发执行。附件可用于下一轮，支持模型接收图片时可直接把图片作为输入。Agent 可把当前工作区里的文件回传为附件。
- 唤醒可按时间（可重复）、依赖完成、其他任务状态或当前 PR 的 CI 通过触发。规则保存在本机，DSH Web 运行时检查，重启后会补发到期的任务。收件箱记录执行结果、阻塞、交接、审批和唤醒。
- DSH 与 Codex 都可在运行中纠偏。Codex 使用本机 App Server，可在执行器设置中允许在看板审批权限请求。角色指令、技能名称、超时与 Token 预算可按执行器配置。Codex 可绑定本机已配置的 MCP。Codex 和本机命令可配置环境变量或引用宿主进程中的密钥变量，DSH 通过其原生预设配置宿主能力。
- Claude Code、Gemini CLI 等可添加为「本机命令」执行器。填写可执行程序、逐行参数和消息传递方式。命令按宿主用户权限运行，任务看板保存标准输出和错误信息，并提供手动停止与超时。

### 发送方式

| 方式 | 有任务正在运行时 |
| --- | --- |
| **排队** | 放到等待队列末尾，按发送顺序执行。 |
| **插队** | 放到等待队列最前，等当前运行结束后优先执行。 |
| **停止当前并接管** | 在正在运行的卡片上停止当前轮，保存结果后启动下一轮。 |

初始默认值是 **排队**，可在 DSH 的 **设置 → 通用设置 → 任务看板默认发送方式** 修改。有任务运行时，发送按钮旁的菜单可为当前消息选择其他方式。待执行消息会在重启后保留，可在卡片底部取消。

## 让其他 Agent 读取看板

看板内的 DSH 和 Codex 可以调用以下上下文工具。外部 Agent 可以通过本机 MCP 读取同一份上下文。

| 工具 | 用途 |
| --- | --- |
| `board_list_tasks` | 按状态、工作目录或标题查找任务。 |
| `board_read_context` | 读取任务说明、最新运行和分页的已保存回复。 |
| `board_read_turns` | 分页读取用户请求、执行器和运行结果。 |

把 MCP 注册到独立运行的 Codex CLI 时，可使用当前 DSH Web profile 路径。

```zsh
dsh_web_profile="${DSH_HOME:-$HOME/.dsh}/profiles/web"
codex mcp add dsh-task-board -- \
  "$dsh_web_profile/node_modules/.bin/dsh-task-board-mcp" \
  --profile-dir "$dsh_web_profile"
```

MCP 通过 stdio 读取本机 profile 的 SQLite 数据。首次启动看板创建数据库后，DSH Web 退出时也可以读取历史。

由看板启动的 DSH 和 Codex 轮次还可调用 `board_set_outcome`、`board_post_comment`、`board_add_attachment` 和 `board_read_project`。只有源和目标执行器均允许自动委派时，`board_delegate` 才能把后续轮次排队或创建子卡。Agent 写权限随本轮结束撤销。

## 常见问题

- **启动报 `ENOENT ... dist/styles.css`**。安装到的包缺少构建产物，通常是改完源码没有重新构建或没有提交 `dist/`。在源码目录运行 `npm run build`，把 `dist/` 一起提交，再重新安装。
- **Git URL 安装提示 `Already up to date` 或「无法从依赖变更中确定安装了哪一个包」**。按上面的步骤构建并安装 `.tgz`，然后重启 DSH Web。
- **侧边栏没有任务看板**。确认安装命令使用 `--profile web`，并重新启动该 profile。首次安装可以先运行一次 `dsh web` 确认 DSH 能正常启动。
- **看板找不到 Codex**。在启动 DSH Web 的终端运行 `codex --version`，确认命令在 `PATH` 上。

## 开发

```zsh
npm ci
npm run typecheck
npm test
npm run build
```

`npm run build` 生成 `dist/styles.css` 和 `dist/client.js`，两者随仓库提交：Git URL 安装不会在安装端执行构建，缺了 `dist/` 插件启动就会报 `ENOENT ... dist/styles.css`。

`dist/` 仍留在 `.gitignore` 里——Tailwind 会扫描整个包目录，把已构建的 CSS 再扫一遍会让产物越滚越大。改过 `src/` 之后先 `npm run build`，再 `git add -f dist` 强制加入暂存区。


参见 [架构与设计](docs/design.md)、[第三方 UI 许可](SHADCN-LICENSE.md) 和 [执行器图标来源与许可](docs/executor-icon-notices.md)。
