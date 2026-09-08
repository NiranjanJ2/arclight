import type { PaperDocument } from '../types/paper'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetLastPaper, forgetRecentPaper, loadCachedPaper, loadLastPaper, loadOpenTabs, loadRecentPapers, saveCachedPaper, saveOpenTabs } from './paperCache'
import { samplePaper } from '../data/samplePaper'

beforeEach(() => localStorage.clear())
// A quota mock below replaces Storage.setItem for good unless it is put back, which
// silently made every later save in this file a no-op.
afterEach(() => vi.restoreAllMocks())

describe('normalized paper cache', () => {
  it('restores the last opened paper and retains it after leaving the reader', () => {
    expect(saveCachedPaper(samplePaper)).toBe(true)
    expect(loadLastPaper()?.metadata.title).toBe('Attention Is All You Need')

    forgetLastPaper()

    expect(loadLastPaper()).toBeNull()
    expect(loadCachedPaper(samplePaper.id)?.id).toBe(samplePaper.id)
  })

  it('reports unavailable browser storage without crashing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError') })

    expect(saveCachedPaper(samplePaper)).toBe(false)
  })
})

describe('recent papers', () => {
  const paper = (id: string, title: string): PaperDocument => ({
    id,
    metadata: { id, title, authors: ['Ada Lovelace', 'Alan Turing'], abstract: 'a', categories: [], sourceUrl: 's', pdfUrl: 'p' },
    html: '<p>x</p>',
    outline: [],
    plainText: 'x',
    acronyms: [],
    importedAt: '2026-09-07T00:00:00.000Z',
  })

  it('lists papers most recently opened first, without duplicating one reopened', () => {
    saveCachedPaper(paper('1', 'First'))
    saveCachedPaper(paper('2', 'Second'))
    saveCachedPaper(paper('1', 'First'))

    expect(loadRecentPapers().map((entry) => entry.id)).toEqual(['1', '2'])
  })

  it('keeps at most twelve papers, dropping the oldest', () => {
    for (let index = 0; index < 15; index += 1) saveCachedPaper(paper(String(index), `Paper ${index}`))

    const recents = loadRecentPapers()
    expect(recents).toHaveLength(12)
    expect(recents[0].id).toBe('14')
    expect(recents.some((entry) => entry.id === '0')).toBe(false)
  })

  it('forgetting a paper drops both the entry and its cached copy', () => {
    saveCachedPaper(paper('1', 'First'))
    expect(loadCachedPaper('1')).not.toBeNull()

    expect(forgetRecentPaper('1')).toEqual([])
    expect(loadCachedPaper('1')).toBeNull()
  })

  // A paper too big for the quota must still be listed, so it can be reopened by
  // fetching it again rather than vanishing from the reader's history.
  it('still remembers a paper that was too large to cache', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })

    saveCachedPaper(paper('9', 'Huge'))

    const [entry] = loadRecentPapers()
    expect(entry.id).toBe('9')
    expect(entry.cached).toBe(false)
  })
})

describe('open tabs', () => {
  const paper = (id: string, title: string): PaperDocument => ({
    id,
    metadata: { id, title, authors: ['Ada Lovelace'], abstract: 'a', categories: [], sourceUrl: 's', pdfUrl: 'p' },
    html: '<p>x</p>', outline: [], plainText: 'x', acronyms: [], importedAt: '2026-09-07T00:00:00.000Z',
  })

  it('restores the open papers and the one that was in front', () => {
    saveCachedPaper(paper('1', 'First'))
    saveCachedPaper(paper('2', 'Second'))
    saveOpenTabs(['1', '2'], '2')

    const restored = loadOpenTabs()
    expect(restored.papers.map((entry) => entry.id)).toEqual(['1', '2'])
    expect(restored.activeId).toBe('2')
  })

  // null is a real state, not "nothing saved": the import screen was in front.
  it('restores the import screen being in front of open tabs', () => {
    saveCachedPaper(paper('1', 'First'))
    saveOpenTabs(['1'], null)

    expect(loadOpenTabs().activeId).toBeNull()
  })

  it('drops a tab whose cached copy is gone rather than restoring it empty', () => {
    saveCachedPaper(paper('1', 'First'))
    saveOpenTabs(['1', 'evicted'], 'evicted')

    const restored = loadOpenTabs()
    expect(restored.papers.map((entry) => entry.id)).toEqual(['1'])
    expect(restored.activeId).toBe('1')
  })

  it('falls back to the last paper for a session saved before tabs existed', () => {
    saveCachedPaper(paper('1', 'First'))

    expect(loadOpenTabs().papers.map((entry) => entry.id)).toEqual(['1'])
  })
})
