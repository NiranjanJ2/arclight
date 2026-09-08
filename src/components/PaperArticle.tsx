import DOMPurify from 'dompurify'
import { memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type RefObject } from 'react'
import type { InlineTransform, PaperDocument, SavedHighlight } from '../types/paper'
import { GENERATED_ATTRIBUTE, restoreRange, serializeRange } from '../lib/selection'
import type { ActiveSelection } from './SelectionToolbar'

interface PaperArticleProps {
  paper: PaperDocument
  articleRef: RefObject<HTMLElement | null>
  highlights: SavedHighlight[]
  transforms: InlineTransform[]
  onSelection: (selection: ActiveSelection | null) => void
  onRetryTransform: (id: string) => void
  onDismissTransform: (id: string) => void
}

function applyFallbackHighlights(root: HTMLElement, highlights: SavedHighlight[]) {
  root.querySelectorAll('mark[data-arclight-highlight]').forEach((mark) => mark.replaceWith(...mark.childNodes))
  root.normalize()
  const nodes: Array<{ node: Text; start: number; end: number }> = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let cursor = 0
  let current = walker.nextNode()
  while (current) {
    const node = current as Text
    nodes.push({ node, start: cursor, end: cursor + node.data.length })
    cursor += node.data.length
    current = walker.nextNode()
  }
  const segments: Array<{ node: Text; start: number; end: number; order: number }> = []
  for (const highlight of highlights) {
    for (const entry of nodes) {
      const start = Math.max(highlight.start, entry.start)
      const end = Math.min(highlight.end, entry.end)
      if (start < end) segments.push({ node: entry.node, start: start - entry.start, end: end - entry.start, order: start })
    }
  }
  segments.sort((a, b) => b.order - a.order).forEach(({ node, start, end }) => {
    if (!node.isConnected) return
    const selected = end < node.data.length ? node.splitText(end) && node : node
    const target = start > 0 ? selected.splitText(start) : selected
    const mark = document.createElement('mark')
    mark.dataset.arclightHighlight = 'true'
    target.replaceWith(mark)
    mark.append(target)
  })
}

// The sanitized paper is injected with dangerouslySetInnerHTML, and React rewrites
// that subtree on every render of the parent — replacing every node and destroying
// any live text selection with it, which is why a drag flashed and vanished.
// Isolating it behind memo compares the html string by value, so an unchanged
// paper leaves the existing DOM completely untouched.
const PaperBody = memo(function PaperBody({ html, onClick }: { html: string; onClick: (event: MouseEvent) => void }) {
  return <div className="paper-body" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
})


// The article transforms are built with DOM APIs rather than React, so the shared
// markdown renderer is mirrored here as plain nodes. Text is only ever set through
// textContent, so a model cannot inject markup.
function markdownFragment(source: string): DocumentFragment {
  const fragment = document.createDocumentFragment()
  const inlineInto = (parent: Node, text: string) => {
    for (const part of text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)) {
      if (!part) continue
      if (part.startsWith('**') && part.endsWith('**')) {
        const strong = document.createElement('strong')
        strong.textContent = part.slice(2, -2)
        parent.appendChild(strong)
      } else if (part.startsWith('`') && part.endsWith('`')) {
        const code = document.createElement('code')
        code.textContent = part.slice(1, -1)
        parent.appendChild(code)
      } else {
        parent.appendChild(document.createTextNode(part))
      }
    }
  }
  let list: HTMLUListElement | null = null
  for (const line of source.split(/\r?\n/)) {
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/)
    if (bullet) {
      if (!list) { list = document.createElement('ul'); fragment.appendChild(list) }
      const item = document.createElement('li')
      inlineInto(item, bullet[1])
      list.appendChild(item)
      continue
    }
    list = null
    if (!line.trim()) continue
    const paragraph = document.createElement('p')
    inlineInto(paragraph, line.trim())
    fragment.appendChild(paragraph)
  }
  return fragment
}

const KIND_LABEL: Record<InlineTransform['kind'], string> = { summarize: 'Summary', bullets: 'Bullets', simplify: 'In plain English' }

