# @deepseek-ai/dsh-deliverable-local

[English](README.md) | 中文

任务流产物域（`ctx.deliverables`）：每个 deliverable 的持久版本链，含依赖边、幂等保存、持久化的多 root 影响快照，以及任务写链读取的当前输入索引。它在相同服务键与 Remote 面下替换 `@deepseek-ai/dsh-deliverable-minimal`。

## 配置

服务挂载于存储栈与工作台日志之后，自身无需配置。

```yaml
- id: storage
  name: '@deepseek-ai/dsh-storage'
- id: storage-json
  name: '@deepseek-ai/dsh-storage-json'
  config:
    root: /var/lib/dsh/storages
- id: storage-domain
  name: '@deepseek-ai/dsh-storage-domain'
  config:
    backend: json
- id: workbench-journal
  name: '@deepseek-ai/dsh-workbench-journal'
- id: deliverable-local
  name: '@deepseek-ai/dsh-deliverable-local'
```

## 服务契约

Remote 命令（M1 面加 M2 扩展）：

- `saveVersion(deliverableId, expectedBaseVersion, sourceSubmissionId, idempotencyKey?)` — 创建 deliverable 的下一个版本。`expectedBaseVersion` 必须等于最新版本，否则以 `stale-write` 拒绝。可选 `idempotencyKey` 在同键同字段下重放已存保存；同键异字段以 `idempotency-conflict` 拒绝。后继版本可链在 stale 头上并重新校验该 deliverable。
- `listCurrentInputs(phaseRunId)` — 该 phase run 已注册输入中状态为 `current` 的版本，按注册顺序；排除 stale/invalid/superseded 与已取消分支产物。
- `invalidateDownstream(rootVersionIds)` — 把每个 root 及其传递 `dependsOn` 消费者移入 `stale`（已 stale 子图跳过；链谱系本身不是影响边），返回并持久化 `ImpactSnapshot`。

非 Remote 宿主侧 seam，由任务写链与 edit-lock 服务拥有：

- `recordPhaseInputs(phaseRunId, versionIds)` — 受理时登记 submission 的输入版本。
- `registerVersionDependencies(versionId, dependsOn)` — 补全某版本的依赖边；executor 不自行声明边。
- `getVersion(versionId)` / `getImpactSnapshot(snapshotId)` — 读取。
- `listConsumingPhaseRuns(targetVersionId)` — 已注册输入包含该版本的 phase run；edit-lock 在版本持有租约期间恰好冻结这些 run。

### 持久事实

每次写入先追加 journal 事实再落投影：`deliverable/save`（按键保存）、`deliverable/version-saved`、`deliverable/version-staled`（每次 stale 修订一条）、`deliverable/impact-snapshotted`。版本不归属任务，故其事实使用 `deliverables` 哨兵任务 id。

## 不变式

`./invariant` 伴生在权威变更流上检查引用完整性：phase-input 登记、依赖边、保存索引、链头、影响快照都必须指名已存版本。

## Model Experience

### 任务写链背后的产物域

#### 模型看到什么

不直接看到任何东西。产物状态与快照只经任务写链的 `inputsCurrent`/`outputsValid` 判定抵达模型，本包只计算、不措辞。

#### Token 影响

无。版本、边、快照走存储域，不经模型请求路径。

#### KV Cache 影响

无。产物记录从不进入提示词，本包不增删或重排任何前缀。

## Known Limitations and Deferred Work

- **影响预览不在 M2。** `ImpactSnapshot` 会持久化并应用到任务面，但 rewind/patch 影响预览在 M5（FR-7）消费它。
- **无跨主机协调。** 保存链在单主机进程内串行化写入；多主机产物写入超出范围。
