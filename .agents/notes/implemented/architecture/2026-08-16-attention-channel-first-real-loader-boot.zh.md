# Agent Note：注意力通道首次真实 Loader 启动暴露两个组合 bug

Status: implemented

[English](2026-08-16-attention-channel-first-real-loader-boot.md) | 中文

## 问题

M4 出口判据（多标签页冲突可解释、无静默确认）已逐层证明——attention 的 CAS 阶梯、workbench-host 的逐项结果、收件箱控制器的冲突计数——但从未经过 shipped Web 组合。该证明的指定通道是 keyless 浏览器 e2e 车道（`launchWebScaffold`：真实 Loader 加载 base + web-app bundle、真实 chromium、真实 SSE/WebSocket）。它的首次启动拒绝装配，两个失败都是包级测试看不到的真实产品 bug。

## 决策

- 先修 bug，再新增 `apps/web/tests/workbench-attention.e2e.ts`：一个 scaffold 上两个真实标签页、三个预置 B 项、五个测试覆盖场景 1（两标签读到同一快照；reload 后重建）、场景 3 的 reload 重建半边、场景 4（标签 A 解决后，转发的 `workbench/attention-updated` 推送折叠进标签 B，标签 B 的确认携带折叠后的修订并展示计数冲突行，同时重同步移除已解决行——以 aria golden 钉住）、场景 5（含一个已解决项的批量精确报告一个未决结果）、以及 `workbenchHostStream.listIncremental` 的增量投影检查。host 重启（场景 3 另一半）不在内：该车道每个 scaffold 只启动一个 Host。
- Bug 1：`workbench-host`、`workbench-host-stream`、`impact-propagation` 发布的 `lib/typert.host.js` 产物 `import { z } from 'zod'`，却没有把 `zod` 声明为运行时依赖。tsdown 客户端构建早已在这些包上警告 `UNRESOLVED_IMPORT 'zod'`；真实 Loader 在启动时同样解析失败。三个包现已在 `dependencies` 声明 `zod: ^4.4.3`（与 `task`、`attention` 及其他 Typert remote 包一致），并加 knip `ignoreDependencies` 条目（knip 只扫描 `src`）。
- Bug 2：`edit-lock` 声明了 `static Config` zod 对象，而 base bundle 挂载该行时没有 config 块——zod 收到 `undefined` 并拒绝整个组合。schema 现在带 `.default({ sweepIntervalMs: 5000 })`，无 config 挂载按 README 记载的默认值装配。

## 验证

- `DSH_SNAPSHOT=replay pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/workbench-attention.e2e.ts`：5/5 绿；冲突 golden（`snapshots/workbench-attention/conflict.expected.md`）钉住 alert 行加重同步后的行集。
- 受影响套件全绿：四个 task-flow 包单元（54 测试）、task-flow 真实 Loader e2e 全量（13 测试）、`edit-lock` 自己的 e2e（其 fixture 仍传显式 config）、build:lib:host/client（zod `UNRESOLVED_IMPORT` 警告消失）、knip、oxlint、verify-* 全家（cordis-config 133、package-invariants 236、built-invariants、readme-limitations、model-experience、translation-pairing 969、export-jsdoc、md-links 1959）。

## 备选方案

- **手挂控制器测试当多标签证明** 对比 **浏览器车道**：控制器测试已模拟第二次确认冲突，但判据要求的是 shipped 组合如此行为；只有真实 Loader 能抓到本车道发现的两个挂载 bug。
- **通过 UI 预置条目** 对比 **宿主侧 `ctx.attention.createItem`**：被测的是通道（快照读、推送折叠、compare-and-set），不是建项 UX；宿主侧预置保持测试确定且零模型调用。

## 后果

- Typert remote 包规则从此显式：生成器产出 import zod 的产物的包必须在 `dependencies` 声明 `zod`（配 knip ignore），否则 shipped bundle 无法启动；此类包上的 tsdown `UNRESOLVED_IMPORT` 警告是启动失败，不是噪音。
- 声明 Config 的服务必须容忍无 config 挂载（对象级 `.default`），因为 bundle 列行时不带 config 块；仅字段级默认不够。
