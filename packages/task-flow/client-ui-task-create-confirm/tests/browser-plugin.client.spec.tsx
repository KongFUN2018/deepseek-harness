/** @vitest-environment jsdom */

/** Component suite: the keyed confirm card renders the proposal, toggles inheritance, and confirms. */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import type { TaskCreateProposalViewProps } from '../src/client/TaskCreateProposalView.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(zh)

function block(resultView: unknown): ToolCallBlock {
  return {
    kind: 'tool-result',
    seq: 1,
    time: 1,
    callId: 'call-1',
    call: { name: 'task_create', argsRaw: '{}' },
    callTime: 0,
    content: [],
    isError: false,
    callView: null,
    resultView: resultView as never,
    subCalls: [],
  }
}

function makeProps(confirm: ReturnType<typeof vi.fn>, resultView: unknown): { props: TaskCreateProposalViewProps } {
  const unusedGlobal = { getSnapshot: () => ({}), subscribe: () => () => {} } as never
  const props = {
    callId: 'call-1',
    toolName: 'task_create',
    block: block(resultView),
    openFile: vi.fn(),
    t,
    confirm,
    useSessions: unusedGlobal,
    useWorkspaces: unusedGlobal,
  } as unknown as TaskCreateProposalViewProps
  return { props }
}

describe('TaskCreateProposalView', () => {
  it('renders the proposal with recipe, counts, and goal', () => {
    const confirm = vi.fn(async () => 't-1')
    const { props } = makeProps(confirm, {
      recipeId: '需求研发', goal: '整理成 PRD', inheritSession: false,
      phaseCount: 3, checks: 2, idempotencyKey: 'k-1',
    })
    render(<Wrapped {...props} />)
    expect(screen.getByText('需求研发', { exact: false })).toBeTruthy()
    expect(screen.getByText(/整理成 PRD/)).toBeTruthy()
    expect(screen.getByText(zh['inherit.label'])).toBeTruthy()
  })

  it('confirms with the toggled inherit flag and flips to created', async () => {
    const confirm = vi.fn(async () => 't-42')
    const { props } = makeProps(confirm, {
      recipeId: '需求研发', goal: 'g', inheritSession: false,
      phaseCount: 3, checks: 2, idempotencyKey: 'k-1',
    })
    render(<Wrapped {...props} />)
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(false)
    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: zh.confirm }))
    await vi.waitFor(() => { expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ recipeId: '需求研发' }), true) })
    await vi.waitFor(() => { expect(screen.getByText(zh.confirmed.replace('{taskId}', 't-42'))).toBeTruthy() })
  })

  it('renders nothing for an unrelated resultView', () => {
    const confirm = vi.fn()
    const { props } = makeProps(confirm, null)
    const { container } = render(<Wrapped {...props} />)
    expect(container.firstChild).toBeNull()
  })
})

/** Import the component once to avoid a second path alias surface. */
import { TaskCreateProposalView } from '../src/client/TaskCreateProposalView.tsx'
function Wrapped(props: TaskCreateProposalViewProps) {
  return <TaskCreateProposalView {...props} />
}
