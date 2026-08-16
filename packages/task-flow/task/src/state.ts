/**
 * Pure task and phase-run transition tables. The task package owns these
 * transitions; providers persist, they never widen them. States no shipped
 * command enters stay declared in the vocabulary.
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
 * passed. Retired runs do not block completion: an impact-staled run is a
 * terminal old run the engine already replaced with a fresh passed run.
 * Open decisions, unsigned B items, and stale deliverables enter the guard
 * when their services land (M3/M4).
 * @param state - the task's current state.
 * @param phaseStates - every phase-run state of the current run.
 * @returns whether the task may complete.
 */
export function canCompleteTask(state: TaskState, phaseStates: readonly PhaseRunState[]): boolean {
  return state === 'running' && phaseStates.length > 0 && phaseStates.every(phase => phase === 'passed' || phase === 'stale')
}

/**
 * Phase-run commands the task service accepts. `stale` is the M2 impact
 * command: running and submitting are excluded because an in-flight atomic
 * action settles per the M1 quiescence contract, and its submission is
 * rejected on stale inputs at acceptance instead. `passed` is a source: a
 * passed run over invalidated inputs is exactly the pseudo-valid downstream
 * the closure exists to retire.
 */
export type PhaseCommand =
  | 'start'
  | 'acceptSubmission'
  | 'startGate'
  | 'pass'
  | 'fail'
  | 'cancel'
  | 'stale'
  | 'awaitInput'
  | 'awaitDecision'
  | 'resumeFromAwaiting'

/** Allowed source states per phase command. */
const PHASE_SOURCES: Readonly<Record<PhaseCommand, readonly PhaseRunState[]>> = {
  start: ['created', 'scheduled'],
  acceptSubmission: ['running'],
  startGate: ['submitted'],
  pass: ['gate-running'],
  fail: ['gate-running'],
  cancel: ['created', 'scheduled', 'running', 'submitting', 'submitted', 'gate-running'],
  stale: ['created', 'scheduled', 'submitted', 'gate-running', 'awaiting-input', 'awaiting-decision', 'patching', 'passed'],
  awaitInput: ['gate-running'],
  awaitDecision: ['gate-running'],
  resumeFromAwaiting: ['awaiting-input', 'awaiting-decision'],
}

/** Destination state per phase command. */
const PHASE_NEXT: Readonly<Record<PhaseCommand, PhaseRunState>> = {
  start: 'running',
  acceptSubmission: 'submitted',
  startGate: 'gate-running',
  pass: 'passed',
  fail: 'failed',
  cancel: 'cancelled',
  stale: 'stale',
  awaitInput: 'awaiting-input',
  awaitDecision: 'awaiting-decision',
  resumeFromAwaiting: 'gate-running',
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
