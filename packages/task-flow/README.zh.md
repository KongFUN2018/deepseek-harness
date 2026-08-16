# task-flow/ — 跨会话任务流程工作台

[English](README.md) | 中文

任务流程工作台域：以 Recipe 驱动的任务执行，含阶段提交、Gate 检查与注意力决策。工作台 journal 是持久事实源；工作台 host 服务向浏览器 UI 暴露跨会话 Remote 读取与命令。

| 包 | 职责 | ctx key / 表面 |
|---|---|---|
| [`recipe/`](recipe/README.md) | 不可变 Recipe revision 注册表：经验证的 payload、内容寻址 revision、钉定身份读取、内置空模板 | `ctx.recipes` |
| [`task/`](task/README.md) | 任务域 Service Definition：钉定配方的 task/run/phase-run 投影、受守卫迁移、PhaseSubmission 受理 | `ctx.tasks` |
| [`workbench-host/`](workbench-host/README.md) | 跨会话注意力收件箱：版本化快照读取、compare-and-set Remote 命令、转发的 `workbench/attention-updated` 推送 | `ctx.workbenchHost` |
| [`workbench-journal/`](workbench-journal/README.md) | 只追加事实源：单调持久事实、checkpoint/replay 恢复、只追加不变量 | `ctx.workbenchJournal` |
| [`deliverable-local/`](deliverable-local/README.md) | 不可变产物版本：过时写拒绝、当前输入列表、下游失效 | `ctx.deliverables` |
| [`task-local/`](task-local/README.md) | 持久任务 provider：在单个 storageDomain 单元上实现 TaskHandle 存储钩子、journal 事实提交点、写链内产物引用校验 | `ctx.tasks` |
| [`recipe-engine-core/`](recipe-engine-core/README.md) | Recipe 引擎：调度钉定配方的阶段运行、确定性提交、门检通过链、暂停/取消静默、经贡献 executor 的重启恢复 | `ctx.recipeEngine` |
| [`client-ui-task-board/`](client-ui-task-board/README.md) | 浏览器任务看板：基于 tasks Remote 的跨会话任务面板、版本门控的 `task/updated` 折叠、暂停/继续/取消动词 | `sidebar.footer.action` |

子系统参考——recipe 与任务的 wire 类型见 [docs/subsystems/task-flow.md](../../docs/subsystems/task-flow.md)，注意力条目身份、快照与命令 wire 类型、转发事件见 [docs/subsystems/workbench.md](../../docs/subsystems/workbench.md)。M2 里程碑范围——带依赖闭包的不可变版本、编辑锁、stale 影响向任务面的传播——冻结于 [M2 冻结 Note](../../.agents/notes/proposed/architecture/2026-08-16-task-flow-m2-freeze.md)。
