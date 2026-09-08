import { describe, expect, it } from 'vitest'
import { activeSectionAt } from './ReaderShell'

const line = 200

describe('activeSectionAt', () => {
  it('picks the last heading at or above the reading line', () => {
    expect(activeSectionAt([
      { id: 'intro', top: -400 },
      { id: 'method', top: 120 },
      { id: 'results', top: 900 },
    ], line)).toBe('method')
  })

  it('stays on the first heading before anything has scrolled past', () => {
    expect(activeSectionAt([
      { id: 'intro', top: 80 },
      { id: 'method', top: 3100 },
    ], line)).toBe('intro')
  })

  it('reports nothing when every heading is still below the line', () => {
    expect(activeSectionAt([{ id: 'intro', top: 640 }], line)).toBe('')
  })

  // Headings that cannot be measured must not win: a detached node reports a top
  // of 0, which previously made every section qualify and selected the last one.
  it('ignores headings that cannot be resolved', () => {
    expect(activeSectionAt([
      { id: 'intro', top: 100 },
      { id: 'appendix', top: Infinity },
    ], line)).toBe('intro')
  })
})
