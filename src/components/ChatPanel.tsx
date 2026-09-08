import { Crosshair, RotateCcw, Send, Sparkles } from 'lucide-react'
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react'
import type { ChatMessage, SerializedSelection } from '../types/paper'
import { renderMarkdown } from '../lib/markdown'

interface ChatPanelProps {
  messages: ChatMessage[]
  context: SerializedSelection | null
  pending: boolean
  onAsk: (question: string) => void
  onRetry?: (id: string) => void
  onShowQuote?: (quote: string) => void
}

export function ChatTranscript({ messages, context, pending, onRetry, onShowQuote }: Omit<ChatPanelProps, 'onAsk'>) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [messages, pending])
  return (
    <div className="chat-transcript" aria-live="polite">
      {context ? <div className="context-quote"><span>Selected passage</span><p>{context.quote}</p></div> : null}
      {!messages.length ? <div className="panel-empty"><Sparkles size={23} /><h2>Ask from the page.</h2><p>Select a passage or ask a question about the paper.</p></div> : null}
      {messages.map((message) => (
        <article key={message.id} className={`chat-message ${message.role} ${message.status ?? ''}`}>
          <span>{message.role === 'assistant' ? <><Sparkles size={13} /> Arc</> : 'You'}</span>
          <div className="chat-body">{renderMarkdown(message.content)}</div>
          {message.status === 'error' && onRetry ? <button className="retry-answer" aria-label="Retry answer" onClick={() => onRetry(message.id)}><RotateCcw size={13} /> Retry</button> : null}
          {message.showQuote && onShowQuote ? <button className="retry-answer" aria-label="Show this passage in the paper" onClick={() => onShowQuote(message.showQuote!)}><Crosshair size={13} /> Show me in the paper</button> : null}
        </article>
      ))}
      {pending ? <div className="chat-thinking"><i /><i /><i /><span>Reading the paper</span></div> : null}
      <div ref={endRef} />
    </div>
  )
}

export function ChatComposer({ pending, onAsk, hasContext = false }: Pick<ChatPanelProps, 'pending' | 'onAsk'> & { hasContext?: boolean }) {
  const [question, setQuestion] = useState('')
  const send = () => {
    const value = question.trim()
    if (!value || pending) return
    setQuestion('')
    onAsk(value)
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    send()
  }
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      send()
    }
  }
  return (
    <form className="chat-dock" onSubmit={submit}>
      <label htmlFor="quick-question">Ask Arc</label>
      <div>
        <textarea id="quick-question" aria-label="Ask about this paper" rows={2} value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={keyDown} placeholder={hasContext ? "Ask about the selected passage…" : "Ask a question about this paper…"} />
        <button type="submit" aria-label="Send question" disabled={!question.trim() || pending}><Send size={16} /></button>
      </div>
    </form>
  )
}
