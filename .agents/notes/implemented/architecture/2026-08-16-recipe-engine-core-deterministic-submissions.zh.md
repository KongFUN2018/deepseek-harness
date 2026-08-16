# Agent Note：Recipe 引擎核心 — 确定性提交与观察屏障的调度

Status: implemented

[English](2026-08-16-recipe-engine-core-deterministic-submissions.md) | 中文

## 问题

M1 ⑥ 需要驱动钉定配方任务走过阶段执行、提交、门检与通过的调度器：task 服务拥有受守卫迁移，但没有东西为它们排序。冻结的 M1 引擎闭包是 `['tasks', 'recipes', 'agents', 'goals', 'storageDomain', 'workbenchJournal']` — 不含 deliverables、注意力与澄清 — 而 executor 重试、宿主重启、暂停与取消都必须收敛到同一持久状态，而不是重复提交或重跑已通过的阶段。

## 决策

`packages/task-flow/recipe-engine-core`（`@deepseek-ai/dsh-recipe-engine-core`）交付 `RecipeEngineCore`：绑定 `ctx.recipeEngine` 的普通 `Service`（宿主内部，不经 `@Remote` 驱动），外加针对其自有 `recipe_engine` 域 `phase_sessions` 表的 `./invariant` 伴生件。

Executor 接缝是单一注册槽：`registerExecutor(executor)` 在第二次注册时抛错、返回清理函数并重跑恢复——因缺少 executor 而停滞的任务随即恢复。引擎持有调度、提交、门检、静默与恢复；executor 只针对一个 `PhaseAssignment` 执行单个阶段的工作并回报 `PhaseOutcome`。

提交身份是确定性的：`submissionIdFor(phaseRun, attempt)` = `sub-<phaseRunId>-a<attempt>`，幂等键为 `engine:submit:<phaseRunId>:<attempt>`，并随 assignment 交给 executor，使其保存的产物版本携带任务写链校验的 `sourceSubmissionId`。产物写入与提交记录之间的崩溃因此以下一次尝试的重新执行自愈；受理之后的崩溃重放已存储的提交。

调度是按任务串行的单循环，自 `task/updated` 链式触发。每轮重新读取任务：终态任务释放其阶段会话；`pausing` 与 `cancelling` 等待在途执行后落定（取消先取消活跃阶段运行）；运行中的任务重新校验钉定配方哈希与配方形态 — 不匹配将投毒并停止调度 — 并推进当前运行。推进收敛到唯一活跃阶段运行（崩溃窗口产生的超出最新者的孤儿被取代），再依次走过 `startPhaseRun` → executor → `recordSubmission` → 门检 → `markPhasePassed`，最后一个阶段通过即完成任务。空模板门检机械求值：受理提交的 `outputVersions` 必须列出每个声明的阶段输出。

暂停与取消是在原子动作之间观察的屏障，而 executor 加提交是一个原子动作：在 `requestPause` 之后回报的 executor 仍会记录其提交 — 任务 provider 接受来自 `pausing` 任务的提交 — 循环随后落定暂停。处于取消中或已终态的任务丢弃在途结果，由循环取消该阶段运行。这需要一处 task provider 变更：`acceptSubmission` 现在接纳 `running` 与 `pausing` 任务（阶段运行仍必须是 `running`），因为执行中途到达的暂停不能孤立已完成的原子动作。

阶段会话优先无钥匙：每次尝试以 `sessionId` `phase-<phaseRunId>-a<attempt>` 调用 `agents.create`，以携带 `phase.goal` 的 `goals.create` 建目标，并在阶段落定时释放句柄。未注册代理工厂时，引擎捕获精确的 `no agent factory registered` 错误并退化为合成会话 id `phase-<phaseRunId>`，无钥匙部署仍可调度。启动时恢复先校验每个非终态任务的 journal 头（`task/updated` 实体修订最大值）与其投影修订 — 不匹配将投毒 — 再重新触发调度：`running` 阶段以下一次尝试重新执行，`submitted` 阶段只补录缺失的 A 检查（以提交的 `submittedAt` 去重），已通过的阶段绝不重跑。

## 验证

- 内存存储栈上的 8 个单元测试：完整驱动至完成（阶段通过、确定性提交 id、一个通过的门检）、executor 单槽注册与释放、无 executor 停滞（阶段停留 `running`）、暂停静默（被扣住的 executor 记录后才落定）、取消静默（阶段取消、任务取消）、已提交未门检阶段的同介质重启（恢复后恰好一个门检）、执行中死亡的阶段跨重启重执行（尝试 2 完成），以及完整代理路径（执行期间阶段会话代理与目标存在、落定后释放）。
- 5 个不变式测试：合法绑定写入保持安静；键与 phaseRunId 不匹配、attempt 0 绑定声称拥有会话或提交、缺少尝试会话的提交均失败；删除、未知表与其他域保持安静。
- 经 `cordis.yml` 夹具（storage → storage-json → storage-domain → recipe → workbench-journal → deliverable-minimal → task-local → agent → goal → recipe-engine-core）的一次真实 Loader e2e：自动完成并断言提交与门检、同介质重启保持完成且无重复门检、暂停静默后恢复至完成，源码与 lib 两种启动模式皆通过。

## 考虑过的替代方案

- "Remote 驱动引擎" 对比 "普通 Service"：引擎是宿主内部的；暴露 Remote 表面会引诱对引擎串行链的带外变更。
- "Executor 持有提交" 对比 "引擎记录提交"：提交受理是引擎排序的受守卫迁移；让 executor 提交会把静默与幂等性移出唯一所有者。
- "随机或 uuid 提交 id" 对比 "确定性 sub-<phaseRunId>-a<attempt>"：重试去重与跨重启重放需要一个引擎与 executor 都能独立推导的 id。
- "暂停到达时暂存在途提交" 对比 "立即记录"：暂存会搁浅已追溯到提交 id 的产物版本，且需要重启叙事并不具备的结果持久化；在 pausing 时记录保持原子动作完整，代价是一条受理规则放宽。
- "强制要求代理工厂" 对比 "无钥匙退化"：M1 无钥匙部署没有工厂；捕获精确错误使它们的调度仍然有效，阶段溯源则依赖 executor 回报的序列区间。

## 后果

- 任务 provider 的提交受理现在区分暂停与取消；task-local README 与子系统页记录了放宽后的规则。
- `submitting` 阶段运行状态在 M1 不可达（无命令进入它）；循环仍对其静默返回，使未来命令不会无声脱离调度。
- 投毒任务保持投毒：配方不支持的形态与恢复不匹配记录错误并停止调度；M1 没有解除投毒的命令。
- 遗留：按阶段种类路由 executor（单槽）、无钥匙阶段会话的会话日志、跨宿主调度（按任务链与在途映射是宿主本地的）。
