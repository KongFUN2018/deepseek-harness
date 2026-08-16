# @deepseek-ai/dsh-task-local

[English](README.md) | 中文

Task-flow 持久任务 provider（`ctx.tasks`）：在单个 storageDomain 单元（`task_local` 域，五张表）上实现 `TaskHandle` 存储钩子。每次投影写入先追加 journal 事实——追加即提交点——checkpoint/replay 因此能重建全部投影；submission 受理通过注入最小产物服务，在任务写链内校验产物引用。

## 配置

该 provider 挂载在存储栈、recipe 注册表、workbench journal 与最小产物服务之后，自身无需配置。

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
- id: recipe
  name: '@deepseek-ai/dsh-recipe'
- id: workbench-journal
  name: '@deepseek-ai/dsh-workbench-journal'
- id: deliverable-minimal
  name: '@deepseek-ai/dsh-deliverable-minimal'
- id: task-local
  name: '@deepseek-ai/dsh-task-local'
```

## 服务契约

Remote 命令面继承自 task Service Definition；本 provider 不新增方法。它覆写两个受保护扩展点：

- `resolveSubmissionEnvironment` 从产物服务推导 `inputsCurrent`（每个被引用的输入版本存在、属于所指产物且为 `current`）与 `outputsValid`（每个被引用的输出版本存在且以本次 submission 为 `sourceSubmissionId`），忽略调用方声明；推导失败的问题会并入拒绝理由。
- `onSubmissionAccepted` 将 submission 的输入版本注册为该 phase run 的 phase inputs，使 `listCurrentInputs` 反映受理快照，下游失效可以将其标记为过时。

### 写入路径

每个变更在基类的串行写链内执行：加载、迁移、追加 journal 事实（`taskFactKey(kind, entityId, entityRevision)`——每次投影写入确定性生成）、再落投影。修订号不等于存量修订号加一的 put 以 `stale-revision` 拒绝。Submission 受理接纳 `running` 与 `pausing` 任务——引擎 executor 在 `requestPause` 之后回报时仍会记录其提交——而 `cancelling` 与已落定任务拒绝。重启从同一介质恢复投影与 journal 头部。

## 不变量

`./invariant` 伴随件以包名注册，在权威变更流上校验投影-journal 一致性：`task_local` 投影 put（以及 gate-result 列表每个位置）缺少匹配的 journal 事实即失败。

## 模型体验

### 工作台背后的持久任务 provider

#### 模型看到什么

没有直接可见内容。该 provider 服务于引擎与任务看板；任务状态仅经引擎由 `resolveSubmissionEnvironment` 判定结果构建的 phase 提示到达模型，本包不塑造该提示。

#### Token 影响

无。投影与 journal 事实在存储域上流转，不进入模型请求路径。

#### KV 缓存影响

无。任务投影不进入提示，本包不会增加、移除或重排任何前缀。

## 已知限制与延后工作

- **单介质投影规模。** `loadTaskByIdempotencyKey` 与 `loadSubmissionByIdempotencyKey` 线性扫描各自表；按键索引随 M2 存储 provider 延后。
- **Gate 结果不带调用方来源。** `recordGateCheck` 由引擎拥有，从 submission 与 check id 加记录时间戳推导来源；调用方提供的 actor 随 M2 gate 写路径落地。
- **无跨主机复制。** 写链在单主机进程内串行命令；多主机协调不在 M1 范围内。
