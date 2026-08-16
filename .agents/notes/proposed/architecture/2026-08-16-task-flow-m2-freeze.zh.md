# Agent Note: 任务流 M2 冻结——编辑锁、不可变版本与 stale 影响传播

Status: proposed

[English](2026-08-16-task-flow-m2-freeze.md) | 中文

## Problem

任务流在打开包之前先冻结里程碑契约。M0 冻结了校准配方；M1 冻结了工作台切片——引擎注入闭包 `['tasks', 'recipes', 'agents', 'goals', 'storageDomain', 'workbenchJournal']`、三方法的 `ctx.deliverables` Remote 命名空间，以及 `schemaVersion` 为 1 的日志信封。M1 交付的产物域是刻意最小的：仅链内失效、`saveVersion` 无幂等键、无依赖边、无锁、版本写不进日志。已落地包的延后账目把后继条目命名为「M2」，且里程碑出口判据既定：上游编辑不得留下伪有效下游。没有一个冻结的 M2 范围就开包，包名、服务键、wire 变更与闭包规则会在每个包里被重新争论。

## Proposal

M2 是产物域里程碑：带依赖闭包的不可变版本、作为租约的编辑锁、以及 stale 向任务面的传播。三个包落在既有拓扑上，全部宿主侧——M2 不新增 client 包。

### 包名冻结

- `packages/task-flow/deliverable-local`（`@deepseek-ai/dsh-deliverable-local`）以同一 `ctx.deliverables` 键、同一三个 `@Remote` 方法替换 `deliverable-minimal`；被替换的包与其 bundle 行删除，M1 写下的 `deliverable_minimal` 介质被拒绝而非迁移（预发布立场）。
- `packages/task-flow/edit-lock`（`@deepseek-ai/dsh-edit-lock`）交付 `ctx.editLock`。
- `packages/task-flow/impact-propagation`（`@deepseek-ai/dsh-impact-propagation`）交付 `ctx.impactPropagation`。

### 产物版本与闭包

`saveVersion` 增加 `idempotencyKey` 参数——同键同字段重放返回已存版本，占用键下的异字段载荷按 `idempotency-conflict` 响亮失败，与 journal append 同规则；`expectedBaseVersion` 过时写拒绝不变。跨产物 `dependsOn` 边由任务写链从已受理 submission 的 `inputVersions` 登记（经 `onSubmissionAccepted` 扩展点）——executor 从不自行声明边，延伸 M1 的 caller-claims-ignored 规则。`invalidateDownstream` 保持签名，计算多 root 传递闭包，持久化并返回 `ImpactSnapshot`：按 deliverable 分组的新 stale 版本、受影响 phase run、被闭包覆盖的 gate 结果。版本写成为日志事实（`deliverable/version-saved`、`deliverable/version-staled`、`deliverable/impact-snapshotted`）；提交点仍属任务写链。按 deliverable 的最新版本索引取代线性扫描；`listCurrentInputs` 继续排除 stale、invalid、superseded 与 cancelled 产物。

### 编辑锁

`ctx.editLock`（`inject = ['storageDomain', 'workbenchJournal', 'tasks', 'deliverables']`）提供租约实体——`leaseId`、owner actor、`targetVersionId`、`acquiredAt`、`renewedAt`、`expiresAt`、`entityRevision`——经 `acquire` / `renew` / `release` / `listActive` 操作。`acquire` 接受可选 `taskId` 把租约归属到任务供取消时释放，并经 deliverable-local 的 `getVersion` / `listConsumingPhaseRuns` 宿主 seam 校验目标并冻结消费方 phase run。目标被持有时返回 conflict 与当前持有人及到期时间（首个有效写入获胜，与任务域同一乐观并发语义）。超时经读取/取得路径惰性清扫加定时扫描；超时释放绝不提交持有者的本地缓冲。租约从不取代版本比较——持有锁不豁免任何 `expectedBaseVersion` 校验。pause 保留租约直到显式释放或超时；`cancelling`/`cancelled` 任务的租约经 `{global: true}` 的 `task/updated` 监听释放。租约取得、续期、释放、超时各落一条日志事实。

### 影响向任务面应用

