/**
 * Runtime values of the deliverable package's branded identities.
 * @module @deepseek-ai/dsh-deliverable-minimal/src/runtime
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { DeliverableId, DeliverableVersionId } from './types.ts'

/**
 * Brand one wire value as a deliverable id.
 * @param value - Wire value from the boundary.
 * @returns the branded deliverable id.
 */
export function DeliverableId(value: string): DeliverableId {
  return value as Branded<'DeliverableId'>
}

/**
 * Brand one wire value as a deliverable version id.
 * @param value - Wire value from the boundary.
 * @returns the branded version id.
 */
export function DeliverableVersionId(value: string): DeliverableVersionId {
  return value as Branded<'DeliverableVersionId'>
}
