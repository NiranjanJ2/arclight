import { ArrowLeft, ArrowRight, ListTree, Minus, PanelRight, Plus, Search, SunMedium } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import type { ThemeName } from '../types/paper'

interface ReaderHeaderProps {
  progress: number
  loading: boolean
  error: string
  storageError: string
  fallback: { sourceUrl?: string; pdfUrl?: string } | null
  theme: ThemeName
  textScale: number
  outlineExpanded: boolean
  panelExpanded: boolean
  onBack: () => void
  onImport: (value: string) => void
  onToggleOutline: () => void
  onTogglePanel: () => void
  onCycleTheme: () => void
  onTextSize: (direction: -1 | 1) => void
}

export function ReaderHeader({ progress, loading, error, storageError, fallback, theme, textScale, outlineExpanded, panelExpanded, onBack, onImport, onToggleOutline, onTogglePanel, onCycleTheme, onTextSize }: ReaderHeaderProps) {
  const [value, setValue] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (value.trim()) onImport(value)
  }
  return (
    <header className="reader-header">
      <button className="brand brand-button" onClick={onBack} aria-label="Back to library"><span className="brand-sun" aria-hidden="true" />ArcLight</button>
      <div className="history-controls" aria-hidden="true">
        <button disabled><ArrowLeft size={16} /></button><button disabled><ArrowRight size={16} /></button>
      </div>
      <form className="compact-import" onSubmit={submit}>
        <Search size={15} aria-hidden="true" />
        <input aria-label="arXiv link or ID" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Paste an arXiv link or ID" disabled={loading} />
        <button aria-label="Open paper" disabled={loading || !value.trim()}>{loading ? <span className="spinner" aria-hidden="true" /> : <ArrowRight size={16} />}</button>
      </form>
      <div className="mobile-progress" aria-label={`${progress}% read`}><span>{progress}%</span><i><b style={{ width: `${progress}%` }} /></i></div>
      <div className="reader-actions">
        <details className="appearance-menu">
          <summary aria-label={`Reading appearance: ${theme} theme, ${Math.round(textScale * 100)}% text`}><SunMedium size={18} /><span>Reading appearance</span></summary>
          <div aria-label="Reading appearance controls">
            <button onClick={() => onTextSize(-1)} aria-label="Decrease text size"><Minus size={17} /></button>
            <button onClick={() => onTextSize(1)} aria-label="Increase text size"><Plus size={17} /></button>
            <button onClick={onCycleTheme} aria-label="Change reading theme"><SunMedium size={18} /></button>
          </div>
        </details>
        <button onClick={onToggleOutline} aria-label="Toggle paper outline" aria-controls="paper-outline" aria-expanded={outlineExpanded}><ListTree size={19} /></button>
        <button onClick={onTogglePanel} aria-label="Toggle workspace" aria-controls="reading-workspace" aria-expanded={panelExpanded}><PanelRight size={19} /></button>
      </div>
      {error || storageError ? <div className="reader-import-status" role="alert"><span>{error || storageError}</span>{error && fallback?.sourceUrl ? <a href={fallback.sourceUrl} target="_blank" rel="noreferrer">Source</a> : null}{error && fallback?.pdfUrl ? <a href={fallback.pdfUrl} target="_blank" rel="noreferrer">PDF</a> : null}</div> : null}
    </header>
  )
}
