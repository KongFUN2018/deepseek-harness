/** `taskBoard` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'taskBoard'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'refresh': '刷新',
  'loading': '加载中…',
  'empty': '暂无任务',
  'error.load': '加载失败：{code}',
  'error.command': '操作失败：{code}，已重新同步',
  'revision': '版本 {revision}',
  'open': '打开任务 {taskId}',
  'state.planning': '规划中',
  'state.running': '运行中',
  'state.awaiting-input': '等待输入',
  'state.awaiting-decision': '等待决策',
  'state.pausing': '暂停中',
  'state.paused': '已暂停',
  'state.cancelling': '取消中',
  'state.cancelled': '已取消',
  'state.completed': '已完成',
  'state.failed': '已失败',
  'verb.pause': '暂停',
  'verb.resume': '继续',
  'verb.cancel': '取消',
} as const

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<TaskBoardKey, string> = {
  'refresh': 'Refresh',
  'loading': 'Loading…',
  'empty': 'No tasks yet',
  'error.load': 'Load failed: {code}',
  'error.command': 'Command failed: {code}; resynced',
  'revision': 'rev {revision}',
  'open': 'Open task {taskId}',
  'state.planning': 'planning',
  'state.running': 'running',
  'state.awaiting-input': 'awaiting input',
  'state.awaiting-decision': 'awaiting decision',
  'state.pausing': 'pausing',
  'state.paused': 'paused',
  'state.cancelling': 'cancelling',
  'state.cancelled': 'cancelled',
  'state.completed': 'completed',
  'state.failed': 'failed',
  'verb.pause': 'Pause',
  'verb.resume': 'Resume',
  'verb.cancel': 'Cancel',
}

/** Dictionary key union derived from the Chinese source of truth. */
export type TaskBoardKey = keyof typeof zh
