# Agent Note：工作台日志——task-flow 恢复背后的只追加事实源

Status: implemented

[English](2026-08-15-workbench-journal-append-only-fact-source.md) | 中文

## 问题

任务流需要一条持久、权威的任务域变更记录，使实体投影能在崩溃后重建、客户端能重新同步。Cordis 事件只是可丢弃的唤醒信号；依赖事件做恢复无法保证一致视图。

## 决策

`packages/task-flow/workbench-journal`（`@deepseek-ai/dsh-workbench-journal`）提供绑定到 `ctx.workbenchJournal` 的 `WorkbenchJournalService`。它是一个 `TypertRemoteService`，含三个冻结的 `@Remote` 方法：

- `append(fact)` 分配无空洞单调 `journalSeq`、`eventId`、`occurredAt` 与 `schemaVersion`；该持久写是所记录变更的提交点。
- `checkpoint()` 返回已分配的最大 `journalSeq`（空日志为 0）。
- `replay(afterSeq)` 按日志顺序返回某位置之后的所有事实；中间缺失任何一条都 loud 失败，因为序列必须无空洞。

服务打开一个名为 `workbench_journal` 的 storageDomain 单元，单张 `entries` 表以零填充 `journalSeq` 为键，使字典序等于数值序。头部序列在打开时从已存键推导——不存在会与所计数事实漂移的独立持久计数器，分配与写入之间的崩溃也不会留下残留。

幂等是日志自身的契约：相同 `idempotencyKey` 且调用方字段完全一致的重放返回已存事实；字段不一致则以 `idempotency-conflict` 失败。追加在服务内串行化，并发写者永不交错。

冻结的事实信封为 `journalSeq / eventId / taskId / kind / occurredAt / actor / causationId? / correlationId? / idempotencyKey / entityRevision / payload / schemaVersion`；各类 `payload` schema 归各追加实体包所有。日志按设计不发出任何 Cordis 事件——实体包在各自提交后发出 `task/*` 唤醒事件族。

`./invariant` 伴随组件在权威变更流上执行只追加所有权：日志域上任何非 `entries` 表 `put` 的 `domain/changed` 都会使注册失败。

## 提交点模型

日志追加是单次持久写，而非两阶段事务。同时更新实体投影的任务流变更先写投影、最后追加日志；恢复从 `replay` 重建投影，因此两次写入之间崩溃留下的无依据投影行会被重放丢弃。这以不引入多记录写单元的方式实现了 M1 中「日志追加与实体投影共享 storage-domain 持久性」的约束；多记录写单元属于后续 storage-domain 阶段。

## 备选方案

- **持久头部计数器** vs **从已存键推导头部**：持久 `head` 可能与其所指条目漂移；打开时从表推导自洽，且从提交路径中移除一次写入。
- **两阶段多记录事务** vs **以日志为提交点**：storage-domain 写入链按域串行化，但 M1 没有多记录单元；以日志为提交点使追加保持单次持久写，并给恢复一个权威的重建源。

## 后果

- 任务流恢复与客户端重新同步现在拥有一个权威重建源；实体包必须为每次已提交变更追加一条事实，并把 `append` 视为提交点。
- `replay` 为 O(尾部) 且 `append` 扫描已存条目做幂等——在 M1 任务量下都可接受；索引表与有界重放窗口延后。
- 日志在 storage-domain facility 上打开一个域；没有该 facility 的部署无法加载本服务（其 `inject` 要求它）。
- M1 验收的启动恢复场景通过真实 Loader 走 checkpoint + replay，机制在设计承诺之处得到验证。

## 所需验证

- 单元套件覆盖无空洞单调序列、幂等重放、幂等冲突、并发追加、跨介质重启的序列恢复、checkpoint 后增量重放（14 项）。
- 不变量套件直接驱动变更流：日志域上的删除或外来表失败；其他域与 entries 写入保持安静（4 项）。
- keyless 真实 Loader e2e 通过 `cordis.yml` 启动完整存储栈，追加、幂等重放、销毁整个应用、在同一介质上重启，并通过 checkpoint 与 replay 观察恢复——src 与 lib 双模式。
