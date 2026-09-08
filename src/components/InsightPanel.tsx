import { Copy, Highlighter, Trash2 } from 'lucide-react'
import type { PaperWorkspace, SerializedSelection } from '../types/paper'
import { ChatComposer, ChatTranscript } from './ChatPanel'

export type PanelTab = 'highlights' | 'chat'

interface InsightPanelProps {
  open: boolean
  onClose: () => void
  tab: PanelTab
  workspace: PaperWorkspace
  context: SerializedSelection | null
  onTabChange: (tab: PanelTab) => void
  onRemoveHighlight: (id: string) => void
  onRetryChat: (id: string) => void
  chatPending: boolean
  onAsk: (question: string) => void
  onShowQuote: (quote: string) => void
}

export function InsightPanel({ open, onClose, tab, workspace, context, onTabChange, onRemoveHighlight, onRetryChat, chatPending, onAsk, onShowQuote }: InsightPanelProps) {
  const copy = (value: string) => navigator.clipboard?.writeText(value)
  return (
    <aside id="reading-workspace" className={`insight-panel ${open ? 'is-open' : ''}`} aria-label="Reading workspace">
      <div className="mobile-drag" aria-hidden="true" />
      <div className="panel-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'highlights'} onClick={() => onTabChange('highlights')}>Highlights</button>
        <button role="tab" aria-selected={tab === 'chat'} onClick={() => onTabChange('chat')}>Ask Arc</button>
      </div>
      <div className="panel-content">
        {tab === 'highlights' ? (
          workspace.highlights.length ? <div className="highlight-list">{workspace.highlights.map((highlight) => (
            <article className="highlight-row" key={highlight.id}>
              <blockquote>“{highlight.quote}”</blockquote>
              <footer><span>{highlight.sectionTitle ?? 'Paper selection'}</span><div><button aria-label="Copy highlight" onClick={() => copy(highlight.quote)}><Copy size={14} /></button><button aria-label="Remove highlight" onClick={() => onRemoveHighlight(highlight.id)}><Trash2 size={14} /></button></div></footer>
            </article>
          ))}</div> : <div className="panel-empty"><Highlighter size={23} /><h2>Your margin is clear.</h2><p>Select a passage to keep it close while you read.</p></div>
        ) : (
          <ChatTranscript messages={workspace.chat} context={context} pending={chatPending} onRetry={onRetryChat} onShowQuote={onShowQuote} />
        )}
      </div>
      <ChatComposer pending={chatPending} onAsk={onAsk} hasContext={Boolean(context)} />
      <button className="mobile-panel-close" onClick={onClose}>Return to paper</button>
    </aside>
  )
}
