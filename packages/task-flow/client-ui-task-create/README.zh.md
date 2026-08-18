# client-ui-task-create — 任务创建向导

[English](README.md) | 中文

任务创建向导（入口 A）：三栏面板填充抽屉的「新建」tab——Recipe 选择、联动流程预览、目标与配置。经 tasks Remote 以全新幂等键创建，并打开详情 tab。

## 模型体验（Model Experience）

无，因为本包渲染面向人类的向导，不触及任何提示词、消息、schema、流或工具结果。

#### KV 缓存影响

无；本包从不组装或发送模型请求。

## 已知限制与后续工作

- Workspace 选择器为只读默认；多 workspace 选择器是后续工作。
- 目标文本不持久化到任务记录；在后续确认步 seed 第一阶段。
