import { ArrowRight, BookOpen, Clock, LockKeyhole, X } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import type { RecentPaper } from '../lib/paperCache'

interface ImportScreenProps {
  loading: boolean
  error: string
  fallback: { sourceUrl?: string; pdfUrl?: string } | null
  onImport: (value: string) => void
  onSample: () => void
  recents: RecentPaper[]
  onOpenRecent: (id: string) => void
  onForgetRecent: (id: string) => void
}

export function ImportScreen({ loading, error, fallback, onImport, onSample, recents, onOpenRecent, onForgetRecent }: ImportScreenProps) {
  const [value, setValue] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (value.trim()) onImport(value)
  }

  return (
    <div className="import-screen">
      <header className="landing-header">
        <a className="brand" href="#" aria-label="ArcLight home"><span className="brand-sun" aria-hidden="true" />ArcLight</a>
        <span className="local-note"><LockKeyhole size={14} /> Local by design</span>
      </header>
      <main className="import-stage">
        <div className="import-copy">
          <BookOpen className="import-book" size={38} strokeWidth={1.25} aria-hidden="true" />
          <h1>Read the paper,<br />not the PDF.</h1>
          <p>Turn an arXiv paper into a focused reading workspace with useful context exactly where you need it.</p>
        </div>
        <form className="import-form" onSubmit={submit}>
          <label htmlFor="paper-url">Paste an arXiv link or ID</label>
          <div className="import-input-wrap">
            <input
              id="paper-url"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="arxiv.org/abs/1706.03762"
              autoComplete="off"
              autoFocus
            />
            <button type="submit" aria-label="Open paper" disabled={loading || !value.trim()}>
              {loading ? <span className="spinner" aria-hidden="true" /> : <ArrowRight size={19} />}
            </button>
          </div>
          {error ? <div className="import-error" role="alert"><p>{error}</p>{fallback ? <div>{fallback.sourceUrl ? <a href={fallback.sourceUrl} target="_blank" rel="noreferrer" aria-label="Open arXiv source">Open source</a> : null}{fallback.pdfUrl ? <a href={fallback.pdfUrl} target="_blank" rel="noreferrer" aria-label="Open PDF">Open PDF</a> : null}</div> : null}</div> : null}
          <div className="sample-row">
            <span>Or start with a paper already on the desk.</span>
            <button type="button" className="text-button" onClick={onSample}>Explore the sample</button>
          </div>
        </form>
        {recents.length ? (
          <section className="recent-papers" aria-label="Recently opened papers">
            <p><Clock size={13} aria-hidden="true" /> Recently opened</p>
            <ul>
              {recents.map((paper) => (
                <li key={paper.id}>
                  <button type="button" className="recent-open" onClick={() => onOpenRecent(paper.id)} disabled={loading}>
                    <span className="recent-title">{paper.title}</span>
                    <span className="recent-meta">
                      {paper.authors[0] ?? 'Unknown author'}{paper.authors.length > 1 ? ` and ${paper.authors.length - 1} others` : ''} · {paper.id}
                      {paper.cached ? '' : ' · needs refetching'}
                    </span>
                  </button>
                  <button type="button" className="recent-forget" aria-label={`Forget ${paper.title}`} onClick={() => onForgetRecent(paper.id)}>
                    <X size={13} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <p className="privacy-copy">Your highlights and chats stay on this computer.</p>
      </main>
    </div>
  )
}
