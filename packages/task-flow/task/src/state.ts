/**
 * Pure task and phase-run transition tables. The task package owns these
 * transitions; providers persist, they never widen them. Unreachable-in-M1
 * states stay declared in the vocabulary but no M1 command enters them.
 * @module @deepseek-ai/dsh-task/src/state
 */

import type { PhaseRunState, TaskState } from './types.ts'

/** Task-level commands the task service accepts. */
export type TaskCommand =
  | 'start'
  | 'pause'
  | 'settlePause'
  | 'resume'
  | 'cancel'
  | 'settleCancel'
  | 'complete'
  | 'fail'

/** Allowed source states per task command. */
const TASK_SOURCES: Readonly<Record<TaskCommand, readonly TaskState[]>> = {
  start: ['planning'],
  pause: ['running', 'awaiting-input', 'awaiting-decision'],
  settlePause: ['pausing'],
  resume: ['paused'],
  cancel: ['planning', 'running', 'awaiting-input', 'awaiting-decision', 'pausing', 'paused'],
  settleCancel: ['cancelling'],
  complete: ['running'],
  fail: ['running'],
}

/** Destination state per task command. */
const TASK_NEXT: Readonly<Record<TaskCommand, TaskState>> = {
  start: 'running',
  pause: 'pausing',
  settlePause: 'paused',
  resume: 'running',
  cancel: 'cancelling',
  settleCancel: 'cancelled',
  complete: 'completed',
  fail: 'failed',
}

/**
 * Resolve one task command against the current state.
 * @param state - the task's current state.
 * @param command - the requested command.
 * @returns the destination state, or `null` when the transition is invalid.
 */
export function taskTransition(state: TaskState, command: TaskCommand): TaskState | null {
  if (TASK_SOURCES[command].includes(state)) return TASK_NEXT[command]
  return null
}

/**
 * M1 completion guard: the task runs and every phase run of the current run
 * passed. Open decisions, unsigned B items, and stale deliverables enter the
 * guard when their services land (M3/M4).
 * @param state - the task's current state.
 * @param phaseStates - every phase-run state of the current run.
 * @returns whether the task may complete.
 */
export function canCompleteTask(state: TaskState, phaseStates: readonly PhaseRunState[]): boolean {
  return state === 'running' && phaseStates.length > 0 && phaseStates.every(phase => phase === 'passed')
}

/** Phase-run commands the task service accepts. */
export type PhaseCommand = 'start' | 'acceptSubmission' | 'startGate' | 'pass' | 'fail' | 'cancel'

/** Allowed source states per phase command. */
const PHASE_SOURCES: Readonly<Record<PhaseCommand, readonly PhaseRunState[]>> = {
  start: ['created', 'scheduled'],
  acceptSubmission: ['running'],
  startGate: ['submitted'],
  pass: ['gate-running'],
  fail: ['gate-running'],
  cancel: ['created', 'scheduled', 'running', 'submitting', 'submitted', 'gate-running'],
}

/** Destination state per phase command. */
const PHASE_NEXT: Readonly<Record<PhaseCommand, PhaseRunState>> = {
  start: 'running',
  acceptSubmission: 'submitted',
  startGate: 'gate-running',
  pass: 'passed',
  fail: 'failed',
  cancel: 'cancelled',
}

/**
 * Resolve one phase command against the current phase-run state.
 * @param state - the phase run's current state.
 * @param command - the requested command.
 * @returns the destination state, or `null` when the transition is invalid.
 */
export function phaseTransition(state: PhaseRunState, command: PhaseCommand): PhaseRunState | null {
  if (PHASE_SOURCES[command].includes(state)) return PHASE_NEXT[command]
  return null
}
