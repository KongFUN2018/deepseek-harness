# dsh-digest — 任务摘要投影

[English](README.md) | 中文

M6 journal 派生的单任务只读投影：run 分支（rewind 交接）、完整时间线、阶段摘要、决策历史与产物状态。纯只读——不写任务面、不开 AttentionItem、不参与 Gate 与调度。

## 用法

```ts
const digest = await ctx.remote.digest.digest(taskId)
```

## 模型体验（Model Experience）

无：本包为人类审查计算宿主侧的持久任务事实投影，不组装任何提示词、消息、schema、流或工具结果，也无任何模型可见输入依赖它。

#### KV 缓存影响

无；本包从不组装或发送模型请求。

## 已知限制与后续工作

- 时间线 `summary` 是 journal 事实 kind；人类可读措辞由 client locale 负责。
- run 分支从 `rewind/applied` 与 `task-run/updated` journal 事实派生；从未出现在两者中的 run（rewind 支持前创建）只以当前 run 呈现。
- 每次读取重算投影；增量投影表等待实测量级阈值。
