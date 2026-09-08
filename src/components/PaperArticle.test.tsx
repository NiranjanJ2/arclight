import { createRef } from 'react'
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PaperDocument, SavedHighlight } from '../types/paper'
import { PaperArticle } from './PaperArticle'

const paper: PaperDocument = {
  id: 'paper',
  metadata: {
    id: '1706.03762', title: 'Test Paper', authors: ['Ada'], abstract: '', categories: [],
    sourceUrl: 'https://arxiv.org/abs/1706.03762', pdfUrl: 'https://arxiv.org/pdf/1706.03762.pdf',
  },
  html: '<section><h2 id="intro">Introduction</h2><p>Target phrase lives here.</p></section>',
  outline: [{ id: 'intro', title: 'Introduction', depth: 2 }],
  plainText: 'Introduction Target phrase lives here.',
  acronyms: [],
  importedAt: '2026-09-06T00:00:00.000Z',
}

describe('PaperArticle', () => {
  it('applies only highlights whose restored quote still matches', () => {
    const articleRef = createRef<HTMLElement>()
    const view = render(<PaperArticle paper={paper} articleRef={articleRef} highlights={[]} transforms={[]} onRetryTransform={() => {}} onDismissTransform={() => {}} onSelection={() => undefined} />)
    const source = articleRef.current!.textContent!
    const start = source.indexOf('Target phrase')
    const valid: SavedHighlight = { id: 'valid', start, end: start + 13, quote: 'Target phrase', createdAt: paper.importedAt }
    const stale: SavedHighlight = { ...valid, id: 'stale', quote: 'Different text' }

    view.rerender(<PaperArticle paper={paper} articleRef={articleRef} highlights={[valid, stale]} transforms={[]} onRetryTransform={() => {}} onDismissTransform={() => {}} onSelection={() => undefined} />)

    expect(articleRef.current!.querySelectorAll('mark[data-arclight-highlight]')).toHaveLength(1)
    expect(articleRef.current!.querySelector('mark')?.textContent).toBe('Target phrase')
  })

  it('reports keyboard-created selections through selectionchange', () => {
    const articleRef = createRef<HTMLElement>()
    const onSelection = vi.fn()
    const view = render(<PaperArticle paper={paper} articleRef={articleRef} highlights={[]} transforms={[]} onRetryTransform={() => {}} onDismissTransform={() => {}} onSelection={onSelection} />)
    const text = view.getByText('Target phrase lives here.').firstChild!
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 13)
    Object.defineProperty(range, 'getBoundingClientRect', {
      value: () => ({ left: 20, right: 140, top: 200, bottom: 220, width: 120, height: 20, x: 20, y: 200, toJSON() {} }),
    })
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)

    fireEvent(document, new Event('selectionchange'))

    expect(onSelection).toHaveBeenCalledWith(expect.objectContaining({ quote: 'Target phrase' }))
  })
})
