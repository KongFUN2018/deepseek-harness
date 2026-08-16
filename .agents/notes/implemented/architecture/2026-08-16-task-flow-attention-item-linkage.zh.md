# Agent Note：Gate/clarification — attention item 联动与 gate-running 微任务饿死挂起

Status: implemented

[English](2026-08-16-task-flow-attention-item-linkage.md) | 中文

## 问题

M4 把 attention 收件箱接入两个复杂决策生产者。gate 必须在把运行停靠到 `awaiting-decision` 之前，为每个 B/C check 创建一个 `AttentionItem`；clarification 必须为每个请求创建一个 `kind='clarification'` item，并在全部必答问题回答后关闭它。gate 的首版实现逐个 `await createItem` 之后才 `markPhaseAwaitingDecision`，其真实 Loader e2e 在 Windows 上挂起：进程在 loader-smoke 超时内不退出。

挂起不是文件系统竞态。插桩显示 `writeAtomic` 的 `open`/`rename` 永不 settle，但隔离的并发写复现能跑完，全局写串行锁只把卡点从 `rename` 移到 `open`，`UV_THREADPOOL_SIZE=16` 也无效。根因是微任务饿死：逐个 await 建项把 `markPhaseAwaitingDecision` 的写入延迟到 task 命令队列中引擎重验 `recordGateCheck` 之后。重验返回后，引擎重读仍处于 `gate-running` 的运行并重入 `runGate`，而对已记录的 A check，`runGate` 只 await 已 resolve 的 Promise——纯微任务空转，永不让出 poll 阶段，于是 json 后端的文件系统回调永不执行、停靠的运行永不推进。

## 决策

`packages/task-flow/gate` 改为同步发起全部命令而非先 await 建项。对带 B/C check 的 `gate-running` 运行，它先 map 全部 `ctx.attention.createItem`（每个 check 一个，`kind='b-confirm'`/`'c-decision'`、`decisionKind='gate'`、`checkId`、`options=check.humanAction`、`itemId=gate:<phaseRunId>:<checkId>`），再发起 `ctx.tasks.markPhaseAwaitingDecision`，用 `Promise.all` 一起 await。建项仍先发起（维持冻结的设计顺序），但推进命令在同一同步回合进入 task 命令队列，落在引擎 `recordGateCheck` 之前，运行在引擎空转前离开 `gate-running`。

`packages/task-flow/clarification` 在 `createRequestNow`（请求自身的写链）里建关联 item，`itemId=clarification:<requestId>`、`phaseRunId`、`options=['satisfied']`——系统自动决项，非用户选项。`injectIfComplete` 在 `resumePhaseFromAwaiting` 之前经 `resolveDecision` 以 `optionId='satisfied'` resolve 该 item。两个服务都新增 `attention` 注入；两个 cordis.yml fixture 都在它们之前挂载 `attention`。

## 验证

- gate：4 个单元测试（现断言每个 B/C check 一个 open item，且 `itemId`/`kind`/`decisionKind`/`checkId`/`options` 符合预期）+ 1 个真实 Loader e2e（停靠 B check 运行并证明 item 存在）。
- clarification：22 个单元测试 + 6 个 invariant 测试（注入测试断言 item 为 `resolved`/`outcome='satisfied'`）+ 1 个真实 Loader e2e（经投影 `itemState`/`itemOutcome` 断言同样结果）。
- 全量 task-flow e2e 12/12；tsc/lint/knip/invariants/limitations/translation-pairing/cordis-config 全绿。

## 备选方案

- **storage-json 全局写串行** 对 **修正调用方顺序**：进程级写尾只把卡点从 `rename` 移到 `open`——饿死的是事件循环而非写竞态——且为调用方自身的问题串行化无关 unit。
- **改为先 mark 后建项** 对 **同步发起**：先 mark 能满足入队约束，但颠倒冻结的 `createItem → markPhaseAwaitingDecision` 顺序，并留下「运行已停靠但 item 尚未出现」的窗口。
- **让引擎重验循环让出** 对 **保持引擎闭包不动**：给引擎已记录的重验加 IO await 会掩盖顺序 bug，并为调用方竞态扩宽冻结的 M1 闭包。

## 后果

- gate 的 `maybeAwaitDecision` 保留 `try/catch`，吞掉并发转换与未注册 recipe 错误；`humanAction` 为空的 B/C check 现以 attention `invalid-argument` 浮现并让运行保持停靠，仍足以被察觉而非静默确认。
- clarification item 只带内部唯一选项 `satisfied`；workbench-host 的 `title` 投影取 `item.checkId ?? item.decisionKind`（此处为 `clarification`）。
- 延期：任务取消时的 clarification item 失效归 M5 取消路径，该路径已归档 open attention item。
