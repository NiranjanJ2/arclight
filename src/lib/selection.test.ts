import { describe, expect, it } from 'vitest'
import { findQuote, restoreRange, searchRanges, serializeRange } from './selection'

describe('paper selection offsets', () => {
  it('serializes and restores a selection that crosses inline nodes', () => {
    const root = document.createElement('article')
    root.innerHTML = '<section><h2 id="intro">Intro</h2><p>Alpha <em>beta</em> gamma.</p></section>'
    document.body.append(root)
    const paragraph = root.querySelector('p')!
    const first = paragraph.firstChild!
    const last = paragraph.lastChild!
    const range = document.createRange()
    range.setStart(first, 2)
    range.setEnd(last, 3)

    const serialized = serializeRange(root, range)

    expect(serialized).toMatchObject({ start: 7, end: 18, quote: 'pha beta ga', sectionId: 'intro', sectionTitle: 'Intro' })
    expect(restoreRange(root, serialized!)).not.toBeNull()
    expect(restoreRange(root, serialized!)!.toString()).toBe('pha beta ga')
  })

  it('does not restore offsets when the source quote changed', () => {
    const root = document.createElement('article')
    root.textContent = 'A different revision.'

    expect(restoreRange(root, { start: 0, end: 4, quote: 'Original text' })).toBeNull()
  })
})

describe('findQuote', () => {
  const article = () => {
    const root = document.createElement('article')
    root.innerHTML = '<p>The Transformer relies on attention to model\n  dependencies between every pair of positions.</p>'
    return root
  }

  it('locates a passage quoted back exactly', () => {
    expect(findQuote(article(), 'relies on attention to model')?.quote).toBe('relies on attention to model')
  })

  // A model rarely reproduces line breaks and runs of spaces faithfully.
  it('locates a passage whose whitespace does not match the paper', () => {
    const found = findQuote(article(), 'attention to model dependencies between every pair')
    expect(found).not.toBeNull()
    expect(found!.quote.replace(/\s+/g, ' ')).toBe('attention to model dependencies between every pair')
  })

  it('ignores a passage that is not in the paper, and refuses tiny ones', () => {
    expect(findQuote(article(), 'recurrent neural networks process sequences')).toBeNull()
    expect(findQuote(article(), 'the')).toBeNull()
  })
})

describe('searchRanges', () => {
  const article = (html: string) => {
    const root = document.createElement('article')
    root.innerHTML = html
    return root
  }

  it('finds every occurrence regardless of case', () => {
    const root = article('<p>Attention matters. attention again. ATTENTION thrice.</p>')
    expect(searchRanges(root, 'attention')).toHaveLength(3)
  })

  it('finds a match that spans element boundaries', () => {
    const root = article('<p>self-<em>attention</em> layer</p>')
    const hits = searchRanges(root, 'self-attention')
    expect(hits).toHaveLength(1)
    expect(hits[0].toString()).toBe('self-attention')
  })

  // A summary Arc wrote over a passage is not part of the paper, so it must not match.
  it('ignores generated text', () => {
    const root = article('<p>real attention text</p><span data-arc-generated="true">attention attention</span>')
    expect(searchRanges(root, 'attention')).toHaveLength(1)
  })

  it('ignores terms too short to be useful, and reports nothing for a miss', () => {
    const root = article('<p>Attention matters.</p>')
    expect(searchRanges(root, 'a')).toEqual([])
    expect(searchRanges(root, 'recurrence')).toEqual([])
  })
})
