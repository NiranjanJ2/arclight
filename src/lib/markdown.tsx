import type { ReactNode } from 'react'

// Arc answers in light markdown — the bullets prompt asks for "- " lines outright —
// which previously rendered as literal asterisks and backticks. This covers the
// subset a model actually emits here. It builds React nodes rather than HTML, so
// model output is never fed through dangerouslySetInnerHTML.
const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|(?<![*\w])\*[^*\n]+\*(?!\*)|(?<![_\w])_[^_\n]+_(?!\w))/g

function inline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(INLINE).filter(Boolean).map((part, index) => {
    const key = `${keyPrefix}-${index}`
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
