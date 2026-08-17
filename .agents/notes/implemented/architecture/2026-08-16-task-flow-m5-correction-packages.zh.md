# Agent Note：task-flow M5 —— rewind、budget、review-policy 三个纠偏包

Status: implemented

[English](2026-08-16-task-flow-m5-correction-packages.md) | 中文

## Problem

M5 补上工作台缺失的纠平面：放弃产出已失效的分支、限制任务可消耗的资源、引入信任档与修复熔断。冻结设计（模块内本地文档；下述契约摘要是仓库内权威）在早期里程碑预留的七个 seam 上固定三个包——rewind、budget、review-policy：任务级 `awaitDecision`/`resumeFromDecision` 命令、`registerCompletionGuard` 贡献者注册、phase supersede、`createTaskRun` 父子链、`gate-check/recorded` 事件、`RecipePayload.breakers` 显式校验、gate 对 `reviewPolicy` 的可选读。每个持久化写入先追加 journal 事实；每个决策以 attention item 呈现，不扩大 approval 语义。

## Decision

`packages/task-flow/rewind` 拥有分支放弃。`requestRewind` 计算 `deliverables.invalidateDownstream(roots)`，把持久化快照映射为预览（含从该任务 `clarification/injected` journal 事实回放出的可复用澄清 id——journal 是读模型，不做活服务调用），并开一个 `decisionKind: 'rewind'` 的 `c-decision` item。只有已解决的 `confirm-rewind` outcome 才应用：`applyRewind` 以 `parentRunId` 链接被退役分支创建 successor run，逐个 supersede 其全部 phase run，追加 `rewind/applied`；被拒绝的 outcome 记 `rewind/declined`，任务面不动。`costHint` 保持字面 `'uncalibrated'`——PRD 禁止在校准前放占位数字。

`packages/task-flow/budget` 拥有台账：`provisionBudget`/`appendBudget`/`recordUsage` 覆盖三个维度（tokens、durationMs、reruns）。任一维度越过 80% 开一个 `b-confirm` 预警 item（每维度一次）；超限开 `c-decision` item，把任务停进 `awaiting-decision`，由 `applyBudgetDecision` 解决——追加额度、按当前上限继续、或回退（委托 rewind 流程）。线上校验器接受 `null`（remote 边界），对非对象与非正维度显式失败。

`packages/task-flow/review-policy` 拥有信任：strict/balanced/trusted 三档存 KV 表，gate 的读口（`defersBatchConfirm`——仅 trusted 档），两个完成守卫（未签 B item 与悬置 rewind 决策一票否决完成），以及修复熔断——连续 A 修复失败达到 recipe 显式 `breakers` 上限即 `breaker-tripped`，把任务停在五选项（continue-repair/patch/rewind/pause/cancel）`c-decision` 恢复 item 之后，并记录应用的决策。守卫否决是包在已解决 promise 里的同步 throw，否决即拒绝完成命令，不需要运行时永不需要的 `await`。

gate 的可选读保持可选：`ctx.get('reviewPolicy')` 配类型注解局部变量（`ReviewPolicyService | undefined`）——模块合并使 cast 多余，注解让依赖保持 type-only。

## Consequences

- decisionKind 词表封闭：`'rewind' | 'budget-warning' | 'budget-exceeded' | 'breaker-tripped'`；`rewind/`、`budget/`、`review-policy/` 三个前缀共十一条事实回放全部纠偏动作。
- 三包零配置；装配在其依赖之后挂载。版本跟随根包，`files` 只列发布条目。
- 有意不冻结：balanced 档差异、用量自动采集、`reversibleUntil`、`costHint` 取值、M5 UI 文案——各自停留在字面占位，直到某个里程碑认领。

## Alternatives considered

- rewind 起初从活的 clarification 服务（`ctx.get('clarifications')`）读可复用澄清；设计把该读标为可选，而跨包边界的类型化可选服务调用会为一个预览字段引入运行时依赖。改从服务本就注入的 journal 回放 `clarification/injected` 事实，包的读模型保持只追加，依赖表最小。
- budget 校验器起初收已解析的 `BudgetLimits` 类型又检查 `=== null`；类型感知 lint 判该分支不可达。把参数放宽为 `BudgetLimits | null`，在验证所在处声明线上契约，`null` 拒绝测试无需 cast 即有意义。
- 完成守卫起初写成 `async` 回调却没有 await；lint 的 `require-await` 抓住死异步。返回已解决 promise（或在其前 throw）保住守卫注册的 `Promise<void>` 契约，不需要仪式性 `await`。

## Verification

- 单元套件：rewind 5、budget 10、review-policy 8，加上覆盖 task seam 的 `m5-seams.spec.ts`——全绿且逐文件 100% 覆盖（仓库的未覆盖位置 reporter 对这三包无输出）。
- `pnpm run lint`（oxlint 类型感知）、`pnpm run hygiene`（knip、publint、constraints、NodeNext）、`pnpm run doc-sync`（28 门含 973 对 translation pairing）、`pnpm run typecheck` 全部通过。
