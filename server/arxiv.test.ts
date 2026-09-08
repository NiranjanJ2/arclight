// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { fetchPaper, parseArxivId, readBoundedText } from './arxiv'

describe('parseArxivId', () => {
  it.each([
    ['1706.03762', '1706.03762'],
    ['  1706.03762v5  ', '1706.03762v5'],
    ['https://arxiv.org/abs/1706.03762', '1706.03762'],
    ['https://www.arxiv.org/pdf/1706.03762v5.pdf?download=1', '1706.03762v5'],
    ['https://arxiv.org/html/2501.01234', '2501.01234'],
    ['https://arxiv.org/abs/hep-th/9901001v2', 'hep-th/9901001v2'],
    ['cs/0601001', 'cs/0601001'],
  ])('canonicalizes %s', (input, expected) => {
    expect(parseArxivId(input)).toBe(expected)
  })

  it.each([
    '',
    'not a paper',
    'https://example.com/abs/1706.03762',
    'https://arxiv.org.evil.test/abs/1706.03762',
    'https://arxiv.org/abs/../../etc/passwd',
    '1706.123',
    'javascript:1706.03762',
  ])('rejects %s', (input) => {
    expect(parseArxivId(input)).toBeNull()
  })
})

describe('fetchPaper', () => {
  it('stops reading a streamed response as soon as the byte ceiling is crossed', async () => {
    let pulls = 0
    const response = new Response(new ReadableStream({
      pull(controller) {
        pulls += 1
        controller.enqueue(new Uint8Array(1_000_000))
      },
    }))

    await expect(readBoundedText(response, 2_500_000)).rejects.toThrow('too large')
    expect(pulls).toBeLessThanOrEqual(4)
  })

  it.each([
    'http://arxiv.org/html/1706.03762',
    'https://arxiv.org:444/html/1706.03762',
  ])('rejects unsafe redirects to %s', async (location) => {
    const fetchImpl = async () => new Response(null, { status: 302, headers: { location } })

    await expect(fetchPaper('1706.03762', undefined, fetchImpl as typeof fetch)).rejects.toThrow('secure arXiv hosts')
  })

  it('falls back to ar5iv when arXiv HTML has no conversion', async () => {
    const calls: string[] = []
    const fetchImpl = async (url: string | URL | Request) => {
      calls.push(String(url))
      if (calls.length === 1) return new Response('missing', { status: 404 })
      return new Response('<article><h1>Fallback Paper</h1><h2>1 Intro</h2><p>Text.</p></article>', {
        headers: { 'content-type': 'text/html' },
      })
    }

    const paper = await fetchPaper('1706.03762', undefined, fetchImpl as typeof fetch)

    expect(calls).toEqual([
      'https://arxiv.org/html/1706.03762',
      'https://ar5iv.labs.arxiv.org/html/1706.03762',
    ])
    expect(paper.metadata.title).toBe('Fallback Paper')
  })

  it('resolves relative paper assets against the source that answered', async () => {
    const fetchImpl = async () => new Response('<article><h1>Paper</h1><h2>Intro</h2><img src="figures/x1.svg" alt="Plot"></article>')

    const paper = await fetchPaper('1706.03762', undefined, fetchImpl as typeof fetch)

    expect(paper.html).toContain('src="https://arxiv.org/html/figures/x1.svg"')
  })

  it('rejects oversized paper responses before parsing', async () => {
    const fetchImpl = async () => new Response('small', { headers: { 'content-length': '13000000' } })

    await expect(fetchPaper('1706.03762', undefined, fetchImpl as typeof fetch)).rejects.toThrow('too large')
  })
})
