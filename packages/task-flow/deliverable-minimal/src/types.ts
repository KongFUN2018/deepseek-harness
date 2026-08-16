/**
 * Deliverable version type surface: the frozen M1 wire contract
 * (`saveVersion` / `listCurrentInputs` / `invalidateDownstream`), the version
 * record, and failures. Types only — no runtime code.
 * @module @deepseek-ai/dsh-deliverable-minimal/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SubmissionId } from '@deepseek-ai/dsh-task/types'

/** One deliverable identity; versions chain under it. */
export type DeliverableId = Branded<'DeliverableId'>

/** One immutable deliverable version identity, assigned by the service. */
export type DeliverableVersionId = Branded<'DeliverableVersionId'>

/** Branch-product state; `listCurrentInputs` admits only `current`. */
export type DeliverableVersionState =
  | 'current'
  | 'stale'
  | 'invalid'
  | 'superseded'
  | 'cancelled'

/** One immutable deliverable version; the chain under a deliverableId. */
export interface DeliverableVersion {
  /** Immutable version identity, assigned by the service. */
  readonly versionId: DeliverableVersionId
  /** Deliverable this version belongs to. */
  readonly deliverableId: DeliverableId
  /** Monotonic position in the deliverable's chain, from 1. */
  readonly versionNumber: number
  /** Previous version in the same chain; absent on the root version. */
  readonly baseVersionId?: DeliverableVersionId
  /** Submission that produced this version, when known. */
  readonly sourceSubmissionId?: SubmissionId
  /** Branch-product state; M1 writes `current` and transitions to `stale`. */
  readonly state: DeliverableVersionState
  /** Bumps on each state transition; content and identity never change. */
  readonly entityRevision: number
  /** Epoch milliseconds at creation. */
  readonly createdAt: number
}

/** The invalidate result: ids newly transitioned to stale. */
export interface InvalidateDownstreamResult {
  /** Version ids transitioned from a non-stale state to `stale`. */
  readonly invalidated: DeliverableVersionId[]
}

/** Machine-routable deliverable failure codes. */
export type DeliverableErrorCode =
  | 'stale-write'
  | 'not-found'
  | 'invalid-argument'

/** Deliverable failure with code and message. */
export class DeliverableError extends Error {
  /** Machine-routable failure code. */
  readonly code: DeliverableErrorCode

  /**
   * @param code - Machine-routable failure code.
   * @param message - Human-readable failure description.
   */
  constructor(code: DeliverableErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'DeliverableError'
  }
}