`ctx.impactPropagation.apply(snapshot, mutation)`（`inject = ['deliverables', 'tasks', 'workbenchJournal']`）把已持久化的快照变成任务侧写入：新增的 `markPhaseStale` 任务命令把受影响 phase run 移入终态 `stale`，被覆盖的 gate 结果标注 stale、不再支撑通过判定。stale 的 phase run 绝不原地重跑——引擎经既有事件被唤醒后重开新的 phase run，被撤销的通过靠重走挣回而非被信任。上游编辑流先 `invalidateDownstream` 再 `apply`。

### 立即调度冻结

task 服务新增 `freezePhaseScheduling` / `clearPhaseScheduling`；`PhaseRunRecord.schedulingFrozen` 自 M1 声明以来无命令写入，M2 由 edit-lock 服务拥有——取得「被活动 phase run 已注册输入引用的版本」租约即立即冻结该 run，释放或超时清除。引擎对被冻结的 run 不派发新工作，在途原子动作仍按 M1 语义受理。

## Alternatives considered

**把 B/C 人工门检放进 M2。** 不采纳：里程碑出口判据是产物闭包；B/C 检查写路径与 `awaiting-input`/`awaiting-decision` 状态属多阶段里程碑（M3），注意力收件箱持久化属 M4——拉进来只会为产物域之外的需求重开 M1 引擎闭包。

**executor 注册表与 recipe 持久存储进 M2。** 不采纳：两者是 M1 README 里松散的「M2」标签；按种类路由 executor 以多阶段配方（M3）为前提，配方注册持久化没有已分配里程碑的需求——本次冻结一并校正其标签归属。

**用 `(deliverableId, sourceSubmissionId)` 推导 `saveVersion` 幂等而非加参数。** 不采纳：executor 可能在同一 submission id 下保存中间版本，该二元组不唯一；显式键让重试去重诚实，不约束版本链。

**executor 声明 `dependsOn` 边。** 不采纳：受理是受守卫迁移；调用方声明的边会像调用方声明的现行性事实一样绕过守卫。写链从已校验的 submission 派生边。

**把影响应用折进 `deliverable-local`。** 不采纳：标记 phase run 与 gate 结果 stale 是任务域的受守卫迁移，有独立的服务生命周期；`invalidateDownstream` 保持为版本侧的图读取，`apply` 保持为任务侧写入，各归其主。

**把新服务注入引擎。** 不采纳：M1 冻结禁止扩大引擎闭包；认可的组合方式是独立服务驱动任务命令并响应既有事件，本冻结维持之。

**让锁同时校验写入。** 不采纳：租约是人工编辑会话的串行化提示；把它耦合进写校验会让一个检查出现两个权威。过时写拒绝仍归 `expectedBaseVersion`。

## Acceptance criteria

- 双 root 闭包对共享下游只 stale 一次；持久化的 `ImpactSnapshot` 重启后可重放。
- 基于 stale 输入的 submission 被写链拒绝且 problems 可读；`listCurrentInputs` 绝不列出 stale 产物。
- 过期租约释放目标且不提交持有者缓冲，下一次 `acquire` 成功；租约存续期间过时 base 仍以 stale-write 拒绝。
- pause 保留租约；cancel 释放之。覆盖被消费版本的租约冻结引用它的 phase run 调度，释放或超时解除。
- `markPhaseStale` 的 phase run 为终态；引擎重开新 phase run，被撤销的通过重新挣回。
- 真实 Loader 组合以 deliverable-local → edit-lock → impact-propagation 叠上 M1 栈，M1 引擎语义（暂停静默、恢复不重跑已过阶段）保持绿。

## Risks

`saveVersion` 签名变更与新事实种类搭载预发布立场：M1 介质被拒绝而非迁移——M1 评估期的真实任务数据按设计可弃。`markPhaseStale` 加 stale gate 结果收窄了「通过」的含义；重执行为新 run 的规则必须覆盖每条观察通过的路径，否则被撤销的通过可能伪装成现行。租约定时清扫是宿主本地的；跨主机加锁随多主机协调一并留在范围外。已落地 README 中的 B/C 门检与 executor 注册表标签随本冻结校正，但其特性尚未构建——其延后条目不得被读作 M2 范围。`invalidateDownstream` + `apply` 的上游编辑调用方在 M2 没有已交付 UI；验收先从测试与 executor seam 驱动，等工作台前端里程碑接管该流。
