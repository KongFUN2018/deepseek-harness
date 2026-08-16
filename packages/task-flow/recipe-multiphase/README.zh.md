# @deepseek-ai/dsh-recipe-multiphase

[English](README.md) | 中文

按阶段种类的 phase executor 注册表（`ctx.recipeMultiphase`）：按 `RecipePhaseSpec.kind` 把多阶段 Recipe 的各阶段路由到 executor，并暴露一个聚合 `PhaseExecutor` 注册进 recipe-engine-core 的单 executor 槽。引擎闭包保持不变——路由在此处，不在引擎里。

## 配置

服务在 recipe engine 之后装配。它没有可调项；init 时把聚合 executor 注册进 `ctx.recipeEngine`，因此 bundle 只需列出引擎、本包以及注册到本包的 executor。

```yaml
- id: recipe-engine-core
  name: '@deepseek-ai/dsh-recipe-engine-core'
- id: recipe-multiphase
  name: '@deepseek-ai/dsh-recipe-multiphase'
```

## 服务契约

- `registerExecutor(phaseKind, executor)` — 为某阶段种类注册一个 `PhaseExecutor`；kind 是与 `RecipePhaseSpec.kind` 匹配的非空字符串。重复 kind 以 `duplicate-kind` 拒绝，空白 kind 以 `invalid-kind` 拒绝。返回的 disposer 移除注册。
- `aggregatingExecutor()` — 交给引擎的单一 `PhaseExecutor`；它把每个 assignment 分派到为该 assignment 阶段种类注册的 executor，未注册时以 `no-executor` 失败。
- `listKinds()` — 按注册顺序返回已注册的种类，供诊断。

每个阶段的 `kind` 来自 Recipe payload；注册表从不改变阶段顺序——那是引擎的职责。

## 不变量

`./invariant` 伴生无运行时不变量：注册表只持有内存中的按种类 executor 引用，无可检查的持久事件或数据关系。

## 模型体验

### 阶段链背后的 executor 分派

#### 模型看到什么

本包不直接产生任何内容。路由决定哪个 executor 执行每个 `阶段`，因此其影响通过那些 executor 产生的阶段提示与提交到达模型，而非来自注册表的文本。

#### Token 影响

无。注册表持有 executor 引用，从不输出文本。

#### KV Cache 影响

无。本包不添加、移除或重排任何 prompt 前缀。

## 已知限制与延后工作

- **内存注册表。** executor 注册是进程本地的，重启后需重新注册；它们不是持久事实。
- **未注册的 kind 在执行时失败。** 声明了无人注册 kind 的 Recipe 在该阶段被调度时以 `no-executor` 失败，而非在 Recipe 注册时。
- **B/C Gate 检查不在本包范围。** 复杂 Gate 分类与 `awaiting-decision` 状态由 M3 的 `gate` 包交付。