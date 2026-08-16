# @deepseek-ai/dsh-gate

[English](README.md) | 中文

复杂 Gate 服务（`ctx.gate`）：识别 `gate-running` 阶段运行上的 B/C 类 gate check，通过 `ctx.attention` 为每个 check 创建一个 `AttentionItem`（`kind='b-confirm'`/`'c-decision'`、`decisionKind='gate'`、`checkId`、`options=check.humanAction`），并把该运行推进到 `awaiting-decision`，等待 M4 attention 服务收集决策。A 类 check 的裁决仍由引擎给出，引擎为每条 A 裁决记录 `uncoveredScope` + `evidenceRefs`；B/C 类 check 不产生机器裁决，因此本服务从不写入 passed/failed 结果。

## 配置

该服务无可调参数。它声明 `tasks`、`recipes` 与 `attention`，监听 `phase-run/updated`，并在它们之后挂载：

```yaml
- id: task-local
  name: '@deepseek-ai/dsh-task-local'
- id: attention
  name: '@deepseek-ai/dsh-attention'
- id: gate
  name: '@deepseek-ai/dsh-gate'
```

## 服务契约

该服务不暴露 remote 方法。初始化时它订阅 `phase-run/updated`；对每条以 `gate-running` 上报的运行，它读取任务所固定的 recipe，当该阶段声明了 B/C 类 check 时，为每个 check 创建一个 attention item，并以该运行的 revision 写入 `markPhaseAwaitingDecision`。建项与转换同步发起，使转换先于引擎重验进入命令队列、运行在引擎空转前离开 `gate-running`。纯 A 类运行的 check 原样放行，交由引擎结算。两处写入在效果上幂等：并发或已被接管的决策留给其所有者处理。

## Invariant

`./invariant` 伴随件没有运行时 invariant：gate 服务不写自有持久化域——它创建的 attention item 与阶段运行转换分别由 attention 包与 task 包的 invariant 检查。

## Model Experience

### 阶段链之后的复杂 Gate 停靠步骤

#### 模型看到什么

本包不直接呈现任何内容。把运行停靠在 `awaiting-decision` 会暂停引擎调度；决策轮次及其提示词属于 M4 attention 服务。

#### Token 影响

无。该服务只写状态转换，从不输出文本。

#### KV Cache 影响

无。本包不新增、移除或重排任何提示词前缀。

## Known Limitations and Deferred Work

- **决策收集由 attention 拥有。** 本包只创建 B/C item 并停靠运行；`resolveDecision`/`confirmBatch` 与 resume 轮次属于 attention 服务。
- **A 裁决上的 `uncoveredScope` 由引擎拥有。** B/C 类 check 不记录 `GateCheckResult`；A 类 check 的裁决及其 `uncoveredScope` + `evidenceRefs` 由引擎的 `recordGateCheck` 写入。
