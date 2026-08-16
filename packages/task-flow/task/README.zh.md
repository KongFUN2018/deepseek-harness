# @deepseek-ai/dsh-task

[English](README.md) | 中文

任务流任务 Service Definition（`ctx.tasks`）：钉定配方的任务创建、受守卫的任务与阶段运行状态迁移，以及 PhaseSubmission 受理链。Provider 通过抽象存储钩子持久化；每条变更命令依次执行一次加载、一次纯迁移、一次 compare-and-set 保存和一次受控事件扇出。

## 服务契约

`ctx.tasks` 是绑定 `tasks` wire 命名空间的抽象 `TypertRemoteService`；provider 子类在其事务边界内实现受保护的存储钩子。变更命令接受 `TaskMutationContext`（actor、reason、`expectedRevision`、幂等键），存储版本已移动时以 `stale-revision` 失败。

任务命令：`createTask`（钉定配方最新已注册修订；幂等键重放返回原任务）、`startTask`、`requestPause`/`settlePause`、`resume`、`requestCancel`/`settleCancel`、`failTask`、`completeTask`（守卫：当前 run 的每个阶段运行都已通过）、`createTaskRun`（开新 run 并置为当前）。阶段运行命令：`createPhaseRun`、`startPhaseRun`、`recordSubmission`、`startGate`、`recordGateCheck`、`markPhasePassed`、`markPhaseFailed`、`cancelPhaseRun`。查询：`getTask`、`listTasks`、`getPhaseRun`、`getSubmission`、`listGateResults`。

`recordSubmission` 受理一条不可变 `PhaseSubmission` 及调用方计算的 `SubmissionEnvironmentFacts`（源日志持久化、输入时效、输出有效性）。受理即纯函数 `acceptSubmission` 校验：身份接线（task/run/phase-run/phase-id）、钉定配方身份与注册表哈希、环境事实、幂等键重放；拒绝时抛出 `submission-rejected` 并列出全部问题。受理后的提交将其阶段运行迁至 `submitted` 并成为其 `activeSubmissionId`。

已提交的投影发出 `task/updated`、`task-run/updated`、`phase-run/updated`（已在 `@deepseek-ai/dsh-api-remotes` 白名单）；监听器失败被受控记录。

## 扩展点

- `SubmissionEnvironmentFacts` 由调用方（引擎）计算：会话日志水位与交付物时效校验留在本包之外，使受理链保持纯函数（`src/submission.ts`）。
- 纯迁移表在 `src/state.ts`；provider 持久化它们，从不放宽它们。M1 命令不会进入的状态仍保留在词汇表中。
- 持久化 provider（`task-local`，M1）在 journal 之后实现存储钩子；Remote 表面不变。

## Model Experience

### 任务投影与受守卫命令

#### 模型看到什么

无。`ctx.tasks` 服务于任务引擎与工作台 UI；没有工具、提示词段或会话事件把任务投影暴露给模型请求。

#### Token 影响

无。命令与投影走 RPC 载体，位于模型请求路径之外。

#### KV Cache 影响

无。任务记录从不进入提示词，本包不会增加、删除或重排任何前缀。

## Known Limitations and Deferred Work

- 无随包 provider：在 `task-local` 落地持久 journal 存储之前，抽象存储钩子由测试替身与 e2e 驱动实现。
- 门检结果按记录原样存储；对照钉定配方的门检判定（通过/失败门决策）属于引擎，不属于本包。
- `schedulingFrozen` 以及设置它的暂停/取消静默编排已声明在 `PhaseRunRecord` 上，但尚无 M1 命令写入；由引擎的 pause-cancel 路径拥有。
