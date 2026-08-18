# dsh-tool-task-create — 任务创建工具

[English](README.md) | 中文

`task_create` 模型工具（入口 B）：每次调用把一次显式创建请求转为确认提案——校验过的 Recipe、目标、会话继承选择与幂等键——不创建任何东西。任务仅在人类确认渲染卡片后创建。

## 模型体验（Model Experience）

间接，经模型提供的显式 recipe id 与目标；工具本身只出提案，不创建。

#### KV 缓存影响

无；工具从不组装或发送模型请求。

## 已知限制与后续工作

- 会话继承目前只提案未应用；确认步拥有 `createTask` 加首阶段会话 seed。
- Recipe 显示名即 recipe id；人类可读名称等 recipe payload 字段。
