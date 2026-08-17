# @deepseek-ai/dsh-rewind

[English](README.md) | 中文

任务流 rewind 服务（`ctx.rewind`）：M5 纠偏里程碑的分支废弃流。rewind 请求先计算交付物影响闭包，把预览持久化到一个阻塞决策 item 上（`impactSnapshot` 的第一个写入方），只有已解决且 outcome 为 `confirm-rewind` 的 item 才开 successor 任务运行——把被退役分支的全部 phase run 标记 superseded。拒绝的 outcome 不写任务面：上游编辑造成的 stale 与 rewind 选择无关。

## 配置

服务装配在交付物服务、任务 provider、attention 服务与 workbench journal 之后，自身无配置。

```yaml
- id: deliverable-local
  name: '@deepseek-ai/dsh-deliverable-local'
- id: task-local
  name: '@deepseek-ai/dsh-task-local'
- id: attention
  name: '@deepseek-ai/dsh-attention'
- id: rewind
  name: '@deepseek-ai/dsh-rewind'
```

## 服务契约

- `requestRewind(taskId, rootVersionIds, actor, idempotencyKey)` —— 执行 `deliverables.invalidateDownstream(roots)`，把闭包映射为预览（`snapshotId`、失效版本、重跑 phase、从该任务 `clarification/injected` journal 事实回放出的可复用澄清、`costHint: 'uncalibrated'`），追加 `rewind/preview-requested` 事实，并开一个 `c-decision` item（`decisionKind: 'rewind'`，选项 `confirm-rewind`/`keep-current`/`cancel`，预览序列化进 `impactSnapshot`）。空 roots、空白字段或未知任务在任何写入前显式失败。
- `applyRewind(itemId, taskRevision, actor, idempotencyKey)` —— 只有已解决的 `confirm-rewind` item 可应用：以 `parentRunId` 链接被退役分支创建 successor run，逐个（带存储 revision）`markPhaseSuperseded` 其全部 phase run，追加 `rewind/applied` 事实。未解决或外来 item 显式失败（`not-resolved`/`invalid-option`）；被拒绝的 outcome 记 `rewind/declined` 后拒绝应用。

## 不变式

`./invariant` 伴生插件是带说明的空安装器：服务自身无持久状态；它写入的分支谱系落在任务投影与 journal 事实里，由 task 包的伴生插件检查。

## Model Experience

### 工作台收件箱上的 rewind 决策

#### 模型看到什么

不直接看到。预览与决策 item 渲染在工作台收件箱；模型只会在引擎重开受影响 phase 后，把 successor 分支当作后续 phase 提示词看到。

#### Token 影响

无。服务在存储域写 attention item 与任务投影，不在模型请求路径上。

#### KV Cache 影响

无。本包不新增、删除或重排任何提示词前缀。

## Known Limitations and Deferred Work

- **无校准成本估计。** `costHint` 保持字面量 `uncalibrated`，直到 M0 校准落地；PRD §10 禁止占位数字。
- **无回撤窗口。** attention item 的 `reversibleUntil` 保持不写；该字段继续为校准窗口预留。
