import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyWorkspace, loadWorkspace, saveWorkspace } from './storage'
import type { PaperWorkspace } from '../types/paper'

beforeEach(() => localStorage.clear())
// The quota test replaces Storage.setItem permanently unless it is put back, which
// silently turns every later save in this file into a no-op.
afterEach(() => vi.restoreAllMocks())

describe('paper workspace storage', () => {
  it('round-trips a versioned workspace by paper ID', () => {
    const workspace: PaperWorkspace = {
      version: 1,
      highlights: [{ id: 'h1', start: 2, end: 6, quote: 'text', createdAt: '2026-09-06T00:00:00.000Z' }],
      transforms: [],
      chat: [{ id: 'm1', role: 'user', content: 'Why?', createdAt: '2026-09-06T00:00:00.000Z' }],
    }

    saveWorkspace('1706.03762', workspace)

    expect(loadWorkspace('1706.03762')).toEqual(workspace)
  })

  it('falls back safely for corrupt or unsupported data', () => {
    localStorage.setItem('arclight:paper:bad', '{oops')
    localStorage.setItem('arclight:paper:new', JSON.stringify({ version: 9 }))

    expect(loadWorkspace('bad')).toEqual(emptyWorkspace())
    expect(loadWorkspace('new')).toEqual(emptyWorkspace())
  })

  it('retains complete chat history', () => {
    const workspace: PaperWorkspace = {
      ...emptyWorkspace(),
      chat: Array.from({ length: 45 }, (_, index) => ({
        id: `m${index}`,
        role: 'user' as const,
        content: String(index),
        createdAt: '2026-09-06T00:00:00.000Z',
      })),
    }

    saveWorkspace('paper', workspace)

    expect(loadWorkspace('paper').chat).toHaveLength(45)
    expect(loadWorkspace('paper').chat[0].content).toBe('0')
  })

  it('does not silently discard annotations', () => {
    const workspace: PaperWorkspace = {
      ...emptyWorkspace(),
      highlights: Array.from({ length: 105 }, (_, index) => ({
        id: `h${index}`,
        start: index,
        end: index + 4,
        quote: String(index),
        createdAt: '2026-09-06T00:00:00.000Z',
      })),
    }

    saveWorkspace('paper', workspace)

    expect(loadWorkspace('paper').highlights).toHaveLength(105)
    expect(loadWorkspace('paper').highlights[0].id).toBe('h0')
    expect(loadWorkspace('paper').highlights.at(-1)?.id).toBe('h104')
  })

  it('reads a workspace saved before summaries moved inline', () => {
    localStorage.setItem('arclight:paper:legacy', JSON.stringify({
      version: 1,
      highlights: [{ id: 'h1', start: 0, end: 3, quote: 'abc', createdAt: '2026-09-06T00:00:00.000Z' }],
      notes: [{ id: 'n1', kind: 'summarize', quote: 'q', answer: 'a', status: 'complete', createdAt: '2026-09-06T00:00:00.000Z' }],
      chat: [],
    }))

    const restored = loadWorkspace('legacy')

    expect(restored.highlights).toHaveLength(1)
    expect(restored).not.toHaveProperty('notes')
  })

  it('does not crash the reader when browser storage is full', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError') })

    expect(saveWorkspace('paper', emptyWorkspace())).toBe(false)
  })
})

describe('inline transforms', () => {
  it('carries finished summaries over to the next visit', () => {
    saveWorkspace('paper', {
      ...emptyWorkspace(),
      transforms: [{ id: 't1', kind: 'simplify', start: 4, end: 20, quote: 'a passage', answer: 'plain words', status: 'complete' }],
    })

    expect(loadWorkspace('paper').transforms).toHaveLength(1)
    expect(loadWorkspace('paper').transforms[0].answer).toBe('plain words')
  })

  // A pending one would sit forever saying "condensing"; a failed one has nothing
  // worth restoring.
  it('drops transforms that never finished', () => {
    saveWorkspace('paper', {
      ...emptyWorkspace(),
      transforms: [
        { id: 'a', kind: 'summarize', start: 0, end: 5, quote: 'q', answer: '', status: 'pending' },
        { id: 'b', kind: 'bullets', start: 6, end: 9, quote: 'q', answer: 'failed', status: 'error' },
        { id: 'c', kind: 'summarize', start: 10, end: 14, quote: 'q', answer: 'done', status: 'complete' },
      ],
    })

    expect(loadWorkspace('paper').transforms.map((entry) => entry.id)).toEqual(['c'])
  })
})
