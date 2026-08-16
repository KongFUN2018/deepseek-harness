# @deepseek-ai/dsh-deliverable-minimal

[English](README.md) | 中文

任务流最小产物版本（`ctx.deliverables`）：基于单个 storageDomain 单元的每产物不可变版本链。`saveVersion` 拒绝针对已非当前 base 的写入；`listCurrentInputs` 只放行某阶段运行的 current 分支产物；`invalidateDownstream` 把根版本及其链上所有更新版本标记 stale（完整影响闭包与 ImpactSnapshot 属 M2）。

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
- id: deliverable-minimal
  name: '@deepseek-ai/dsh-deliverable-minimal'
```

## 服务契约

### `saveVersion(deliverableId, expectedBaseVersion, sourceSubmissionId)`

创建一个不可变版本。`expectedBaseVersion` 命名调用方所基于的版本（根版本为 `null`）；base 不再是该产物的最新版本、或状态不是 `current` 时以 `stale-write` 拒绝。返回的版本携带单调 `versionNumber`、链链接 `baseVersionId`、可选 `sourceSubmissionId`、状态 `current` 与 `entityRevision` 1。并发保存串行化，每个 base 恰好一个胜出。

### `listCurrentInputs(phaseRunId)`

按注册顺序返回某阶段运行已注册输入中状态为 `current` 的版本。stale、invalid、superseded、cancelled 版本被排除。注册本身由任务写链在受理 submission 时通过宿主侧 `recordPhaseInputs` seam 写入。

### `invalidateDownstream(rootVersionIds[])`

把根版本及其链上所有更新版本标记 stale，并返回新发生迁移的 id。已 stale 的根版本跳过；未知根以 `not-found` 失败。完整传递影响闭包与 ImpactSnapshot 属 M2。

### 宿主侧 seam

`recordPhaseInputs(phaseRunId, versionIds)` 注册或替换阶段运行的输入（任务写链在此记录 submission 的输入引用），`getVersion(versionId)` 为输出存在与来源匹配检查读取单个版本。二者均非 Remote：task-local provider 与引擎同属宿主进程，而 M1 客户端命名空间只冻结上述三个 Remote 方法。

## 不变量

`./invariant` 伴随组件以包名注册，并在权威变更流上检查输入引用完整性：`phase_inputs` 注册引用了未存储的版本即失败。

## 模型体验

### task-flow 受理背后的版本链

#### 模型可见内容

无。`ctx.deliverables` 服务于任务引擎与工作台 UI；没有任何工具、提示词段落或会话事件把产物版本暴露给模型请求。

#### Token 影响

无。版本走 RPC 载体或存储域，不在模型请求路径上。

#### KV 缓存影响

无。产物版本从不进入提示词，因此本包不会增加、移除或重排任何前缀。

## 已知限制与待办

- **`saveVersion` 无幂等键。** 冻结的 M1 签名没有；针对已移动 base 的重试以 `stale-write` 拒绝，调用方重读后重试。幂等版本创建随 M2 deliverable-local provider 落地。
- **线性最新版本查找。** `latestVersionOf` 扫描版本表；按产物的索引延后到 M2。
- **仅链内下游。** `invalidateDownstream` 标记同一产物链；跨产物 `dependsOn` 边、传递闭包与 ImpactSnapshot 属 M2。
- **无日志事实。** 产物版本写是可重建投影；任务写链拥有日志提交点，产物事实随 M2 闭包落地。
