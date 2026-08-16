# Agent Note：任务看板 client 插件——Remote 快照加版本门控折叠

Status: implemented

[English](2026-08-16-client-ui-task-board-remote-folds.md) | 中文

## 问题

M1 ⑦ 需要任务流工作台的最小浏览器面：跨会话任务列表，实时状态与 暂停/继续/取消 动词。M1 冻结把包钉在 `packages/task-flow/client-ui-task-board`，而 client 栈规则在 `packages/client/AGENTS.md`；client API 冻结限定消费面为 `workbenchHost`/tasks Remote 词汇加已转发的 `task/updated` 族——不新增 wire 面，不走 session projection 通道。

## 决策

`packages/task-flow/client-ui-task-board`（`@deepseek-ai/dsh-client-ui-task-board`）是一个位于 `packages/client/` 之外的标准 client 插件包：同样的 `tsconfig.base.client.json` 形态、同样的 `dsh.client` manifest 与三处注册面（repo `tsconfig.client.json` 引用、web-app `cordis.patch.yml` 行、web-app `package.json` 依赖）、同样的 `clientBundle` tsdown 预设——冻结决定落位，client 栈决定规则。

看板分两层。`src/client/board.ts` 是无 React 的对象层：`TaskBoardController` 持有一个快照存储（runtime 认可的 `createSnapshotStore` 引擎），启动时经 `remote.tasks.listTasks()` 加载，订阅 `remote.$on('task/updated', …)`，并按版本门控折叠投递——行仅在严格更高版本时更新，未知任务加入，过期或重复投递丢弃。排序为创建时间降序、taskId 决胜，折叠不会重排行序。动词（`requestPause`/`resume`/`requestCancel`）携带行当前版本、actor `task-board` 与每次调用全新的幂等键；没有客户端过期围栏，因为 Remote 的比较并交换就是守卫。`connection/reset` 或动词失败触发 `refresh()`；宿主投影是事实源，折叠只是缓存。动词失败记录错误码，且该码在重取后保留（读作历史："以 X 失败，已重新同步"），直到下一次成功命令替换。

`src/client/TaskBoardAction.tsx` 是展示半部：以 id `task-board` 占位 `sidebar.footer.action`（ui-sidebar 的加性列表席位，组合无需改 ui-sidebar），一切经四份额到达——侧栏 shell 的 `wide` owner prop、框架 `t` 席位、以及 inject face（其 `hooks.board` compartment 即控制器存储，渲染器绑定为 `useBoard`）加普通 `refresh`/`command` 回调。组件不读 ctx、不自建订阅。

面板刻意保持 M1 最小：每行状态圆点、任务 id、状态词、版本与动词按钮；一条瞬态错误行；一个刷新动作。run/phase-run 详情等待 task-detail 包。

## 验证

- 10 个控制器测试，跑在真实 cordis Context 与脚本化 `remote` 面上：启动加载排序、加载失败态、版本门控折叠的加入/替换/丢弃、动词分发携带版本与全新幂等键并折叠结果、各动词路由、失败动词的错误跨重取保留、未知任务零动作、connection-reset 重载、以及按任务状态的动词可用表。
- 5 个 jsdom 组件测试直接喂 props：触发器开合与 aria 状态、行渲染含状态词与版本、动词按钮接到 command 回调、refresh 接线、loading/empty/failed/命令错误各面板。
- 包在自身工程与两个聚合下类型检查通过；`pnpm run test:gui` 覆盖 client 道。

## 备选方案

- "workbench-client 对象层"对"插件内控制器"：spike 设计的 `workbench-client` 包（cursor 窗口、增量信封）不在 M1 冻结内；为一个列表先造它会引入里程碑不拥有的包。控制器以微缩形态保持同样的形状（快照 + 版本门控增量 + 重同步）。
- "sessionProjections 通道"对"remote 快照"：任务数据是跨会话的；projection 按契约是每会话的。
- "乐观动词状态"对"失败即重取"：乐观行需要 M1 面不展示的按行 pending 态与回滚；比较并交换错误路径加一次刷新以更少自有状态收敛。
- "注册进新的侧栏席位"对"`sidebar.footer.action`"：footer action 席位是侧栏已声明的加性、默认无占用列表；为现有席位可服务的组合强开新席位会迫使改 ui-sidebar。
- "重取即清错"对"保留到下次成功"：先重取再清错会在用户读到前抹掉失败；保留错误码到成功命令保住了错误行文案所承诺的历史。

## 后果

- 看板是第一个 `packages/client/` 之外的 client 插件；其注册证明三处注册面与落位无关（css-modules 的 `include` 需要在 `tsconfig.client.json` 加一行显式条目，沿 ui-cordis 先例）。
- `task-run/updated` 与 `phase-run/updated` 已转发但此处未消费；task-detail 包继承同样的折叠模式。
- 控制器模式（快照存储 + 版本门控折叠 + reset 重同步）是 attention inbox 在 [`task-flow-m4-client-ui`](2026-08-16-task-flow-m4-client-ui.md) 中复用的模板；当前为复制而非抽取，抽出共享折叠到小工具仍推迟到第三个消费者出现。
