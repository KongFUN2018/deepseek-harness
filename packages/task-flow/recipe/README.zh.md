# @deepseek-ai/dsh-recipe

[English](README.md) | 中文

不可变任务流程 Recipe revision 注册表（`ctx.recipes`）：载荷校验、内容寻址的 revision、带哈希校验的固定身份读取，以及新任务所固定的内置空模板 revision。

## Service contract

`ctx.recipes` 是绑定 `recipes` wire 命名空间的 `TypertRemoteService`，四个 `@Remote` 方法只收发普通 wire 值：

- `register(recipeId, revision, payload)` —— 校验载荷、计算内容哈希、存防御性副本并返回 revision；同身份同载荷幂等，同身份不同载荷以 `duplicate-revision` 拒绝。
- `getPinned(identity)` —— 读取一条固定 revision 并复核内容哈希（`hash-mismatch` 响亮失败）。
- `latest(recipeId)` —— 最高已注册 revision；仅供新任务创建。
- `list()` —— 全部已注册身份。

注册表启动时注册 `empty-template` revision 1：一个阶段、显式 PhaseSubmission、最小 Deliverable。

## Extension points

- 文件系统 provider 日后经 `register` 注册真实 Recipe 载荷；注册表面不变。
- 任务域经 `getPinned` 固定 revision；运行中任务永不读 `latest`。

## Model Experience

### Recipe 注册表读取与注册

#### What the model sees

Nothing. `ctx.recipes` 服务任务引擎与工作台 UI；任何工具、prompt 分节或会话事件都不会把已注册 Recipe 暴露给模型请求。

#### Token effect

None. 注册表调用走 RPC 载体或同进程引擎路径，均在模型请求路径之外。

#### KV Cache effect

None. Recipe 载荷从不进入 prompt，本包不会增加、删除或重排任何前缀。

## Known Limitations and Deferred Work

- 存储为内存态：重启后已注册 revision 消失。文件系统 provider 落地后注册才持久；期间固定空模板回退保证 M1 任务可启动。
- 存储 revision 是防御性副本，注册后调用方改动不会漂移已存内容；`getPinned` 复核哈希是未来持久介质损坏上浮的接缝。
- M0 未校准的预算类字段（token/时长预算、重跑上限、A 修复熔断、独立审查成本）按设计缺席于载荷 schema，不能先落默认值。
