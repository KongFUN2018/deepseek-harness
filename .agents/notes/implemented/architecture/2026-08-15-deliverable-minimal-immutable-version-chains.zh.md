# Agent Note：Deliverable-minimal——task-flow 受理背后的不可变版本链

Status: implemented

[English](2026-08-15-deliverable-minimal-immutable-version-chains.md) | 中文

## 问题

task-flow 受理链必须拒绝构建在过时输出之上的提交。M1 里程碑需要一个最小产物记录：每产物不可变版本、保存时的过时写拒绝、某阶段运行的当前输入列表，以及下游失效——无需 M2 的影响传播机制。

## 决策

`packages/task-flow/deliverable-minimal`（`@deepseek-ai/dsh-deliverable-minimal`）提供绑定到 `ctx.deliverables` 的 `DeliverableService`。它是一个 `TypertRemoteService`，含三个冻结的 M1 `@Remote` 方法：

- `saveVersion(deliverableId, expectedBaseVersion, sourceSubmissionId)` 创建一个不可变版本。`expectedBaseVersion` 命名调用方所基于的版本（根版本为 `null`）；base 不再是最新版本、或状态不是 `current` 时以 `stale-write` 拒绝。并发保存按服务内尾链串行化——每个 base 恰好一个胜出。
- `listCurrentInputs(phaseRunId)` 按注册顺序返回该阶段运行已注册输入中状态为 `current` 的版本；stale、invalid、superseded、cancelled 版本被排除。
- `invalidateDownstream(rootVersionIds[])` 把根版本及其链上所有更新版本标记 stale。完整传递影响闭包与 ImpactSnapshot 属 M2。

服务打开一个名为 `deliverable_minimal` 的 storageDomain 单元，含 `versions` 与 `phase_inputs` 两张表。产物的最新版本在读取时从已存记录推导（M1 规模线性扫描），因此不存在会漂移的独立索引。

两个宿主侧 seam 服务同进程的任务写链：`recordPhaseInputs(phaseRunId, versionIds)` 在受理时注册 submission 的输入引用，`getVersion(versionId)` 为输出存在与来源匹配检查读取单个版本。二者均非 Remote，因为 M1 客户端命名空间只冻结上述三个方法，而 task-local 与引擎都在宿主进程内。

`./invariant` 伴随组件在权威变更流上检查输入引用完整性：`phase_inputs` 注册引用了未存储的版本即失败。

## 备选方案

- **按产物的索引表** vs **读取时推导最新版本**：M1 产物量使线性扫描可接受，且推导出的头部不会与所指版本漂移；索引随 M2 落地。
- **把 `recordPhaseInputs`/\`getVersion\` 设为 Remote** vs **保持宿主侧**：冻结的客户端命名空间只列三个方法，而 M1 唯一消费方（task-local、引擎）共享宿主进程。
- **只失效下游版本** vs **同时标记根为 stale**：输入列表必须排除来源已被撤销的根；先标记根本身使 `listCurrentInputs` 保持一致。

## 后果

- task-flow 受理现在可以在任务写链内拒绝输入非 current 的提交，并按来源 submission 校验输出出处。
- `listCurrentInputs` 与线性最新版本扫描在 M1 规模为 O(n)；按产物的索引与影响闭包属 M2。
- 服务在 storage-domain facility 上打开一个域；没有该 facility 的部署无法加载它（其 `inject` 要求它）。
- 版本写是可重建投影；日志提交点仍属任务写链，产物事实随 M2 闭包落地。

## 所需验证

- 单元套件覆盖根版本与链式保存、对已移动与非 current base 的过时写拒绝、当前输入过滤、恰好一次转换的链内失效、重启恢复（15 项）。
- 不变量套件直接驱动变更流：悬空的 phase-input 引用失败；版本 put、其他表与其他域保持安静（3 项）。
- keyless 真实 Loader e2e 通过 `cordis.yml` 启动完整存储栈，链式创建三个版本、拒绝过时写、注册并列出输入、失效下游、在同一介质上重启并观察恢复——src 与 lib 双模式。
