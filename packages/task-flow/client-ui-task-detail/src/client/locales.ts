/** `taskDetail` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'taskDetail'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'trigger': '详情',
  'title': '任务详情',
  'close': '关闭',
  'placeholder': '输入任务 ID',
  'load': '加载',
  'loading': '加载中…',
  'empty': '输入任务 ID 查看详情',
  'not-found': '任务不存在',
  'error.load': '加载失败：{code}',
  'revision': '版本 {revision}',
  'phases': '阶段运行',
  'gates': '门禁结论',
  'none': '无',
  'passed': '通过',
  'failed': '未通过',
} as const

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<TaskDetailKey, string> = {
  'trigger': 'Detail',
  'title': 'Task Detail',
  'close': 'Close',
  'placeholder': 'Enter a task id',
  'load': 'Load',
  'loading': 'Loading…',
  'empty': 'Enter a task id to inspect it',
  'not-found': 'Task not found',
  'error.load': 'Load failed: {code}',
  'revision': 'rev {revision}',
  'phases': 'Phase runs',
  'gates': 'Gate verdicts',
  'none': 'none',
  'passed': 'passed',
  'failed': 'failed',
}

/** Dictionary key union derived from the Chinese source of truth. */
export type TaskDetailKey = keyof typeof zh
