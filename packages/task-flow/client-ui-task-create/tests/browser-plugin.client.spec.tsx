/** @vitest-environment jsdom */

/** Component suite: the three-column wizard renders recipes, previews the selected phase chain, and creates with the chosen recipe. */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RecipeRevision } from '@deepseek-ai/dsh-recipe/types'
import { TaskCreateAction, type TaskCreateActionProps } from '../src/client/TaskCreateAction.tsx'
import type {} from '../src/client/index.ts'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh } from '../src/client/locales.ts'
import type { CreateState } from '../src/client/create.ts'

afterEach(cleanup)

const t = makeTranslate(zh)

function recipe(id: string, phases: string[]): RecipeRevision {
  return {
    recipeId: id as RecipeRevision['recipeId'],
    revision: 1,
    schemaVersion: 1,
    contentHash: 'h-' + id,
    registeredAt: 0,
    payload: {
      phases: phases.map((name, index) => ({ phaseId: 'p' + String(index), kind: 'work', goal: name, inputs: [], outputs: [], submissionCriteria: [] })),
      gateChecks: [],
      defaults: { batchConfirm: 'per-phase-single', clarify: { maxRounds: 3, splitMustDefault: false }, draftPolicy: 'block-finalize-not-draft' },
      p4Mode: { mode: 'auto' },
    } as unknown as RecipeRevision['payload'],
  }
}

function makeProps(state: CreateState): {
  props: TaskCreateActionProps
  create: ReturnType<typeof vi.fn>
  openDetail: ReturnType<typeof vi.fn>
  setState: (next: CreateState) => void
} {
  let current = state
  const useCreate = <S,>(selector: (snapshot: CreateState) => S) => selector(current)
  const unusedGlobal = { getSnapshot: () => ({}), subscribe: () => () => {} } as never
  const create = vi.fn(async () => 't-1')
  const openDetail = vi.fn()
  const composed: TaskCreateActionProps = {
    openDetail,
    openInbox: vi.fn(),
    initialRecipeId: undefined,
    openCreate: vi.fn(),
    t,
    useCreate,
    refresh: vi.fn(),
    create,
    useSessions: unusedGlobal,
    useWorkspaces: unusedGlobal,
  }
  return { props: composed, create, openDetail, setState: (next) => { current = next } }
}

describe('TaskCreateAction', () => {
  it('renders the recipe catalogue and links the phase preview', () => {
    const state: CreateState = { status: 'ready', recipes: [recipe('需求研发', ['收集', '分析', '产出']), recipe('Bug修复', ['复现', '定位'])] }
    render(<TaskCreateAction {...makeProps(state).props} />)
    expect(screen.getByText('需求研发')).toBeTruthy()
    fireEvent.click(screen.getByText('需求研发'))
    expect(screen.getByText('收集')).toBeTruthy()
    expect(screen.getByText('分析')).toBeTruthy()
    expect(screen.getByText('产出')).toBeTruthy()
    expect(screen.queryByText('复现')).toBeNull()
  })

  it('disables create until a recipe is chosen', () => {
    const state: CreateState = { status: 'ready', recipes: [recipe('需求研发', ['收集'])] }
    render(<TaskCreateAction {...makeProps(state).props} />)
    expect(screen.getByRole('button', { name: zh.create }).closest('button')?.hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByText('需求研发'))
    expect(screen.getByRole('button', { name: zh.create }).closest('button')?.hasAttribute('disabled')).toBe(false)
  })

  it('creates with the chosen recipe and opens the detail tab', async () => {
    const state: CreateState = { status: 'ready', recipes: [recipe('需求研发', ['收集'])] }
    const h = makeProps(state)
    render(<TaskCreateAction {...h.props} />)
    fireEvent.click(screen.getByText('需求研发'))
    fireEvent.click(screen.getByRole('button', { name: zh.create }))
    await vi.waitFor(() => { expect(h.create).toHaveBeenCalledWith('需求研发', 'default', '') })
    await vi.waitFor(() => { expect(h.openDetail).toHaveBeenCalledWith('t-1') })
  })
})
