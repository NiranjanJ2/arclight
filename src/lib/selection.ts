import type { SerializedSelection } from '../types/paper'

function normalizeQuote(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

// Generated text (an inline summary or bullet list) lives in the article DOM but
// must not exist as far as offsets are concerned: counting it would shift every
// saved highlight below it onto the wrong words. One filtered walk is the single
// definition of "the paper's text", shared by serialising and restoring.
export const GENERATED_ATTRIBUTE = 'data-arc-generated'

function textNodes(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.parentElement?.closest(`[${GENERATED_ATTRIBUTE}]`)
      ? NodeFilter.FILTER_REJECT
      : NodeFilter.FILTER_ACCEPT),
  })
  const nodes: Text[] = []
  let node = walker.nextNode()
  while (node) {
    nodes.push(node as Text)
    node = walker.nextNode()
  }
  return nodes
}

// Range.toString() would count generated text, so the prefix length is measured
// over the filtered nodes instead.
function textOffset(root: HTMLElement, container: Node, offset: number): number {
  const boundary = document.createRange()
  boundary.setStart(container, offset)
  boundary.collapse(true)
  let total = 0
  for (const node of textNodes(root)) {
    if (boundary.comparePoint(node, node.data.length) < 0) {
      total += node.data.length
      continue
    }
    if (container === node) total += offset
    break
  }
  return total
}

export function serializeRange(root: HTMLElement, range: Range): SerializedSelection | null {
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null
  const quote = range.toString()
  if (!normalizeQuote(quote)) return null

  const start = textOffset(root, range.startContainer, range.startOffset)
  const end = start + quote.length
  const startElement = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer as Element
    : range.startContainer.parentElement
  const section = startElement?.closest('section')
  const heading = section?.querySelector<HTMLElement>('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]')

  return {
    start,
    end,
    quote,
    sectionId: heading?.id,
    sectionTitle: heading?.textContent?.trim(),
  }
}

export function restoreRange(root: HTMLElement, selection: SerializedSelection): Range | null {
  if (selection.start < 0 || selection.end <= selection.start) return null
  const nodes = textNodes(root)
  let cursor = 0
  let startNode: Text | undefined
  let endNode: Text | undefined
  let startOffset = 0
  let endOffset = 0

  for (const node of nodes) {
    const next = cursor + node.data.length
    if (!startNode && selection.start >= cursor && selection.start <= next) {
      startNode = node
      startOffset = selection.start - cursor
    }
    if (selection.end >= cursor && selection.end <= next) {
      endNode = node
      endOffset = selection.end - cursor
      break
    }
    cursor = next
  }
  if (!startNode || !endNode) return null

  const range = document.createRange()
  range.setStart(startNode, startOffset)
  range.setEnd(endNode, endOffset)
  return normalizeQuote(range.toString()) === normalizeQuote(selection.quote) ? range : null
}

// Locates a passage Arc quoted back, so the reader can be shown where it came from.
// The model rarely reproduces whitespace exactly, so an exact hit is tried first and
// then a whitespace-insensitive pass that maps back to real offsets.
export function findQuote(root: HTMLElement, quote: string): SerializedSelection | null {
  const wanted = quote.trim()
  if (wanted.length < 8) return null
  const nodes = textNodes(root)
  const haystack = nodes.map((node) => node.data).join('')

  const exact = haystack.indexOf(wanted)
  if (exact >= 0) return { start: exact, end: exact + wanted.length, quote: wanted }

  // Collapse runs of whitespace in both, keeping an index back into the original.
  const map: number[] = []
  let flat = ''
  let pendingSpace = false
  for (let index = 0; index < haystack.length; index += 1) {
    const character = haystack[index]
    if (/\s/.test(character)) {
      pendingSpace = flat.length > 0
      continue
    }
    if (pendingSpace) {
      map.push(index)
      flat += ' '
      pendingSpace = false
    }
    map.push(index)
    flat += character
  }
  const needle = wanted.replace(/\s+/g, ' ')
  const loose = flat.indexOf(needle)
  if (loose < 0) return null
  const start = map[loose]
  const last = map[loose + needle.length - 1]
  if (start === undefined || last === undefined) return null
  return { start, end: last + 1, quote: haystack.slice(start, last + 1) }
}

function rangeBetween(nodes: Text[], start: number, end: number): Range | null {
  let cursor = 0
  let startNode: Text | undefined
  let endNode: Text | undefined
  let startOffset = 0
  let endOffset = 0
  for (const node of nodes) {
    const next = cursor + node.data.length
    if (!startNode && start >= cursor && start < next) {
      startNode = node
      startOffset = start - cursor
    }
    if (startNode && end > cursor && end <= next) {
      endNode = node
      endOffset = end - cursor
      break
    }
    cursor = next
  }
  if (!startNode || !endNode) return null
  const range = document.createRange()
  range.setStart(startNode, startOffset)
  range.setEnd(endNode, endOffset)
  return range
}

// Every occurrence of a search term, as ranges. Generated text is excluded by the
// shared walk, so searching does not match a summary Arc wrote over the passage.
// Capped because a one-letter term in a long paper would otherwise build thousands
// of ranges on every keystroke.
export function searchRanges(root: HTMLElement, query: string, limit = 400): Range[] {
  const needle = query.trim().toLowerCase()
  if (needle.length < 2) return []
  const nodes = textNodes(root)
  const haystack = nodes.map((node) => node.data).join('').toLowerCase()
  const ranges: Range[] = []
  let from = 0
  while (ranges.length < limit) {
    const at = haystack.indexOf(needle, from)
    if (at < 0) break
    const range = rangeBetween(nodes, at, at + needle.length)
    if (range) ranges.push(range)
    from = at + needle.length
  }
  return ranges
}
