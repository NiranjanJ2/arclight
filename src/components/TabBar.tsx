import { Plus, X } from 'lucide-react'
import type { PaperDocument } from '../types/paper'

interface TabBarProps {
  papers: PaperDocument[]
  activeId: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
}

export function TabBar({ papers, activeId, onSelect, onClose, onNew }: TabBarProps) {
  return (
    <div className="tab-bar" role="tablist" aria-label="Open papers">
      {papers.map((paper) => (
        <div key={paper.id} className={`tab ${paper.id === activeId ? 'is-active' : ''}`}>
          <button
            role="tab"
            aria-selected={paper.id === activeId}
            title={paper.metadata.title}
            onClick={() => onSelect(paper.id)}
          >{paper.metadata.title}</button>
          <button className="tab-close" aria-label={`Close ${paper.metadata.title}`} onClick={() => onClose(paper.id)}>
            <X size={12} />
          </button>
        </div>
      ))}
      <button
        className={`tab-new ${activeId === null ? 'is-active' : ''}`}
        aria-label="Open another paper"
        onClick={onNew}
      ><Plus size={15} /></button>
    </div>
  )
}
