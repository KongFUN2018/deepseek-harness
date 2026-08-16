/**
 * The deliverable package's storage-domain declaration: immutable `versions`
 * plus the per-phaseRun `phaseInputs` registration. The latest version of a
 * deliverable is derived from the stored records at read time (linear scan at
 * M1 scale), so no separate index can drift from the versions it names.
 * @module @deepseek-ai/dsh-deliverable-minimal/src/spec
 */

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { DeliverableVersion } from './types.ts'

/** One immutable deliverable version as persisted on the medium. */
// Zod infers transformed branded fields structurally, so it cannot name the
// frozen wire interface even though every branded output is created here.
export const deliverableVersionSchema = z.object({
  versionId: z.string().min(1),
  deliverableId: z.string().min(1),
  versionNumber: z.number().int().min(1),
  baseVersionId: z.string().min(1).optional(),
  sourceSubmissionId: z.string().min(1).optional(),
  state: z.enum(['current', 'stale', 'invalid', 'superseded', 'cancelled']),
  entityRevision: z.number().int().min(1),
  createdAt: z.number().int().min(1),
}) as unknown as z.ZodType<DeliverableVersion>

/** Per-phaseRun input registration as persisted on the medium. */
export const phaseInputsSchema = z.object({
  inputVersionIds: z.array(z.string().min(1)),
})

/** Durable per-phaseRun input registration. */
export type PhaseInputs = z.infer<typeof phaseInputsSchema>

/** The deliverable domain: identity, format version, versions, and phase inputs. */
export const deliverableDomainSpec = defineDomain({
  name: 'deliverable_minimal',
  version: 1,
  tables: {
    versions: domainTable<string, DeliverableVersion>(deliverableVersionSchema),
    phase_inputs: domainTable<string, PhaseInputs>(phaseInputsSchema),
  },
})
