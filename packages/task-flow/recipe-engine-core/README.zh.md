# @deepseek-ai/dsh-recipe-engine-core

[English](README.md) | 中文

Task-flow recipe 引擎（`ctx.recipeEngine`）：调度固定 recipe 的阶段运行，并经由贡献的 phase executor 驱动“提交—门检—通过”链。引擎持有调度、提交、门检、暂停/取消静默与重启恢复；executor 只执行单个阶段的工作并回报 `PhaseOutcome`。每个提交 id 都是确定性的（`sub-<phaseRunId>-a<attempt>`），因此 executor 重试或重启要么重放已受理的提交，要么以下一次尝试重新执行——绝不产生重复。

## 配置

引擎是宿主内部服务（普通 `Service`，不经 `@Remote` 驱动），挂载在存储栈、recipe 注册表、workbench journal、最小产物服务、持久任务 provider 以及 agent、goal 服务之后，自身无需配置。

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
- id: agent
  name: '@deepseek-ai/dsh-agent'
- id: goal
  name: '@deepseek-ai/dsh-goal'
- id: recipe-engine-core
  name: '@deepseek-ai/dsh-recipe-engine-core'
```

## 服务契约

### Executor 接缝

`registerExecutor(executor)` 贡献唯一的 phase executor 槽位：第二次注册抛错，返回的清理函数释放槽位，且每次注册都会重跑恢复——因缺少 executor 而停滞的任务随即恢复调度。引擎以任务/运行/阶段 id、经哈希校验的固定 `RecipeRevision`、阶段规格、门检项、尝试序号，以及结果将记录于其下的确定性提交 id 调用 `executor.execute(assignment)`；executor 通过产物服务保存每个声明的输出，并把 `sourceSubmissionId` 追溯到该 id。

### 调度循环

`task/updated` 监听器触发按任务串行的循环。每轮重新读取任务：终态任务释放其阶段会话；`pausing`/`cancelling` 等待在途执行，随后在取消活跃阶段运行后落定；`running` 任务解析其固定 recipe（哈希不匹配将投毒）、检查 recipe 形态（未声明的阶段或非 A 门检将投毒），并推进当前运行——创建任务运行、收敛到唯一活跃阶段运行（崩溃窗口产生的孤儿被取代），再依次走过 `startPhaseRun` → executor → `recordSubmission` → 门检 → `markPhasePassed`，最后一个阶段通过即完成任务。未注册 executor 时阶段停留在 `running`，每次唤醒以 warn 日志重试。

### 暂停、取消与静默

暂停与取消是在原子动作之间观察的屏障。executor 在 `requestPause` 之后回报时仍会记录提交——任务 provider 接受来自 `pausing` 任务的提交——循环随后落定暂停；处于取消中或已终态的任务丢弃在途结果，由循环取消该阶段运行。`resume` 重新进入循环；`submitted` 阶段补齐缺失的门检而不是重新执行。

### 阶段会话与恢复

每次尝试打开一个阶段会话：`agents.create` 以 `sessionId` `phase-<phaseRunId>-a<attempt>` 建立代理，`goals.create` 携带 `phase.goal`，阶段落定时释放。未注册代理工厂时引擎退化为无钥匙的合成会话 id（`phase-<phaseRunId>`），无钥匙部署仍可调度。启动时恢复先校验每个非终态任务的 journal 头与其投影修订——不匹配将投毒——再重新触发调度：`running` 阶段以下一次尝试重新执行，`submitted` 阶段恢复门检，已通过的阶段绝不重跑。

## 不变式

`./invariant` 伴生件以包名注册，在权威变更流上检查绑定完整性：`recipe_engine` 域 `phase_sessions` 的写入若以自身 `phaseRunId` 以外的键存储、未执行（attempt 0）的绑定声称拥有会话或提交、或提交缺少其尝试会话，即失败。

## 模型体验

### 工作台背后的 task-flow 调度器

#### 模型可见内容

仅阶段会话携带的内容：引擎通过 `goals.create`（固定 recipe 的 `phase.goal`）向阶段会话代理发布阶段目标，executor 从 `PhaseAssignment`（阶段规格、固定修订、门检项）渲染提示。调度决策、提交与门检结果从不直接到达模型。

#### Token 影响

本包无影响。引擎运行在模型请求路径之外；其影响的唯一 token 载荷——阶段目标字符串——归 recipe 所有、由 executor 渲染。

#### KV 缓存影响

无。引擎不改写任何提示；本包不增删或重排任何前缀。

## 已知局限与遗留工作

- **单一 executor 槽位。** `registerExecutor` 对所有阶段只持有一个 executor；按阶段种类路由到不同 executor 随 M2 executor 注册表落地。
- **无钥匙会话不含会话日志。** 未注册代理工厂时引擎退化为合成会话 id，阶段溯源完全依赖 executor 回报的 `sourceSeqRange`。
- **投毒任务保持投毒。** recipe 不支持或恢复不匹配的投毒记录错误并停止调度；M1 没有解除投毒的命令。
- **无跨宿主调度。** 按任务链、在途映射与会话句柄都是宿主本地的；多宿主协调超出 M1 范围。
