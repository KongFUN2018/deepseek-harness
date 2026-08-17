/** `taskDetail` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'taskDetail'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'runs.current': '当前 Run #{runId}',
  'runs.archived': '已归档 Run #{runId}（rewind 退役）',
  'gate.class.a': 'A · 机器强制',
  'gate.class.b': 'B · 人工确认',
  'gate.class.c': 'C · 人工仲裁',
  'gate.stale': '（已失效）',
  'phase.superseded': '已归档',
  'verb.patch': 'patch · 原地修正',
  'verb.rewind': 'rewind · 打回重走',
  'hint.patch': '进入上游会话修正后，Gate 将重验。',
  'hint.rewind': '到收件箱处理打回决策（影响预览 → 确认 → 新 Run）。',
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
  'runs.current': 'Current run #{runId}',
  'runs.archived': 'Archived run #{runId} (rewound)',
  'gate.class.a': 'A · machine-mandatory',
  'gate.class.b': 'B · human confirm',
  'gate.class.c': 'C · human arbitration',
  'gate.stale': ' (staled)',
  'phase.superseded': 'archived',
  'verb.patch': 'patch · fix in place',
  'verb.rewind': 'rewind · restart from',
  'hint.patch': 'Fix upstream in the session; the Gate re-verifies.',
  'hint.rewind': 'Handle the rewind decision in the inbox (preview → confirm → new run).',
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
