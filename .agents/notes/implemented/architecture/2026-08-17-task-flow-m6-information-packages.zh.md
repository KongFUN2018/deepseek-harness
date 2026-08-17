# Agent Note: 任务流 M6 信息包（digest、metrics）与接线后的看板/详情面

Status: implemented

[English](2026-08-17-task-flow-m6-information-packages.md) | 中文

## Problem

M6（PRD FR-5/FR-12、§11）要求时间线、digest 与指标可从 journal 重建，线稿审查（优化①②④）点名了具体 UI 缺口：无 KPI 行、无卡片级阶段进度、Gate 裁决平铺、无 patch/rewind 入口。M5 栈已有投影所需的全部事实，但没有读取面。

## Decision

两个新 host 服务拥有读投影，两个既有 client 包吸收 UI，不新增 seat：

- `dsh-digest`（`ctx.digest`）：单个 `digest(taskId)` Remote，把 journal replay 与 task/phase/version 投影折叠为 run 分支（rewind 交接）、journal 序时间线、带尝试计数的阶段摘要、决策历史与产物状态。每次读取纯函数，无增量缓存。
- `dsh-metrics`（`ctx.metrics`）：`metrics()` 聚合 KPI 计数（运行中任务、open gate/ask 项、有效版本、7 日吞吐、按 kind 的 Gate 通过率）；`taskMetrics(taskId)` 出单任务度量（阶段耗时、rewind+重试提交计数、决策数、经可选 `ctx.get('budget')` 读的预算用量）。
- 看板新增 KPI 行（GATE/ASK 卡调新增 owner `openInbox()` 下钻收件箱 tab）与卡片级 recipe id + 阶段进度 `i/n`；详情新增 run 分支行、阶段时间线（superseded/stale 灰显）、按 `kind ?? 'A'` 分组的 Gate 裁决、patch/rewind 动词对（outline 对 primary）与状态提示行（不内嵌 rewind 调用）。

三个最小 seam 承载数据：`GateCheckResult.kind?: 'A'|'B'|'C'`（写入方传 GateCheckSpec 的类；读取方缺省 `'A'`，M6 前的裁决保持机器类）、`deliverables.listVersions()`（资产计数与 digest 产物状态）、`DrawerTasksOwnerProps.openInbox`（KPI 下钻）。

## Alternatives considered

- **结果内嵌 kind 对 spec 关联查询**：把检查类折进结果行只需一个可选字段；读取时关联 GateCheckSpec 需要逐裁决查 recipe，且对 recipe 已演进的 pinned revision 失效。内嵌胜出。
- **用 attention 项做卡片级 Gate 徽标**：`AttentionItemView` 不带 task id，卡片级待决计数需要改 M4 wire 面；推迟——KPI 行与详情分组已覆盖线稿意图。
- **详情内嵌 rewind 请求**：`requestRewind` 需要详情不拥有的影响根；动词对呈现入口，决策走收件箱 item，与 M5 单决策通道一致。

## Consequences

- `api-remotes` 挂载两个新 Remote namespace，所有 client 编译面获得 `ctx.remote.digest` / `ctx.remote.metrics`；remote 是加性的，未选用这些服务的包照常通过类型检查。
- M6 前的 Gate 裁决在各处渲染为机器类（A）；新写入方携带显式类，后续迁移可改为必填。
- KPI 计数每次刷新整读快照（不做增量折叠）；当前量级可接受，经 metrics README 的 known-limitations 条目跟踪。
- 验证：digest/metrics 套件（14 测试：纯派生折叠 + 内存栈上的服务读取）、看板 25 / 详情 24 套件绿（扩展后的 state 与 remote）、tsc host 与 client 聚合绿。
