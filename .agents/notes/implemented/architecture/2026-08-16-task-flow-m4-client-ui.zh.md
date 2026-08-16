# Agent Note：M4 客户端面：基于 Remote 词汇的注意力收件箱与任务详情

Status: implemented

[English](2026-08-16-task-flow-m4-client-ui.md) | 中文

## 问题

M4 为工作台注意力通道新增两个浏览器面：`ui-attention-inbox` 呈现待决项并发起确认/决策动词，`ui-task-detail` 按需读取单任务投影。两者必须只消费冻结的客户端词汇——`ctx.remote.workbenchHost`、`ctx.remote.workbenchHostStream`、转发的 `workbench/attention-updated` 事件与 `ctx.remote.tasks`——而不 import attention/gate 领域包或读裸帧。

## 决策

- `ui-attention-inbox` 是一个无 React 控制器（`inbox.ts`）加一个 `sidebar.footer.action` 入口。控制器加载 `workbenchHost.listSnapshot()` 与 `workbenchHostStream.listIncremental(0)` 的 epoch/cursor，按修订门控折叠 `workbench/attention-updated`，在 `connection/reset` 时重放增量（epoch 变化或存在待决事件则强制快照重同步），并以每行的 CAS 修订发起 `confirmBatch`/`resolveDecision`。
- 未决命令结果——`conflict`、`stale`、`withdrawn`、`already-resolved`，或坏选项导致的 `invalid-argument`——从不被静默移除：其数量落入 `conflictCount`（错误码 `conflict:<n>`）并重新同步列表。这是出口判据「多标签页冲突可解释、无静默确认」的证明。
- wire `AttentionItemView` 不携带 `options`，因此 C 类决策是自由文本输入，由宿主按 `item.options` 校验；选项列表本身不渲染（记录为 README 限制）。
- `ui-task-detail` 是手动读取器：`getTask` 后读取当前运行的 `listPhaseRuns` 与每个活动提交的 `listGateResults`；无实时折叠、无跨会话列表（这些在 `ui-task-board` 中）。

## 验证

- 两个包都在每文件 100% 覆盖率门禁内：21 + 20 个收件箱 spec 与 7 + 17 个详情 spec（控制器 + 组件）覆盖每个折叠分支、每个命令结果、每个状态/类别标签，以及 inject-face 回调。
- `pnpm run build:lib:client`（tsc + tsdown）通过；两个包的 `vitest` 范围通过；oxlint、knip、cordis-config、package-invariants、readme-limitations、model-experience、translation-pairing、export-jsdoc 全绿。

## 备选方案

- **按 C 行渲染选项列表** 对比 **自由文本决策**：冻结的 wire 视图没有 `options` 字段，呈现选项需先拓宽 wire 再做客户端渲染；宿主仍按 `item.options` 校验自由文本，坏选项响亮失败而非静默。
- **冲突后的逐行乐观修补** 对比 **完整重同步**：journal 支撑的快照是唯一权威，重同步是最廉价的正确对账，绝无客户端修补偏离宿主投影的风险。

## 后果

- 两个包注册进 `tsconfig.client.json`、web-app bundle（`cordis.patch.yml` + `package.json`），以及 api-remotes 客户端面（`workbenchHostStream` 为增量读挂载）。
- 收件箱命令记录的 actor 是固定的 `workbench-inbox` 标记，直到客户端长出用户身份。
- 收件箱控制器复用了 [`client-ui-task-board-remote-folds`](2026-08-16-client-ui-task-board-remote-folds.md) 确立的 task-board 折叠模式（快照存储 + 版本门控折叠 + reset 重同步）；抽出共享折叠到小工具仍推迟到第三个消费者出现。
