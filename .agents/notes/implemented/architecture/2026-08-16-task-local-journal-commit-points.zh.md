# Agent Note: Task-local——journal 提交点与写链内产物校验

Status: implemented

[English](2026-08-16-task-local-journal-commit-points.md) | 中文

## 问题

M1 ⑤ 需要一个真实 TaskHandle provider：任务投影仍活在测试内存里；阶段提交协议要求 submission + PhaseRun.activeSubmissionId + journal 原子提交；M1 冻结设计要求产物引用校验发生在任务写链内，而非扩张引擎闭包。

## 决策

`packages/task-flow/task-local`（`@deepseek-ai/dsh-task-local`）提供 `LocalTaskService extends TaskHandle`，绑定 `ctx.tasks`，注入 `['storageDomain', 'workbenchJournal', 'deliverables']`——不含 recipes，基类已自行解析。

写链串行化落在基类：TaskHandle 新增私有 `writeTail` 与 `serialized()` 包装，全部变更命令（create/mutate/record）在一条 promise 链上执行 load → transition → append → put，provider 无需各自加锁。所有 save 钩子携带从变更上下文提取的 `WriteProvenance {actor, idempotencyKey}`。

两个受保护扩展点承载 provider 特有行为，替代模板方法扩散：`resolveSubmissionEnvironment`（默认原样返回调用方事实）与 `onSubmissionAccepted`（默认空操作）。本 provider 覆写前者，从 deliverable 服务推导 `inputsCurrent`（每个输入版本存在、属于所指产物且为 `current`）与 `outputsValid`（每个输出版本存在且以本次 submission 为来源）——忽略调用方声明；覆写后者，把 submission 的输入版本注册为 phase inputs。

持久写采用 journal-first-then-put：`appendFact` 先于投影 put 执行，`taskFactKey = kind:entityId:entityRevision` 作为每次投影写的确定性幂等键；replay 可重建全部投影，追加即提交点。put 的 revision 不等于存量 revision 加一时以 `stale-revision` 拒绝。Gate 结果以列表长度为伪 revision，每个位置一条 `gate-check/recorded` 事实；`saveGateResult` 先按 submissionId+checkId+recordedAt 查重再追加。

## 验证

- 12 个单元测试：每写一事实的 journal replay、stale-revision 拒绝、并发 pause 串行化、共享内存介质重启恢复、输入时效与输出来源推导覆盖调用方声明、phase-input 注册、gate 去重、投影-journal 不变量（无事实的 put 失败；删除与他域静默）。
- 一条经 `cordis.yml` fixture 的真实 Loader e2e（storage → storage-json → storage-domain → recipe → workbench-journal → deliverable-minimal → task-local）：完整生命周期含调用方声明为假的受理、过时输入拒绝、gate 去重、journal 序列号稳定、同介质重启后状态/gate 结果/phase inputs 恢复。

## 考虑过的替代方案

- **Provider 各自加写锁**对比**基类串行化**：每个 TaskHandle provider 都要重复实现同一条链；单个 `serialized()` 尾部把 load-transition-save-emit 顺序收敛在一处，provider 只实现存储。
- **在引擎闭包内校验产物引用**对比**经扩展点在写链内校验**：M1 冻结的 engine-core 注入清单禁止增加 `deliverables`；provider 本就注入最小产物服务，该校验搭乘守卫迁移的同一条命令。
- **信任调用方提供的环境事实**对比**派生**：受理是受守卫迁移；调用方可设置的声明会绕过守卫，因此 provider 从存储版本推导两个标志。
- **先 put 后 append**对比**journal-first-then-put**：没有事实覆盖的 put 缺少可重建的提交点；先追加使事实成为权威、put 成为可重建投影。

## 后果

- `submission-rejected` 的问题列表可混合相位状态与产物引用问题；断言用 `arrayContaining` 而非全等。
- 投影-journal 不变量以 `{global: true}` 监听 `domain/changed`，复刻 workbench-journal 的 append-only 伴随件；gate_results 按列表位置全查，其余表按单一事实键查。
- 延后项：按键幂等索引（M1 规模线性扫描）、调用方提供的 gate 来源（引擎拥有的三元组）、跨主机协调（单主机写链）。
- 双语镜像必须与生成器输出逐行对齐（节点按声明序、边按字母序、表行与 config-catalog 条目按源序）；镜像被回滚后恢复时，配对门的链接序列对比是定位错位行的最快手段。
