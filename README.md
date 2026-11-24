# DSH 任务看板

在 DSH Web 里管理本机任务，把同一张卡片交给 DSH 或 Codex 执行。卡片保留任务说明、会话和运行记录，支持按轮切换执行器并交接上下文。 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)

## 安装与升级

准备好 Node.js 24.9 或更新版本，以及 pnpm。下文使用已在 macOS 上验证的 DSH `0.2.2-rc.5`。插件支持 macOS、Linux 和 WSL。使用 Codex 执行器时，先登录 Codex CLI，并确保启动 DSH Web 的终端能运行 `codex --version`。

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
npx --yes --package=@deepseek-ai/dsh@0.2.2-rc.5 -- dsh plugin --profile web add ./dsh-task-board-0.8.3.tgz
npx --yes --package=@deepseek-ai/dsh@0.2.2-rc.5 -- dsh web
```

终端已有 `dsh` 命令时，可直接执行上面从 `dsh` 开始的部分。打开 DSH Web 后，在侧边栏选择 **任务看板**。升级时沿用原 `web` profile，安装新版包后重启 DSH Web，再刷新页面。已有卡片、运行记录和会话会保留。

## 开始使用

1. 在 **执行器** 页面启用或新建 DSH、Codex 执行器。按需设置模型、推理强度、固定工作目录和权限。
2. 创建任务卡片，填写任务说明并选择默认执行器。打开卡片发送第一条消息。
3. 在输入框输入 `@`，或用底部的 **执行器** 控件指定本轮执行器。用旁边的 **模型** 浮层调整本轮模型和推理强度。接手的 Agent 会收到任务说明和近期运行结果，并可按需读取更早的上下文。切回原执行器时，工作目录与预设兼容的会话可以续跑。
4. 展开 **执行过程** 查看分页日志。任务运行时可查看最近命令和耗时，执行器上报用量时也会显示 token 统计。

看板提供拖拽和列表两种视图。可按关键词、工作目录和执行器筛选任务。DSH 执行的轮次也可以打开原生会话。

### 发送方式

| 方式 | 有任务正在运行时 |
| --- | --- |
| **排队** | 放到等待队列末尾，按发送顺序执行。 |
| **插队** | 放到等待队列最前，等当前运行结束后优先执行。 |
| **停止当前并接管** | 在正在运行的卡片上停止当前轮，保存结果后启动下一轮。 |

初始默认值是 **排队**，可在 DSH 的 **设置 → 通用设置 → 任务看板默认发送方式** 修改。有任务运行时，发送按钮旁的菜单可为当前消息选择其他方式。待执行消息会在重启后保留，可在卡片底部取消。

## 让其他 Agent 读取看板

看板内的 DSH 和 Codex 可以直接调用以下只读工具。外部 Agent 可以通过本机 MCP 接入同一份上下文。

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

## 常见问题

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

参见 [架构与设计](docs/design.md)、[第三方 UI 许可](SHADCN-LICENSE.md) 和 [执行器图标来源与许可](docs/executor-icon-notices.md)。
