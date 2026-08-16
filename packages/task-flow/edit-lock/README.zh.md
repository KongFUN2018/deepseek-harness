# @deepseek-ai/dsh-edit-lock

[English](README.md) | 中文

任务流编辑锁（`ctx.editLock`）：产物版本上的持久 first-write-wins 租约。取得租约冻结消费该版本的 phase run 调度；释放或超时清除冻结。超时只解除租约，绝不提交本地缓冲，且租约从不豁免版本链 base 校验。

## 配置

服务挂载于存储栈、工作台日志、产物服务与任务 provider 之后。唯一可调项是过期清扫周期。

```yaml
- id: deliverable-local
  name: '@deepseek-ai/dsh-deliverable-local'
- id: task-local
  name: '@deepseek-ai/dsh-task-local'
- id: edit-lock
  name: '@deepseek-ai/dsh-edit-lock'
  config:
    sweepIntervalMs: 5000
```

`sweepIntervalMs`（默认 `5000`，最小 `50`）设定清扫过期租约的频率；每次读取与取得路径也会惰性清扫。

## 服务契约

- `acquire(deliverableId, targetVersionId, owner, ttlMs, taskId?)` — 取得某版本的租约（版本须存在且属于该 deliverable）。首个写入获胜：已持有的 deliverable 以 `lock-held` 拒绝并携带当前持有人与到期时间。同任务、同 owner、同目标重取返回已存租约。可选 `taskId` 把租约归属到任务，供取消时释放。取得时经 `freezePhaseScheduling` 冻结消费方 phase run。
- `renew(leaseId, expectedRevision, ttlMs)` — 推进 `renewedAt`/`expiresAt`；修订过时或租约已失效（已过期）以 `invalid-transition` 拒绝。
- `release(leaseId, expectedRevision, actor)` — 显式释放并清除消费方冻结；修订过时以 `invalid-transition` 拒绝，释放终态租约原样返回。
- `listActive(taskId?)` — 活跃（未过期）租约，可选按任务过滤。

进入 `cancelling`/`cancelled` 的任务，其租约经 `task/updated` 监听释放。

### 持久事实

每次租约迁移先追加 journal 事实：`edit-lock/acquired`、`edit-lock/renewed`、`edit-lock/released`、`edit-lock/expired`。任务外取得的租约使用 `edit-lock` 哨兵任务 id。

## 不变式

`./invariant` 伴生在权威变更流上检查租约写入：一个 deliverable 最多持有一个活跃租约，且每个被租版本必须存在于 deliverable-local 的 versions 表。

## Model Experience

### 任务板背后的编辑锁

#### 模型看到什么

不直接看到任何东西。取得时经 `freezePhaseScheduling` 冻结消费方 phase run、释放时经 `clearPhaseScheduling` 清除，因此影响以未来 phase 提示词形式抵达模型，而非本包产出的文本。锁指示与倒计时 UI 属 M6。

#### Token 影响

无。租约走存储域，不经模型请求路径。

#### KV Cache 影响

无。本包不增删或重排任何提示词前缀。

## Known Limitations and Deferred Work

- **无编辑锁 UI。** 锁指示与倒计时界面随 M6 前端落地；M2 仅后端。
- **无跨主机协调。** first-write-wins 租约在单主机进程内串行化写入；多主机编辑超出范围。
