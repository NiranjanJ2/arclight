import { ArrowUpRight, Download } from 'lucide-react'
import type { PaperDocument } from '../types/paper'

interface PaperOutlineProps {
  paper: PaperDocument
  progress: number
  activeSection: string
  open: boolean
  onNavigate: (id: string) => void
}

export function PaperOutline({ paper, progress, activeSection, open, onNavigate }: PaperOutlineProps) {
  const authorSummary = paper.metadata.authors.length > 1
    ? `${paper.metadata.authors[0]} and ${paper.metadata.authors.length - 1} others`
    : paper.metadata.authors[0] ?? 'Unknown authors'

  return (
    <aside id="paper-outline" className={`outline-rail ${open ? 'is-open' : ''}`}>
      <div className="reading-filament" aria-hidden="true"><span style={{ top: `${Math.max(4, Math.min(94, progress))}%` }} /></div>
      <div className="paper-identity">
        <p className="rail-title">{paper.metadata.title}</p>
        <p className="rail-authors">{authorSummary}</p>
        <a href={paper.metadata.sourceUrl} target="_blank" rel="noreferrer">arXiv: {paper.metadata.id} <ArrowUpRight size={13} /></a>
      </div>
      <div className="rail-progress"><span>{progress}% read</span><i><b style={{ width: `${progress}%` }} /></i></div>
      <div className="rail-utilities">
        <a href={paper.metadata.pdfUrl} target="_blank" rel="noreferrer" aria-label="Download PDF"><Download size={16} /></a>
      </div>
      <nav className="outline-nav" aria-label="Paper outline">
        <p>Outline</p>
        {paper.outline.map((section) => (
          <button
            key={section.id}
            className={section.id === activeSection ? 'active' : ''}
            style={{ paddingLeft: `${14 + Math.max(0, section.depth - 2) * 18}px` }}
            onClick={() => onNavigate(section.id)}
          >{section.title}</button>
        ))}
      </nav>
    </aside>
  )
}
