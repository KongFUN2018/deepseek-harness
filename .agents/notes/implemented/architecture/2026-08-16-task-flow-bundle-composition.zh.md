# Agent Note：任务流 bundle 装配——Service Definition 行不进 Loader 列表

Status: implemented

[English](2026-08-16-task-flow-bundle-composition.md) | 中文

## Problem

M1 任务流栈首次整体 web replay 在 Loader apply 阶段以两处装配故障失败：`service "tasks" has been registered at <TaskHandle>`（双注册）与来自 `workbench-host/lib/typert.host.js` 的 `Cannot find package 'zod'`。两类故障对包级套件与 host 聚合 typecheck 都不可见；只有真实 Loader 组合能暴露。

## Decision

- Service Definition 包（抽象基类 + 契约，例：`packages/task-flow/task`）是编译期面，绝不是 Loader 插件行。`packages/bundle/base/cordis.patch.yml` 只列运行时 provider（`task-local`，不列 `task`）：cordis Loader 会实例化 constructor 导出，抽象 `TaskHandle` 行会先注册一次 `tasks` 服务键，真正的 provider 注册时即抛错。engine e2e fixture 早已如此（从不列 `task`）。
- Typert 生成物（`lib/typert.host.js`、`lib/typert.remote-client.js`）在运行时 import `zod`，因此携带它们的包把 `zod` 声明在 `dependencies`，不是 `peerDependencies`。`recipe`、`task`、`workbench-host` 已对齐早已声明的 `deliverable-minimal` 与 `task-local`。

## Verification

- `pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/cold-blank-session.e2e.ts` 修复后通过 Loader apply 启动。
- `pnpm run test:web`（replay）：修复后的装配启动 76 个 web 套件；本 Windows 主机的残余失败是既有平台问题（win32 禁用 tool-bash、Windows 路径分隔符破坏 seeded fixture、win32 终端检测），无一指向任务流行。
- `pnpm run knip` 通过：`recipe`、`task`、`workbench-host` 加 `ignoreDependencies: ["zod"]`（它们的 zod 依赖边仅存在于生成产物，与 `cordis-host-runner` 同先例）。

## Alternatives considered

- 让 Loader 防御抽象 constructor 导出（`isAbstract` 探测）：否决——实例化 constructor 导出是 Loader 契约；组合列表才是被拥有的杠杆。
- 把 `zod` 提升到仓库根供生成物解析：否决——pnpm 严格隔离下离开 workspace 仍会断，且依赖边属于携带 import 产物的包。

## Consequences

- 新增任务流 Service Definition 包不再新增 Loader 行；其 provider 行承载运行时。
- 任何新的 Typert 贡献包在生成产物的同次变更中把 `zod` 加进 `dependencies`。
