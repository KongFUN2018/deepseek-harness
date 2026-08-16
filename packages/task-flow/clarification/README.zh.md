# @deepseek-ai/dsh-clarification

[English](README.md) | 中文

持久澄清服务（`ctx.clarifications`）：针对单个阶段运行（PhaseRun）的幂等问题/答案请求，每个请求关联一个 `kind='clarification'` attention item。所有必答问题都被回答后，服务把答案汇总作为 model-visible 用户消息写入阶段 session，记录持久化 session 事件 id，标记请求为 injected，resolve 关联的 attention item，追加 journal 事实，并把停在 `awaiting-input` 的阶段运行恢复到 `gate-running` 重新走 Gate。

## 配置

该服务无可调参数。它依赖存储域、工作台 journal、任务服务、会话存储与 attention 服务；装配 bundle 时依次列出它们与本包。

```yaml
- id: storage-domain
  name: '@deepseek-ai/dsh-storage-domain'
- id: workbench-journal
  name: '@deepseek-ai/dsh-workbench-journal'
- id: task-local
  name: '@deepseek-ai/dsh-task-local'
- id: session
  name: '@deepseek-ai/dsh-session'
- id: attention
  name: '@deepseek-ai/dsh-attention'
- id: clarification
  name: '@deepseek-ai/dsh-clarification'
```

## 服务契约

- `createRequest(phaseRunId, questions, actor, idempotencyKey)` — 为一个阶段运行创建一个请求；`questions` 是非空列表，每项为 `{ phaseId, required, order, text }`。服务分配请求与问题 id，并在同一写链中创建关联 attention item（`itemId='clarification:<requestId>'`、`options=['satisfied']`）。用相同 questions 重放同一调用方键返回已存请求；questions 不同则以 `conflict` 失败。
- `answerPartial(questionId, expectedRevision, answer, actor, idempotencyKey)` — 按问题当前 revision 记录一个答案。同 revision 同值重放返回已存答案；值不同或 `expectedRevision` 不匹配均以 `conflict` 失败。当该答案补齐所有必答问题时，服务注入汇总、以 `optionId='satisfied'` resolve 关联 attention item，并恢复阶段运行。
- `getRequest(requestId)` — 读取一个请求，未知时返回 `undefined`。
- `listOpen(phaseRunId)` — 返回一个阶段运行的开放请求，按创建顺序。

实体位于 `clarification` 域：`ClarificationRequest`（`requestId`、`phaseRunId`、`taskId`、`questionIds`、`injectedEventId?`、`state`：open/injected/closed、`revision`、`createdAt`）、`Question`（在问题输入基础上增加服务分配的 `questionId`/`requestId` 与 `revision`）、`Answer`（`questionId`、`actor`、`value`、`submittedAt`、`revision`）。

## 恢复

注入以 journal 事实 `clarification/injected` 为提交点，其幂等键按请求唯一。重启后按该事实重放而非依赖进程内 Promise：一个 open 请求若其 injected 事实已存在，则复用已记录的 `injectedEventId` 并恢复，不再追加第二条 session 消息；不存在该事实则走完整注入路径。

## 不变式

`./invariant` 伴生在 `domain/changed` 流上校验引用完整性：问题必须指向已存请求、答案必须指向已存问题、请求键条目必须指向已存请求。

## Model Experience

### 注入的澄清汇总

#### 模型看到什么

一条 `user/message` session 事件，内容是答案汇总行（`<问题>: <答案>`，按请求顺序，含必答与可选）。该消息仅在全部必答问题都已回答后追加到阶段 session。

#### Token 影响

每个完成的澄清请求新增一个用户轮次，规模约为问题与答案文本之和。

#### KV Cache 影响

注入消息只在阶段 session 日志末尾新增一条用户消息，早前的轮次不变。

## Known Limitations and Deferred Work

- **仅系统自动决项。** 关联的澄清 item 只带内部唯一选项 `satisfied`；用户回答问题、从不选择决策选项，item 在全部必答问题回答后自动 resolve。
- **仅顺序阶段链。** 澄清只恢复停住的阶段运行，不引入阶段 DAG 或并行调度。
- **注入汇总为单条用户消息。** 未建模逐问题粒度或对幂等部分答案之外的答案编辑。
