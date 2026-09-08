import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PaperDocument } from '../types/paper'
import { importPaper } from './api'

const paper = { id: '1706.03762' } as PaperDocument

afterEach(() => vi.unstubAllGlobals())

describe('local API session', () => {
  it('establishes a private browser session before a protected request', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ paper }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(importPaper('1706.03762')).resolves.toEqual(paper)
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/session', expect.objectContaining({ credentials: 'same-origin' }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/papers/import', expect.objectContaining({ credentials: 'same-origin' }))
  })
})
