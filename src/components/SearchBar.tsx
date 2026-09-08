import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { type KeyboardEvent, useEffect, useRef } from 'react'

interface SearchBarProps {
  query: string
  total: number
  index: number
  onQuery: (value: string) => void
  onStep: (delta: 1 | -1) => void
  onClose: () => void
}

export function SearchBar({ query, total, index, onQuery, onStep, onClose }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  // select() alone does not focus an empty field, which left Cmd+F opening a bar
  // you could not type into.
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      onStep(event.shiftKey ? -1 : 1)
    }
    if (event.key === 'Escape') onClose()
  }

  return (
    <div className="search-bar" role="search">
      <Search size={14} aria-hidden="true" />
      <input
        ref={inputRef}
        value={query}
        aria-label="Find in paper"
        placeholder="Find in paper"
        onChange={(event) => onQuery(event.target.value)}
        onKeyDown={keyDown}
      />
      <span className="search-count">{query.trim().length < 2 ? '' : total ? `${index + 1} of ${total}` : 'No matches'}</span>
      <button aria-label="Previous match" disabled={!total} onClick={() => onStep(-1)}><ChevronUp size={15} /></button>
      <button aria-label="Next match" disabled={!total} onClick={() => onStep(1)}><ChevronDown size={15} /></button>
      <button aria-label="Close search" onClick={onClose}><X size={15} /></button>
    </div>
  )
}
