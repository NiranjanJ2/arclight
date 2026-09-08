import type { ReactNode } from 'react'

// Arc answers in light markdown — the bullets prompt asks for "- " lines outright —
// which previously rendered as literal asterisks and backticks. This covers the
// subset a model actually emits here. It builds React nodes rather than HTML, so
// model output is never fed through dangerouslySetInnerHTML.
// $…$, \(…\) and \[…\] are captured so LaTeX is laid out rather than printed raw.
const INLINE = /(\$\$[^$]+\$\$|\$[^$\n]+\$|\\\([^)]*\\\)|\\\[[^\]]*\\\]|\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|(?<![*\w])\*[^*\n]+\*(?!\*)|(?<![_\w])_[^_\n]+_(?!\w))/g

// A chat answer is prose, so full math typesetting would be overkill (and a new
// dependency). The common commands become the characters they stand for, and
// sub/superscripts become real elements, which covers what these answers contain.
const SYMBOLS: Record<string, string> = {
  leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', times: '×',
  cdot: '·', pm: '±', infty: '∞', rightarrow: '→', to: '→', leftarrow: '←', in: '∈',
  notin: '∉', sum: '∑', prod: '∏', sqrt: '√', alpha: 'α', beta: 'β', gamma: 'γ',
  delta: 'δ', epsilon: 'ε', theta: 'θ', lambda: 'λ', mu: 'μ', sigma: 'σ', tau: 'τ',
  phi: 'φ', omega: 'ω', Delta: 'Δ', Sigma: 'Σ', Omega: 'Ω', ldots: '…', cdots: '⋯',
}

function stripMathDelimiters(source: string): string {
  const trimmed = source.trim()
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) return trimmed.slice(2, -2).trim()
  if (trimmed.startsWith('$') && trimmed.endsWith('$')) return trimmed.slice(1, -1).trim()
  if (trimmed.startsWith('\\(') && trimmed.endsWith('\\)')) return trimmed.slice(2, -2).trim()
  if (trimmed.startsWith('\\[') && trimmed.endsWith('\\]')) return trimmed.slice(2, -2).trim()
  return trimmed
}

export function renderMath(source: string, keyPrefix: string): ReactNode {
  let text = stripMathDelimiters(source)
  text = text.replace(/\\([A-Za-z]+)/g, (whole, name: string) => SYMBOLS[name] ?? name)
  const parts = text.split(/(_\{[^}]*\}|\^\{[^}]*\}|_[A-Za-z0-9]|\^[A-Za-z0-9])/g).filter(Boolean)
  return (
    <span className="chat-math" key={keyPrefix}>
      {parts.map((part, index) => {
        const key = `${keyPrefix}-m${index}`
        if (part.startsWith('_')) return <sub key={key}>{part.replace(/^_\{?|\}$/g, '')}</sub>
        if (part.startsWith('^')) return <sup key={key}>{part.replace(/^\^\{?|\}$/g, '')}</sup>
        return <span key={key}>{part.replace(/[{}]/g, '')}</span>
      })}
    </span>
  )
}

function inline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(INLINE).filter(Boolean).map((part, index) => {
    const key = `${keyPrefix}-${index}`
    if (/^(\$|\\\(|\\\[)/.test(part)) return renderMath(part, key)
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)
    // Only http(s) links are rendered; anything else stays as text.
    if (link && /^https?:\/\//.test(link[2])) return <a key={key} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={key}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={key}>{part.slice(1, -1)}</code>
    if (part.startsWith('*') && part.endsWith('*')) return <em key={key}>{part.slice(1, -1)}</em>
    if (part.startsWith('_') && part.endsWith('_')) return <em key={key}>{part.slice(1, -1)}</em>
    return <span key={key}>{part}</span>
  })
}

const BULLET = /^\s*[-*•]\s+(.*)$/
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/

export function renderMarkdown(source: string): ReactNode {
  const lines = (source ?? '').split(/\r?\n/)
  const blocks: ReactNode[] = []
  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null

  const flushParagraph = () => {
    if (!paragraph.length) return
    const text = paragraph.join(' ')
    blocks.push(<p key={`p-${blocks.length}`}>{inline(text, `p${blocks.length}`)}</p>)
    paragraph = []
  }
  const flushList = () => {
    if (!list) return
    const { ordered, items } = list
    const rendered = items.map((item, index) => <li key={index}>{inline(item, `l${blocks.length}-${index}`)}</li>)
    blocks.push(ordered
      ? <ol key={`l-${blocks.length}`}>{rendered}</ol>
      : <ul key={`l-${blocks.length}`}>{rendered}</ul>)
    list = null
  }

  for (const line of lines) {
    if (!line.trim()) {
      flushParagraph()
      flushList()
      continue
    }
    const heading = line.match(/^\s*(#{1,4})\s+(.*)$/)
    if (heading) {
      flushParagraph()
      flushList()
      blocks.push(<p className="chat-heading" key={`h-${blocks.length}`}>{inline(heading[2], `h${blocks.length}`)}</p>)
      continue
    }
    const bullet = line.match(BULLET)
    const numbered = line.match(NUMBERED)
    if (bullet || numbered) {
      flushParagraph()
      const ordered = Boolean(numbered)
      // A change of list kind starts a new list rather than mixing markers.
      if (list && list.ordered !== ordered) flushList()
      if (!list) list = { ordered, items: [] }
      list.items.push((bullet ? bullet[1] : numbered![2]).trim())
      continue
    }
    flushList()
    paragraph.push(line.trim())
  }
  flushParagraph()
  flushList()
  return blocks
}
