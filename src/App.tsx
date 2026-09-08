import { useEffect, useRef, useState } from 'react'
import { ImportScreen } from './components/ImportScreen'
import { ReaderShell } from './components/ReaderShell'
import { TabBar } from './components/TabBar'
import { samplePaper } from './data/samplePaper'
import { ApiError, importPaper } from './lib/api'
import { forgetLastPaper, forgetRecentPaper, loadCachedPaper, loadOpenTabs, loadRecentPapers, saveCachedPaper, saveOpenTabs } from './lib/paperCache'
import type { PaperDocument, ThemeName } from './types/paper'

const themes: ThemeName[] = ['dark', 'dim', 'light']

function initialTheme(): ThemeName {
  const saved = localStorage.getItem('arclight:theme') as ThemeName | null
  return saved && themes.includes(saved) ? saved : 'dark'
}

function initialScale(): number {
  const saved = Number(localStorage.getItem('arclight:text-scale'))
  return Number.isFinite(saved) && saved >= .8 && saved <= 2 ? saved : 1
}

export default function App() {
  // Restored once, so the tab list and the tab in front survive quitting the app.
  const [restored] = useState(loadOpenTabs)
  // Every open paper stays mounted so switching tabs keeps its reading position,
  // inline summaries and panel state; only the active one is displayed.
  const [openPapers, setOpenPapers] = useState<PaperDocument[]>(restored.papers)
  // null means the import screen is showing in place of a paper — the "new tab".
  const [activeId, setActiveId] = useState<string | null>(restored.activeId)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fallback, setFallback] = useState<{ sourceUrl?: string; pdfUrl?: string } | null>(null)
  const [theme, setTheme] = useState<ThemeName>(initialTheme)
  const [textScale, setTextScale] = useState(initialScale)
  const [recents, setRecents] = useState(loadRecentPapers)
  const importController = useRef<AbortController | null>(null)

  useEffect(() => () => importController.current?.abort(), [])

  useEffect(() => {
    saveOpenTabs(openPapers.map((paper) => paper.id), activeId)
  }, [openPapers, activeId])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('arclight:theme', theme) } catch { /* appearance still works for this session */ }
  }, [theme])

  useEffect(() => {
    document.documentElement.style.setProperty('--article-scale', String(textScale))
    try { localStorage.setItem('arclight:text-scale', String(textScale)) } catch { /* appearance still works for this session */ }
  }, [textScale])

  // Opening a paper that is already open focuses its tab rather than duplicating it,
  // which would give one paper two independent workspaces.
  const showPaper = (paper: PaperDocument) => {
    setOpenPapers((current) => current.some((open) => open.id === paper.id) ? current : [...current, paper])
    setActiveId(paper.id)
    setError('')
    setFallback(null)
  }

  const closePaper = (id: string) => {
    setOpenPapers((current) => {
      const index = current.findIndex((paper) => paper.id === id)
      const remaining = current.filter((paper) => paper.id !== id)
      setActiveId((active) => {
        if (active !== id) return active
        // Focus the neighbour that took its place, else the last tab, else the import screen.
        return remaining[index]?.id ?? remaining[remaining.length - 1]?.id ?? null
      })
      if (!remaining.length) forgetLastPaper()
      return remaining
    })
  }

  const openPaper = async (input: string) => {
    importController.current?.abort()
    const controller = new AbortController()
    importController.current = controller
    setLoading(true)
    setError('')
    setFallback(null)
    try {
      const imported = await importPaper(input, controller.signal)
      if (importController.current === controller) {
        saveCachedPaper(imported)
        setRecents(loadRecentPapers())
        showPaper(imported)
      }
    } catch (caught) {
      if (controller.signal.aborted) return
      setError(caught instanceof Error ? caught.message : 'The paper could not be imported.')
      if (caught instanceof ApiError) {
        const id = caught.sourceUrl?.match(/\/abs\/(.+)$/)?.[1]
        const cached = id ? loadCachedPaper(decodeURIComponent(id)) : null
        if (cached) {
          setError('')
          setFallback(null)
          showPaper(cached)
          return
        }
        setFallback({ sourceUrl: caught.sourceUrl, pdfUrl: caught.pdfUrl })
      }
    } finally {
      if (importController.current === controller) setLoading(false)
    }
  }

  // A remembered paper reopens from the local cache when it is still there, and
  // falls back to fetching it again when it is not.
  const openRecent = (id: string) => {
    const cached = loadCachedPaper(id)
    if (!cached) return void openPaper(id)
    saveCachedPaper(cached)
    setRecents(loadRecentPapers())
    showPaper(cached)
  }

  const openSample = () => {
    saveCachedPaper(samplePaper)
    setRecents(loadRecentPapers())
    showPaper(samplePaper)
  }

  const importScreen = (
    <ImportScreen
      loading={loading}
      error={error}
      fallback={fallback}
      onImport={openPaper}
      onSample={openSample}
      recents={recents}
      onOpenRecent={openRecent}
      onForgetRecent={(id) => setRecents(forgetRecentPaper(id))}
    />
  )

  if (!openPapers.length) return importScreen

  return (
    <div className="workspace">
      <TabBar
        papers={openPapers}
        activeId={activeId}
        onSelect={setActiveId}
        onClose={closePaper}
        onNew={() => setActiveId(null)}
      />
      <div className="workspace-body">
        <div className="workspace-pane" hidden={activeId !== null}>{activeId === null ? importScreen : null}</div>
        {openPapers.map((paper) => (
          <div className="workspace-pane" key={paper.id} hidden={paper.id !== activeId}>
            <ReaderShell
              paper={paper}
              active={paper.id === activeId}
              importLoading={loading}
              importError={error}
              importFallback={fallback}
              theme={theme}
              textScale={textScale}
              onBack={() => setActiveId(null)}
              onImport={openPaper}
              onCycleTheme={() => setTheme((current) => themes[(themes.indexOf(current) + 1) % themes.length])}
              onTextSize={(direction) => setTextScale((current) => Math.max(.8, Math.min(2, Math.round((current + direction * .1) * 100) / 100)))}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
