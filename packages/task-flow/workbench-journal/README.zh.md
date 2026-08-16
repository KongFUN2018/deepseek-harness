# @deepseek-ai/dsh-workbench-journal

[English](README.md) | 中文

任务流只追加工作台日志（`ctx.workbenchJournal`）：基于单个 storageDomain 单元的持久事实源。`append` 分配无空洞单调 `journalSeq`，是每次任务流实体变更的提交点；`checkpoint` 与 `replay` 是权威的恢复与客户端重新同步路径。实体投影从日志重建——Cordis 事件始终只是可丢弃的唤醒信号。

## 配置

服务以 `inject = ['storageDomain']` 挂载，自身无需配置：后端路由属于它所打开的 storage-domain 插件。

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
```

## 服务契约

### `append(fact)`

追加一条事实。日志负责分配信封字段（`journalSeq`、`eventId`、`occurredAt`、`schemaVersion`），并在并发下保持序列无空洞。相同 `idempotencyKey` 且调用方字段完全一致的重放返回已存事实；字段不一致则以 `idempotency-conflict` 失败。非法调用方字段以 `invalid-fact` 失败。

### `checkpoint()`

返回 `{ journalSeq }`，即已分配的最大序列号（空日志为 0）。恢复流程保存该位置并重放增量。

### `replay(afterSeq)`

按日志顺序返回所有 `journalSeq > afterSeq` 的事实；`afterSeq: 0` 重放整个日志。中间缺失任何一条事实会以 `invalid-fact` 失败，因为序列必须无空洞。非安全整数或负数位置以 `invalid-argument` 失败。

## 事实信封

以下冻结的顶层字段适用于每条事实；各类 `payload` 的 schema 归各追加实体包所有。

| 字段 | 含义 |
| --- | --- |
| `journalSeq` | 日志分配的单调无空洞位置 |
| `eventId` | 日志分配的事实标识 |
| `taskId` | 事实所属任务 |
| `kind` | 事实种类，由追加方包定义 |
| `occurredAt` | 追加时的毫秒时间戳 |
| `actor` | 引发事实的执行者 |
| `causationId?` | 引发本条事实的 eventId |
| `correlationId?` | 关联相关事实的关联号 |
| `idempotencyKey` | 幂等键，必填非空 |
| `entityRevision` | 实体提交后版本号，必填正整数 |
| `payload` | 种类自有 JSON 值，原样存储 |
| `schemaVersion` | 信封 schema 版本（M1 为 1） |

## 不变量

`./invariant` 伴随组件以包名注册，并在权威变更流上执行只追加所有权：日志域上任何非 `entries` 表 `put` 的 `domain/changed`（删除或外来表）都会使该注册失败。

## 模型体验

### 任务流恢复背后的持久事实源

#### 模型可见内容

无。`ctx.workbenchJournal` 服务于任务引擎与恢复；没有任何工具、提示词段落或会话事件把日志事实暴露给模型请求。

#### Token 影响

无。事实与 checkpoint 走 RPC 载体或存储域，不在模型请求路径上。

#### KV 缓存影响

无。日志事实从不进入提示词，因此本包不会增加、移除或重排任何前缀。

## 已知限制与待办

- **提交点模型，而非两阶段事务。** `append` 是单次持久写；同时更新实体投影的任务流变更先写投影、最后追加日志，因此日志是提交点，恢复从 `replay` 重建投影。共享单域写链的多记录写单元属于后续 storage-domain 阶段。
- **线性幂等扫描。** `append` 通过扫描已存条目查找既有 `idempotencyKey`；M1 任务量可接受，索引表延后。
- **无界 replay。** `replay` 返回完整尾部；有界窗口是部署选择，延后到面向客户端的任务看板。
- **无日志事件。** 日志按设计不发出任何 Cordis 事件；实体包在各自提交后发出 `task/*` 唤醒事件族。