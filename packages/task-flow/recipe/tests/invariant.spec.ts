import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as RecipeInvariant from '@deepseek-ai/dsh-recipe/src/invariant.ts'

describe('recipe invariant companion', () => {
  it('reserves the package name once against the shared registry', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry)
    await ctx.plugin(RecipeInvariant)

    expect(() => {
      ctx.invariants.register('@deepseek-ai/dsh-recipe', () => {})
    }).toThrow(/already registered/)
  })
})