// The transform is built directly in the article DOM rather than through React,
// because the paper itself is injected HTML that React does not model. The original
// nodes are kept as children of the wrapper so flipping back is just a class
// change, and everything generated sits inside the marked subtree that the offset
// walk ignores — so highlights further down the paper never shift.
function applyTransforms(
  root: HTMLElement,
  transforms: InlineTransform[],
  onRetry: (id: string) => void,
  onDismiss: (id: string) => void,
): () => void {
  const wrappers: HTMLElement[] = []
  for (const transform of transforms) {
    const range = restoreRange(root, transform)
    if (!range) continue

    const wrapper = document.createElement('span')
    wrapper.className = 'arc-transform is-generated'
    wrapper.dataset.arcTransform = transform.id
    try {
      wrapper.append(range.extractContents())
      range.insertNode(wrapper)
    } catch {
      continue
    }

    // Everything already in the wrapper is the untouched passage.
    const original = document.createElement('span')
    original.className = 'arc-original'
    original.append(...wrapper.childNodes)
    wrapper.append(original)

    const generated = document.createElement('span')
    generated.className = 'arc-generated'
    generated.setAttribute(GENERATED_ATTRIBUTE, 'true')

    const label = document.createElement('span')
    label.className = 'arc-generated-label'
    label.textContent = transform.status === 'pending' ? `${KIND_LABEL[transform.kind]}…` : KIND_LABEL[transform.kind]

    const answer = document.createElement('span')
    answer.className = 'arc-generated-body'
    answer.textContent = transform.status === 'pending'
      ? (transform.kind === 'simplify' ? 'Putting this in plain English…' : 'Condensing this passage…')
      : transform.answer
    if (transform.status !== 'pending') {
      // Same light markdown as the chat, rendered into a detached node so nothing
      // model-authored is ever assigned as HTML.
      answer.textContent = ''
      answer.append(markdownFragment(transform.answer))
    }

    const actions = document.createElement('span')
    actions.className = 'arc-actions'

    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'arc-toggle'
    toggle.textContent = 'Show full text'
    // Which version is showing is view state only, so it is flipped on the node
    // instead of in React — re-rendering here would rebuild every transform.
    toggle.addEventListener('click', () => {
      const showingOriginal = wrapper.classList.toggle('is-original')
      wrapper.classList.toggle('is-generated', !showingOriginal)
      toggle.textContent = showingOriginal ? `Show ${KIND_LABEL[transform.kind].toLowerCase()}` : 'Show full text'
    })
    actions.append(toggle)

    if (transform.status === 'error') {
      wrapper.classList.add('is-error')
      const retry = document.createElement('button')
      retry.type = 'button'
      retry.className = 'arc-toggle'
      retry.textContent = 'Retry'
      retry.addEventListener('click', () => onRetry(transform.id))
      actions.append(retry)
    }

    const dismiss = document.createElement('button')
    dismiss.type = 'button'
    dismiss.className = 'arc-toggle'
    dismiss.textContent = 'Restore passage'
    dismiss.addEventListener('click', () => onDismiss(transform.id))
    actions.append(dismiss)

    generated.append(label, answer, actions)
    wrapper.append(generated)
    wrappers.push(wrapper)
  }

  return () => {
    for (const wrapper of wrappers) {
      if (!wrapper.isConnected) continue
      const original = wrapper.querySelector(':scope > .arc-original')
      // Put the paper back exactly as it was before the wrapper went in.
      if (original) wrapper.replaceWith(...original.childNodes)
      else wrapper.remove()
    }
  }
}

