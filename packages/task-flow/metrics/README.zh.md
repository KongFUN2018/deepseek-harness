# dsh-metrics — 工作台指标

[English](README.md) | 中文

M6 工作台 KPI 投影（运行中任务、待审 Gate/疑问项、有效产物版本、吞吐、Gate 通过率）与单任务度量（阶段耗时、重跑、决策数、预算用量）。纯只读——每次调用从实体投影与 journal 派生。

## 用法

```ts
const kpi = await ctx.remote.metrics.metrics()
const task = await ctx.remote.metrics.taskMetrics(taskId)
```

## 模型体验（Model Experience）

无：本包聚合持久任务事实供人类审查，不组装任何提示词、消息、schema、流或工具结果。

#### KV 缓存影响

无；本包从不组装或发送模型请求。

## 已知限制与后续工作

- 吞吐窗口固定 7 日；可配置窗口是后续工作（部署可变项，非硬编码参数）。
- `rerunCount` 计 rewind 应用数加重试提交数（同一 phase run 在 `submission/recorded` 中出现多次）；不读预算台账的重跑维度。
- Gate 通过率把缺省 kind 的裁决归入 A 类。
