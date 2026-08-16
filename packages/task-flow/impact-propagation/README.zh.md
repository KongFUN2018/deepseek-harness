# @deepseek-ai/dsh-impact-propagation

[English](README.md) | 中文

任务流影响应用（`ctx.impactPropagation`）：把持久化的产物 `ImpactSnapshot` 应用到任务面。上游编辑流在 `invalidateDownstream` 之后调用它——受影响 phase run 移入 `stale`，其 submission 产生的 gate 裁决被标注 stale，从而不再支撑通过判定。

## 配置

服务挂载于产物服务与任务 provider 之后，自身无需配置。

```yaml
- id: deliverable-local
  name: '@deepseek-ai/dsh-deliverable-local'
- id: task-local
  name: '@deepseek-ai/dsh-task-local'
- id: impact-propagation
  name: '@deepseek-ai/dsh-impact-propagation'
```

## 服务契约

- `apply(snapshot: ImpactSnapshot, mutation: TaskMutationContext)` — 校验快照后，对每个受影响 phase run 调用任务命令 `markPhaseStale`（带已存 run 的 `expectedRevision`，若该 run 未 stale）；对每个 stale gate-check 组调用 `markGateChecksStale`。快照指名不存在的 phase run，或任务状态机禁止的 `running`/stale 迁移，以任务错误 loud 失败。重放同一快照幂等——已 stale 的 run 与裁决被跳过。返回 `{ staledPhaseRuns, staledGateChecks }`。

快照持久化于产物域；本服务只应用它，故自身不追加 journal 事实。

## 不变式

`./invariant` 伴生是有说明的空安装器：本服务不拥有自己的存储域，只经冻结的任务命令改任务面，其迁移由任务包自身的不变式检查。

## Model Experience

### 产物闭包在任务面的应用

#### 模型看到什么

不直接看到任何东西。`markPhaseStale` 与 `markGateChecksStale` 改变引擎重开哪些阶段，因此影响以未来 phase 提示词形式抵达模型，而非本包产出的文本。

#### Token 影响

无。应用写入存储域上的任务投影，不经模型请求路径。

#### KV Cache 影响

无。本包不增删或重排任何提示词前缀。

## Known Limitations and Deferred Work

- **无影响预览。** `apply` 直接执行闭包；rewind/patch 影响预览（M5，FR-7）在应用前消费快照。