export function PaperArticle({ paper, articleRef, highlights, transforms, onSelection, onRetryTransform, onDismissTransform }: PaperArticleProps) {
  const cleanHtml = useMemo(() => DOMPurify.sanitize(paper.html, {
    USE_PROFILES: { html: true, mathMl: true, svg: true },
    ADD_ATTR: ['data-expansion', 'tabindex', 'target'],
  }), [paper.html])
  const authorLine = paper.metadata.authors.join(', ')

  useEffect(() => {
    const root = articleRef.current
    if (!root) return
    const restored = highlights.flatMap((highlight) => {
      const range = restoreRange(root, highlight)
      return range ? [{ highlight, range }] : []
    })
    const ranges = restored.map(({ range }) => range)
    const cssRegistry = typeof CSS === 'undefined' ? undefined : (CSS as unknown as { highlights?: Map<string, unknown> }).highlights
    const HighlightConstructor = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight
    if (cssRegistry && HighlightConstructor) {
      cssRegistry.set('arclight-saved', new HighlightConstructor(...ranges))
      return () => { cssRegistry.delete('arclight-saved') }
    }
    applyFallbackHighlights(root, restored.map(({ highlight }) => highlight))
  }, [articleRef, cleanHtml, highlights])

  useEffect(() => {
    const root = articleRef.current
    if (!root || !transforms.length) return
    return applyTransforms(root, transforms, onRetryTransform, onDismissTransform)
  }, [articleRef, cleanHtml, transforms, onRetryTransform, onDismissTransform])

  const captureSelection = useCallback((clearWhenEmpty: boolean) => {
    const root = articleRef.current
    const nativeSelection = window.getSelection()
    if (!root || !nativeSelection?.rangeCount || nativeSelection.isCollapsed) {
      if (clearWhenEmpty) onSelection(null)
      return
    }
    const range = nativeSelection.getRangeAt(0)
    const serialized = serializeRange(root, range)
    if (!serialized) return onSelection(null)
    const rectangle = range.getBoundingClientRect()
    const x = Math.max(160, Math.min(window.innerWidth - 160, rectangle.left + rectangle.width / 2))
    const y = Math.max(66, rectangle.top - 12)
    onSelection({ ...serialized, x, y })
  }, [articleRef, onSelection])

  // While a drag is in progress the browser fires selectionchange continuously.
  // Capturing on each one re-rendered the article mid-drag, and the highlight
  // effect below then tore down and re-registered its ranges — destroying the
  // selection's anchor node. Chrome recovers by re-anchoring to the start of the
  // container, which is why a drag either vanished or selected everything above
  // the cursor. Pointer selections are captured once, on release; selectionchange
  // is left to serve keyboard selection only.
  const pointerSelecting = useRef(false)

  useEffect(() => {
    const down = () => { pointerSelecting.current = true }
    const up = (event: Event) => {
      pointerSelecting.current = false
      // Releasing on the toolbar is the user acting on the selection, not making
      // a new one; recapturing there would clear it before the button's own
      // handler runs. A drag that ends anywhere else is still captured, so
      // releasing outside the article keeps working.
      if ((event.target as Element | null)?.closest?.('.selection-toolbar')) return
      captureSelection(true)
    }
    const keyboardSelection = () => { if (!pointerSelecting.current) captureSelection(false) }
    // Both families are bound: pointer events cover mouse, pen and touch, while
    // mouseup remains the only one some environments dispatch.
    for (const type of ['pointerdown', 'mousedown']) document.addEventListener(type, down, true)
    for (const type of ['pointerup', 'mouseup']) document.addEventListener(type, up, true)
    document.addEventListener('selectionchange', keyboardSelection)
    return () => {
      for (const type of ['pointerdown', 'mousedown']) document.removeEventListener(type, down, true)
      for (const type of ['pointerup', 'mouseup']) document.removeEventListener(type, up, true)
      document.removeEventListener('selectionchange', keyboardSelection)
    }
  }, [captureSelection])

  // Paper figures are unreadable at the reading measure, so clicking one opens it
  // full size. <dialog> is used for the free Escape handling and focus trapping.
  const [zoomed, setZoomed] = useState<{ src: string; alt: string } | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (zoomed && !dialog.open) dialog.showModal()
    if (!zoomed && dialog.open) dialog.close()
  }, [zoomed])

  const zoomFigure = useCallback((event: MouseEvent) => {
    const image = (event.target as HTMLElement).closest('img')
    if (!image) return
    setZoomed({ src: image.currentSrc || image.src, alt: image.alt })
  }, [])

  return (
    <article className="paper-article" ref={articleRef} aria-label={paper.metadata.title} onKeyUp={() => captureSelection(true)}>
      <header className="paper-heading">
        <h1>{paper.metadata.title}</h1>
        <p>{authorLine}</p>
      </header>
      <PaperBody html={cleanHtml} onClick={zoomFigure} />
      <dialog className="figure-zoom" ref={dialogRef} onClose={() => setZoomed(null)} onClick={() => setZoomed(null)}>
        {zoomed ? <img src={zoomed.src} alt={zoomed.alt} /> : null}
      </dialog>
    </article>
  )
}
