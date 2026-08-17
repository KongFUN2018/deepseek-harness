/** `taskDetail` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'taskDetail'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'loading': '加载中…',
  'empty': '从任务列表选择一个任务查看详情',
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
  'loading': 'Loading…',
  'empty': 'Select a task from the list to see its detail',
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
