import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { ChatMessage, InlineTransform, PaperDocument, PaperWorkspace, SerializedSelection, ThemeName } from '../types/paper'
import { loadWorkspace, saveWorkspace } from '../lib/storage'
import { askCodex } from '../lib/api'
import { findQuote, restoreRange, searchRanges } from '../lib/selection'
import { InsightPanel, type PanelTab } from './InsightPanel'
import { PaperArticle } from './PaperArticle'
import { PaperOutline } from './PaperOutline'
import { ReaderHeader } from './ReaderHeader'
import { SearchBar } from './SearchBar'
import { SelectionToolbar, type ActiveSelection, type SelectionAction } from './SelectionToolbar'

interface ReaderShellProps {
  paper: PaperDocument
  active: boolean
  importLoading: boolean
  importError: string
  importFallback: { sourceUrl?: string; pdfUrl?: string } | null
  theme: ThemeName
  textScale: number
  onBack: () => void
  onImport: (value: string) => void
  onCycleTheme: () => void
  onTextSize: (direction: -1 | 1) => void
}

// Arc ends a grounded answer with a SHOW: line naming the passage it leaned on. It
// is split off here so the reader sees prose, not a protocol line.
function splitShowQuote(answer: string): { content: string; showQuote?: string } {
  const match = answer.match(/\n\s*SHOW:\s*(.+?)\s*$/s)
  if (!match) return { content: answer.trim() }
  const quote = match[1].trim().replace(/^["“”']|["“”']$/g, '')
  return { content: answer.slice(0, match.index).trim(), showQuote: quote || undefined }
}

type Edge = 'rail' | 'panel'

const EDGES = {
  rail: { key: 'arclight:rail-width', fallback: 304, min: 210, max: 560 },
  panel: { key: 'arclight:panel-width', fallback: 376, min: 280, max: 620 },
} as const

function clampEdge(edge: Edge, value: number): number {
  const { min, max } = EDGES[edge]
  return Math.round(Math.min(max, Math.max(min, value)))
}

function loadWidth(edge: Edge): number {
  const { key, fallback, min, max } = EDGES[edge]
  const saved = Number(localStorage.getItem(key))
  return Number.isFinite(saved) && saved >= min && saved <= max ? saved : fallback
}

function saveWidth(edge: Edge, value: number): void {
  try { localStorage.setItem(EDGES[edge].key, String(value)) } catch { /* width still applies this session */ }
}

// The reading position is the last heading at or above the reading line. Exported
// so the rule can be checked without a layout engine.
export function activeSectionAt(sections: Array<{ id: string; top: number }>, line: number): string {
  let current = ''
  for (const section of sections) {
    if (section.top <= line) current = section.id
  }
  return current
}

export function ReaderShell({ paper, active, importLoading, importError, importFallback, theme, textScale, onBack, onImport, onCycleTheme, onTextSize }: ReaderShellProps) {
  const articleRef = useRef<HTMLElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState(0)
  // A hidden tab is display:none, which discards its scroll offset, so the last
  // position is kept and put back when the tab is shown again.
  const savedScroll = useRef(0)
  const [activeSection, setActiveSection] = useState(paper.outline[0]?.id ?? '')
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [compactLayout, setCompactLayout] = useState(() => window.matchMedia?.('(max-width: 1040px)').matches ?? false)
  const [activeTab, setActiveTab] = useState<PanelTab>('highlights')
  const [selection, setSelection] = useState<ActiveSelection | null>(null)
  const [context, setContext] = useState<SerializedSelection | null>(null)
  const [workspace, setWorkspace] = useState<PaperWorkspace>(() => loadWorkspace(paper.id))
  const transforms = workspace.transforms
  const setTransforms = useCallback((update: (current: InlineTransform[]) => InlineTransform[]) => {
    setWorkspace((current) => ({ ...current, transforms: update(current.transforms) }))
  }, [])
  const [chatPending, setChatPending] = useState(false)
  const [storageError, setStorageError] = useState('')
  const [railWidth, setRailWidth] = useState(() => loadWidth('rail'))
  const [panelWidth, setPanelWidth] = useState(() => loadWidth('panel'))
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchIndex, setSearchIndex] = useState(0)
  const searchHits = useRef<Range[]>([])
  const [searchTotal, setSearchTotal] = useState(0)
  const shouldSeedSample = useRef(Boolean(paper.isSample && (() => {
    try { return localStorage.getItem('arclight:sample-seeded') !== paper.id } catch { return true }
  })()))

  useEffect(() => {
    setProgress(0)
    setActiveSection(paper.outline[0]?.id ?? '')
  }, [paper])

  useEffect(() => {
    const root = articleRef.current
    if (!shouldSeedSample.current || !root) return
    shouldSeedSample.current = false
    try { localStorage.setItem('arclight:sample-seeded', paper.id) } catch { /* workspace warning is shown below */ }
    const source = root.textContent ?? ''
    const seeds = [
      {
        id: 'sample-transformer-highlight',
        quote: 'The paper proposes a simpler architecture: the Transformer relies on attention to model dependencies between every pair of positions.',
        sectionId: 'section-1-introduction',
        sectionTitle: '1 Introduction',
      },
      {
        id: 'sample-rnn-highlight',
        quote: 'A recurrent neural network (RNN) processes a sequence step by step.',
        sectionId: 'section-2-background',
        sectionTitle: '2 Background',
      },
    ].flatMap((seed) => {
      const start = source.indexOf(seed.quote)
      return start < 0 ? [] : [{ ...seed, start, end: start + seed.quote.length, createdAt: paper.importedAt }]
    })
    setWorkspace((current) => ({
      ...current,
      highlights: [...seeds, ...current.highlights.filter((highlight) => !seeds.some((seed) => seed.id === highlight.id))],
    }))
  }, [paper])

  useEffect(() => {
    setStorageError(saveWorkspace(paper.id, workspace) ? '' : 'Changes cannot be saved because browser storage is unavailable or full.')
  }, [paper.id, workspace])

  useEffect(() => {
    const media = window.matchMedia?.('(max-width: 1040px)')
    if (!media) return
    const updateLayout = () => setCompactLayout(media.matches)
    media.addEventListener('change', updateLayout)
    return () => media.removeEventListener('change', updateLayout)
  }, [])

  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        // Take over the browser's own find bar: it cannot see which pane is active,
        // and it would fight the highlight registry used below.
        event.preventDefault()
        setSearchOpen(true)
        return
      }
      if (event.key !== 'Escape') return
      setSearchOpen(false)
      setSelection(null)
      setOutlineOpen(false)
      setPanelOpen(false)
    }
    document.addEventListener('keydown', dismiss)
    return () => document.removeEventListener('keydown', dismiss)
  }, [])

  const onScroll = useCallback(() => {
    const root = scrollRef.current
    const article = articleRef.current
    if (!root || !article) return
    savedScroll.current = root.scrollTop
    const remaining = root.scrollHeight - root.clientHeight
    setProgress(remaining > 0 ? Math.min(100, Math.round((root.scrollTop / remaining) * 100)) : 100)
    // Derive the active section from where the headings actually sit rather than
    // from IntersectionObserver transitions: an observer only reports headings
    // that cross its band, so any jump (reload, outline click, fast scroll, or a
    // restored scroll position) left the outline pointing at a stale section.
    // Headings are re-queried per event rather than cached, because React
    // replaces the article subtree and detached nodes measure as top 0 — which
    // would make every section qualify and select the last one in the paper.
    if (remaining <= 0) return
    const line = root.getBoundingClientRect().top + root.clientHeight * 0.18
    const tops = paper.outline.map((section) => ({
      id: section.id,
      top: article.querySelector(`#${CSS.escape(section.id)}`)?.getBoundingClientRect().top ?? Infinity,
    }))
    const current = activeSectionAt(tops, line)
    if (current) setActiveSection(current)
  }, [paper])

  useEffect(() => { onScroll() }, [paper, onScroll])

  useEffect(() => {
    if (!active) return
    const root = scrollRef.current
    if (root && savedScroll.current) root.scrollTop = savedScroll.current
  }, [active])

  // Late-loading figures change scrollHeight after the last scroll event, which
  // would otherwise leave the progress reading stale until the next scroll.
  useEffect(() => {
    const article = articleRef.current
    if (!article || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(onScroll)
    observer.observe(article)
    return () => observer.disconnect()
  }, [onScroll, paper])

  // Take the reader to a passage Arc cited: scroll it into view and flash it using
  // the highlight registry, which paints over the text without touching the DOM.
  const focusQuote = useCallback((quote: string) => {
    const root = articleRef.current
    if (!root) return
    const located = findQuote(root, quote)
    const range = located && restoreRange(root, located)
    if (!range) return
    const anchor = range.startContainer.parentElement
    anchor?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const registry = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights
    const HighlightConstructor = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight
    if (!registry || !HighlightConstructor) return
    registry.set('arclight-focus', new HighlightConstructor(range))
    window.setTimeout(() => registry.delete('arclight-focus'), 2600)
  }, [articleRef])

  // Matches are painted through the highlight registry rather than by wrapping
  // nodes, so searching never disturbs a live selection or the article's DOM.
  useEffect(() => {
    const registry = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights
    const HighlightConstructor = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight
    const root = articleRef.current
    if (!registry || !HighlightConstructor) return
    if (!searchOpen || !root) {
      registry.delete('arclight-search')
      registry.delete('arclight-search-active')
      searchHits.current = []
      setSearchTotal(0)
      return
    }
    const hits = searchRanges(root, searchQuery)
    searchHits.current = hits
    setSearchTotal(hits.length)
    setSearchIndex(0)
    if (hits.length) registry.set('arclight-search', new HighlightConstructor(...hits))
    else registry.delete('arclight-search')
    registry.delete('arclight-search-active')
  }, [articleRef, searchOpen, searchQuery, paper])

  useEffect(() => {
    const registry = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights
    const HighlightConstructor = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight
    const current = searchHits.current[searchIndex]
    if (!registry || !HighlightConstructor || !current) return
    registry.set('arclight-search-active', new HighlightConstructor(current))
    current.startContainer.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [searchIndex, searchTotal])

  const stepSearch = useCallback((delta: 1 | -1) => {
    setSearchIndex((current) => {
      const total = searchHits.current.length
      if (!total) return 0
      // Wraps in both directions, the way a find bar is expected to.
      return (current + delta + total) % total
    })
  }, [])

  // Dragging an edge sets a width preference. Widths live in their own variables
  // rather than being written onto --outline-width/--panel-width, because
  // collapsing a side sets those to 0 from a class and an inline style would
  // outrank it — dragging would silently disable the collapse toggles.
  const startResize = useCallback((edge: Edge) => (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const setter = edge === 'rail' ? setRailWidth : setPanelWidth
    const startWidth = edge === 'rail' ? railWidth : panelWidth
    // The panel grows as the pointer moves left, so its delta is inverted.
    const direction = edge === 'rail' ? 1 : -1
    const move = (moveEvent: PointerEvent) =>
      setter(clampEdge(edge, startWidth + direction * (moveEvent.clientX - startX)))
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      document.body.classList.remove('is-resizing')
    }
    document.body.classList.add('is-resizing')
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }, [railWidth, panelWidth])

  const nudge = useCallback((edge: Edge) => (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowLeft' ? -16 : event.key === 'ArrowRight' ? 16 : 0
    if (!step) return
    event.preventDefault()
    const direction = edge === 'rail' ? 1 : -1
    const setter = edge === 'rail' ? setRailWidth : setPanelWidth
    setter((current) => clampEdge(edge, current + direction * step))
  }, [])

  useEffect(() => { saveWidth('rail', railWidth) }, [railWidth])
  useEffect(() => { saveWidth('panel', panelWidth) }, [panelWidth])

  const navigate = (id: string) => {
    articleRef.current?.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setOutlineOpen(false)
  }

  const revealPanel = () => setPanelOpen(compactLayout)

  const paperContext = {
    id: paper.metadata.id,
    title: paper.metadata.title,
    abstract: paper.metadata.abstract,
    plainText: paper.plainText,
  }

  const transformSelection = async (kind: InlineTransform['kind'], selected: SerializedSelection, existingId?: string) => {
    const id = existingId ?? globalThis.crypto?.randomUUID?.() ?? `transform-${Date.now()}`
    const pending: InlineTransform = {
      id, kind, start: selected.start, end: selected.end,
      quote: selected.quote, sectionTitle: selected.sectionTitle, answer: '', status: 'pending',
    }
    setTransforms((current) => existingId
      ? current.map((entry) => entry.id === id ? { ...entry, answer: '', status: 'pending' } : entry)
      : [...current, pending])
    const settle = (answer: string, status: InlineTransform['status']) =>
      setTransforms((current) => current.map((entry) => entry.id === id ? { ...entry, answer, status } : entry))
    try {
      settle(await askCodex({ action: kind, paper: paperContext, selection: { quote: selected.quote, sectionTitle: selected.sectionTitle } }), 'complete')
    } catch (error) {
      settle(error instanceof Error ? error.message : 'Codex could not answer this request.', 'error')
    }
  }

  // Read through a ref rather than from inside a state updater: updaters must stay
  // pure (StrictMode invokes them twice, which would fire two requests), and the
  // callback has to keep a stable identity because it is an effect dependency of
  // the article.
  const transformsRef = useRef(transforms)
  transformsRef.current = transforms

  const retryTransform = useCallback((id: string) => {
    const entry = transformsRef.current.find((candidate) => candidate.id === id)
    if (entry?.status === 'error') void transformSelection(entry.kind, entry, entry.id)
  }, [])

  const dismissTransform = useCallback((id: string) => {
    setTransforms((current) => current.filter((entry) => entry.id !== id))
  }, [])

  const selectionAction = (action: SelectionAction, selected: ActiveSelection) => {
    if (action === 'highlight') {
      const id = globalThis.crypto?.randomUUID?.() ?? `highlight-${Date.now()}`
      setWorkspace((current) => ({
        ...current,
        highlights: [...current.highlights, { ...selected, id, createdAt: new Date().toISOString() }],
      }))
      setActiveTab('highlights')
    } else if (action === 'summarize' || action === 'bullets' || action === 'simplify') {
      // The result replaces the passage in the article, so the workspace panel is
      // deliberately left alone here.
      void transformSelection(action, selected)
      setSelection(null)
      window.getSelection()?.removeAllRanges()
      return
    } else {
      // "Ask Arc" only stages the passage — the reader still has to type a question.
      // Summarize, Bullets and Simplify all answer immediately, so without moving the
      // caret into the composer this button looks like it did nothing at all.
      setContext(selected)
      setActiveTab('chat')
      requestAnimationFrame(() => document.getElementById('quick-question')?.focus())
    }
    revealPanel()
    setSelection(null)
    window.getSelection()?.removeAllRanges()
  }

  const askQuestion = async (question: string, retryErrorId?: string, retryContext?: Pick<SerializedSelection, 'quote' | 'sectionTitle'>) => {
    if (chatPending) return
    const requestContext = retryContext ?? context
    const userMessage: ChatMessage | null = retryErrorId ? null : { id: globalThis.crypto?.randomUUID?.() ?? `user-${Date.now()}`, role: 'user', content: question, createdAt: new Date().toISOString(), contextQuote: requestContext?.quote, contextSectionTitle: requestContext?.sectionTitle }
    const baseChat = retryErrorId ? workspace.chat.filter((message) => message.id !== retryErrorId) : workspace.chat
    const history = userMessage ? [...baseChat, userMessage] : baseChat
    setWorkspace((current) => ({
      ...current,
      chat: userMessage
        ? [...current.chat, userMessage]
        : current.chat.filter((message) => message.id !== retryErrorId),
    }))
    setActiveTab('chat')
    revealPanel()
    setChatPending(true)
    try {
      const answer = await askCodex({
        action: 'chat',
        paper: paperContext,
        selection: requestContext ? { quote: requestContext.quote, sectionTitle: requestContext.sectionTitle } : undefined,
        question,
        history: history.slice(-8).map(({ role, content }) => ({ role, content })),
      })
      const { content, showQuote } = splitShowQuote(answer)
      const assistantMessage: ChatMessage = { id: globalThis.crypto?.randomUUID?.() ?? `arc-${Date.now()}`, role: 'assistant', content, showQuote, status: 'complete', createdAt: new Date().toISOString() }
      setWorkspace((current) => ({ ...current, chat: [...current.chat, assistantMessage] }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Codex could not answer this request.'
      const assistantMessage: ChatMessage = { id: globalThis.crypto?.randomUUID?.() ?? `arc-${Date.now()}`, role: 'assistant', content: message, status: 'error', createdAt: new Date().toISOString() }
      setWorkspace((current) => ({ ...current, chat: [...current.chat, assistantMessage] }))
    } finally {
      setChatPending(false)
    }
  }

  const retryChat = (id: string) => {
    const failedIndex = workspace.chat.findIndex((message) => message.id === id)
    const question = workspace.chat.slice(0, failedIndex).reverse().find((message) => message.role === 'user')
    if (question) void askQuestion(question.content, id, question.contextQuote ? { quote: question.contextQuote, sectionTitle: question.contextSectionTitle } : undefined)
  }

  return (
    <div
      className={`reader-shell ${outlineOpen ? 'outline-toggle-active' : ''} ${panelOpen ? 'panel-toggle-active' : ''}`}
      // Type scales with the rail so a wider rail is genuinely more readable
      // rather than the same small text in a bigger column.
      style={{
        '--rail-width': `${railWidth}px`,
        '--rail-scale': railWidth / EDGES.rail.fallback,
        '--panel-width-pref': `${panelWidth}px`,
        '--panel-scale': panelWidth / EDGES.panel.fallback,
      } as CSSProperties}
    >
      <ReaderHeader progress={progress} loading={importLoading} error={importError} storageError={storageError} fallback={importFallback} theme={theme} textScale={textScale} outlineExpanded={compactLayout ? outlineOpen : !outlineOpen} panelExpanded={compactLayout ? panelOpen : !panelOpen} onBack={onBack} onImport={onImport} onToggleOutline={() => setOutlineOpen((open) => !open)} onTogglePanel={() => setPanelOpen((open) => !open)} onCycleTheme={onCycleTheme} onTextSize={onTextSize} />
      <PaperOutline paper={paper} progress={progress} activeSection={activeSection} open={outlineOpen} onNavigate={navigate} />
      {/* Both handles belong to the shell, not inside the panes: an absolutely
          positioned child of a scrolling pane scrolls away with its content. */}
      <div className="edge-resize rail-resize" role="separator" aria-orientation="vertical" aria-label="Resize outline" tabIndex={0} onPointerDown={startResize('rail')} onKeyDown={nudge('rail')} />
      <div className="edge-resize panel-resize" role="separator" aria-orientation="vertical" aria-label="Resize workspace" tabIndex={0} onPointerDown={startResize('panel')} onKeyDown={nudge('panel')} />
      <div className="paper-scroll" ref={scrollRef} onScroll={onScroll}>
        <PaperArticle paper={paper} articleRef={articleRef} highlights={workspace.highlights} transforms={transforms} onSelection={setSelection} onRetryTransform={retryTransform} onDismissTransform={dismissTransform} />
      </div>
      <InsightPanel open={panelOpen} onClose={() => setPanelOpen(false)} tab={activeTab} workspace={workspace} context={context} onTabChange={setActiveTab} onRemoveHighlight={(id) => setWorkspace((current) => ({ ...current, highlights: current.highlights.filter((highlight) => highlight.id !== id) }))} onRetryChat={retryChat} chatPending={chatPending} onAsk={askQuestion} onShowQuote={focusQuote} />
      {searchOpen ? (
        <SearchBar
          query={searchQuery}
          total={searchTotal}
          index={searchIndex}
          onQuery={setSearchQuery}
          onStep={stepSearch}
          onClose={() => setSearchOpen(false)}
        />
      ) : null}
      {selection ? <SelectionToolbar selection={selection} onAction={selectionAction} /> : null}
      {outlineOpen || panelOpen ? <button className="drawer-scrim" aria-label="Close drawer" onClick={() => { setOutlineOpen(false); setPanelOpen(false) }} /> : null}
    </div>
  )
}
