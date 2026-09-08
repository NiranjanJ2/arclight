import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatTranscript } from './ChatPanel'

describe('ChatTranscript', () => {
  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
  })

  it('does not return the browser scroll result as an effect cleanup', () => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(() => ({ scrolled: true })),
    })
    const view = render(<ChatTranscript messages={[]} context={null} pending={false} />)

    expect(() => view.rerender(
      <ChatTranscript
        messages={[{ id: 'm1', role: 'assistant', content: 'A grounded answer.', createdAt: '2026-09-06T00:00:00.000Z' }]}
        context={null}
        pending={false}
      />,
    )).not.toThrow()
  })

  it('offers retry for a failed assistant response', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(<ChatTranscript
      messages={[{ id: 'm1', role: 'assistant', content: 'Codex stopped.', status: 'error', createdAt: '2026-09-06T00:00:00.000Z' }]}
      context={null}
      pending={false}
      onRetry={onRetry}
    />)

    await user.click(screen.getByRole('button', { name: 'Retry answer' }))
    expect(onRetry).toHaveBeenCalledWith('m1')
  })
})
