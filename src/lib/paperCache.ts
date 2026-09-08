import type { PaperDocument } from '../types/paper'

const CACHE_PREFIX = 'arclight:cached-paper:'
const LAST_PAPER_KEY = 'arclight:last-paper'
const RECENTS_KEY = 'arclight:recent-papers'
const OPEN_TABS_KEY = 'arclight:open-tabs'
const RECENT_LIMIT = 12
const paperKey = (id: string) => `${CACHE_PREFIX}${encodeURIComponent(id)}`

function isPaper(value: unknown): value is PaperDocument {
  const paper = value as Partial<PaperDocument> | null
  return Boolean(paper && typeof paper.id === 'string' && typeof paper.html === 'string'
    && typeof paper.plainText === 'string' && Array.isArray(paper.outline)
    && paper.metadata && typeof paper.metadata.title === 'string')
}

export function loadCachedPaper(id: string): PaperDocument | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(paperKey(id)) ?? 'null')
    return isPaper(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function loadLastPaper(): PaperDocument | null {
  try {
    const id = localStorage.getItem(LAST_PAPER_KEY)
    return id ? loadCachedPaper(id) : null
  } catch {
    return null
  }
}

// A small index kept beside the full cache. Reading the recents list must not mean
// parsing every cached paper, and a paper too large to cache should still be listed
// so it can be reopened by fetching it again.
export interface RecentPaper {
  id: string
  title: string
  authors: string[]
  openedAt: string
  cached: boolean
}

function isRecent(value: unknown): value is RecentPaper {
  const entry = value as Partial<RecentPaper> | null
  return Boolean(entry && typeof entry.id === 'string' && typeof entry.title === 'string'
    && Array.isArray(entry.authors) && typeof entry.openedAt === 'string')
}

export function loadRecentPapers(): RecentPaper[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isRecent) : []
  } catch {
    return []
  }
}

function writeRecents(entries: RecentPaper[]): RecentPaper[] {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(entries))
  } catch { /* the list is a convenience; losing it must not break opening a paper */ }
  return entries
}

export function rememberRecentPaper(paper: PaperDocument, cached: boolean): RecentPaper[] {
  const entry: RecentPaper = {
    id: paper.id,
    title: paper.metadata.title,
    authors: paper.metadata.authors,
    openedAt: new Date().toISOString(),
    cached,
  }
  // Most recent first, one entry per paper, oldest dropped past the limit.
  const rest = loadRecentPapers().filter((candidate) => candidate.id !== paper.id)
  return writeRecents([entry, ...rest].slice(0, RECENT_LIMIT))
}

export function forgetRecentPaper(id: string): RecentPaper[] {
  try { localStorage.removeItem(paperKey(id)) } catch { /* storage unavailable */ }
  return writeRecents(loadRecentPapers().filter((entry) => entry.id !== id))
}

export function saveCachedPaper(paper: PaperDocument): boolean {
  let cached = true
  try {
    localStorage.setItem(paperKey(paper.id), JSON.stringify(paper))
  } catch {
    // Usually the quota: the paper is still listed, just reopened by refetching.
    cached = false
  }
  try {
    localStorage.setItem(LAST_PAPER_KEY, paper.id)
  } catch { /* storage unavailable */ }
  rememberRecentPaper(paper, cached)
  return cached
}

export function forgetLastPaper(): void {
  try { localStorage.removeItem(LAST_PAPER_KEY) } catch { /* storage unavailable */ }
}

// Which papers were open, and which one was in front. Only the ids are stored; the
// documents themselves already live in the cache, so a tab whose cached copy has
// since been evicted is simply dropped rather than restored empty.
export interface OpenTabs {
  papers: PaperDocument[]
  activeId: string | null
}

export function saveOpenTabs(ids: string[], activeId: string | null): void {
  try { localStorage.setItem(OPEN_TABS_KEY, JSON.stringify({ ids, activeId })) } catch { /* storage unavailable */ }
}

export function loadOpenTabs(): OpenTabs {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(OPEN_TABS_KEY) ?? 'null')
    const saved = parsed as { ids?: unknown; activeId?: unknown } | null
    if (saved && Array.isArray(saved.ids)) {
      const papers = saved.ids
        .map((id) => (typeof id === 'string' ? loadCachedPaper(id) : null))
        .filter((paper): paper is PaperDocument => paper !== null)
      if (papers.length) {
        // null is a real state: the import screen was showing in front of open tabs.
        const active = saved.activeId
        const activeId = active === null
          ? null
          : typeof active === 'string' && papers.some((paper) => paper.id === active) ? active : papers[0].id
        return { papers, activeId }
      }
    }
  } catch { /* fall through to the pre-tabs behaviour below */ }
  // Sessions saved before tabs existed remembered only the last paper.
  const last = loadLastPaper()
  return last ? { papers: [last], activeId: last.id } : { papers: [], activeId: null }
}
