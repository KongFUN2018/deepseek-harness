# client-ui-task-create-confirm — 任务创建确认卡片

[English](README.md) | 中文

`task_create` 工具的 keyed `tool.call.toolview` 渲染器（入口 B client 半）：展示提案（recipe、阶段/道闸数、目标）、会话继承勾选、取消/确认。确认经 tasks Remote 调 createTask 并把卡片翻转为已创建态。

## 模型体验（Model Experience）

无，因为本包渲染面向人类的确认卡片，不触及任何提示词、消息、schema、流或工具结果。

#### KV 缓存影响

无；本包从不组装或发送模型请求。

## 已知限制与后续工作

- 确认时尚未写会话 seed；继承勾选会展示并记录在提案里，但首阶段会话 seed 等待 host 命令。
- 取消是视觉 no-op；卡片保持可关闭且不改任何状态。
