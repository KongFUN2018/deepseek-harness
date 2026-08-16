import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as TaskInvariant from '@deepseek-ai/dsh-task/src/invariant.ts'

describe('task invariant companion', () => {
  it('reserves the package name once against the shared registry', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry)
    await ctx.plugin(TaskInvariant)

    expect(() => {
      ctx.invariants.register('@deepseek-ai/dsh-task', () => {})
    }).toThrow(/already registered/)
  })
})
