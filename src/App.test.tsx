import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { PaperDocument } from './types/paper'

const importedPaper: PaperDocument = {
  id: '1706.03762',
  metadata: {
    id: '1706.03762',
    title: 'Attention Is All You Need',
    authors: ['Ashish Vaswani', 'Noam Shazeer'],
    abstract: 'A transformer paper.',
    categories: ['cs.CL'],
    sourceUrl: 'https://arxiv.org/abs/1706.03762',
    pdfUrl: 'https://arxiv.org/pdf/1706.03762.pdf',
  },
  html: '<section><h2 id="section-1-introduction">1 Introduction</h2><p>A transformer paper.</p></section>',
  outline: [{ id: 'section-1-introduction', title: '1 Introduction', depth: 2 }],
  plainText: '1 Introduction A transformer paper.',
  acronyms: [],
  importedAt: '2026-09-06T00:00:00.000Z',
}

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('ArcLight reader flow', () => {
  it('imports an arXiv URL and opens the structured reader', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ paper: importedPaper }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })))
    render(<App />)

    await user.type(screen.getByRole('textbox', { name: /arxiv/i }), 'https://arxiv.org/abs/1706.03762')
    await user.click(screen.getByRole('button', { name: 'Open paper' }))

    expect(await screen.findByRole('heading', { name: 'Attention Is All You Need', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Paper outline' })).toHaveTextContent('1 Introduction')
    expect(screen.getByText('A transformer paper.')).toBeInTheDocument()
  })

  it('restores the last imported paper without another network request', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })).mockResolvedValueOnce(new Response(JSON.stringify({ paper: importedPaper }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const first = render(<App />)
    await user.type(screen.getByRole('textbox', { name: /arxiv/i }), '1706.03762')
    await user.click(screen.getByRole('button', { name: 'Open paper' }))
    await screen.findByRole('heading', { name: 'Attention Is All You Need', level: 1 })
    first.unmount()

    render(<App />)

    expect(screen.getByRole('heading', { name: 'Attention Is All You Need', level: 1 })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('loads the bundled sample without using the network', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Explore the sample' }))

    expect(screen.getByRole('heading', { name: 'Attention Is All You Need', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Paper outline' })).toHaveTextContent('3 Model Architecture')
    expect(screen.getAllByRole('button', { name: 'Remove highlight' })).toHaveLength(2)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('turns a paper selection into a persistent highlight', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Explore the sample' }))
    const article = screen.getByRole('article', { name: 'Attention Is All You Need' })
    const paragraph = within(article).getByText(/Sequence transduction problems are usually framed/)
    const text = paragraph.firstChild!
    const range = document.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 31)
    Object.defineProperty(range, 'getBoundingClientRect', {
      value: () => ({ left: 300, right: 520, top: 280, bottom: 310, width: 220, height: 30, x: 300, y: 280, toJSON() {} }),
    })
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)

    fireEvent.mouseDown(paragraph)
    fireEvent.mouseUp(paragraph)
    await user.click(await screen.findByRole('button', { name: 'Keep highlight' }))

    expect(screen.getByText('Sequence transduction problems')).toBeInTheDocument()
    expect(localStorage.getItem('arclight:paper:sample%3Aattention-is-all-you-need')).toContain('Sequence transduction problems')
  })

  it('keeps sample annotations separate and merges sample seeds with existing notes', async () => {
    const user = userEvent.setup()
    const liveWorkspace = JSON.stringify({ version: 1, highlights: [{ id: 'live', start: 0, end: 4, quote: 'Live', createdAt: '2026-09-06T00:00:00.000Z' }], notes: [], chat: [] })
    const sampleWorkspace = JSON.stringify({ version: 1, highlights: [{ id: 'mine', start: 0, end: 8, quote: 'Abstract', createdAt: '2026-09-06T00:00:00.000Z' }], notes: [], chat: [] })
    localStorage.setItem('arclight:paper:1706.03762v5', liveWorkspace)
    localStorage.setItem('arclight:paper:sample%3Aattention-is-all-you-need', sampleWorkspace)
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Explore the sample' }))

    expect(screen.getAllByRole('button', { name: 'Remove highlight' })).toHaveLength(3)
    expect(localStorage.getItem('arclight:paper:1706.03762v5')).toBe(liveWorkspace)
    expect(localStorage.getItem('arclight:paper:sample%3Aattention-is-all-you-need')).toContain('"id":"mine"')
  })

  it('warns when annotations cannot be saved', async () => {
    const user = userEvent.setup()
    const setItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key.startsWith('arclight:paper:')) throw new DOMException('full', 'QuotaExceededError')
      return setItem.call(this, key, value)
    })
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Explore the sample' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Changes cannot be saved')
  })

  it('turns a selection into a Codex note', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      answer: 'The passage frames translation as an encoder–decoder problem.',
    }), { status: 200, headers: { 'content-type': 'application/json' } })))
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Explore the sample' }))
    const article = screen.getByRole('article', { name: 'Attention Is All You Need' })
    const paragraph = within(article).getByText(/Sequence transduction problems are usually framed/)
    const range = document.createRange()
    range.selectNodeContents(paragraph)
    Object.defineProperty(range, 'getBoundingClientRect', {
      value: () => ({ left: 300, right: 520, top: 280, bottom: 310, width: 220, height: 30, x: 300, y: 280, toJSON() {} }),
    })
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    fireEvent.mouseDown(paragraph)
    fireEvent.mouseUp(paragraph)

    await user.click(await screen.findByRole('button', { name: 'Summarize selection' }))

    // The summary replaces the passage in the article rather than landing in the panel.
    const summary = await screen.findByText('The passage frames translation as an encoder–decoder problem.')
    expect(within(article).getByText('The passage frames translation as an encoder–decoder problem.')).toBe(summary)
    const wrapper = summary.closest('.arc-transform')!
    expect(wrapper).toHaveClass('is-generated')

    // The original passage is kept so the reader can flip back to it.
    const original = wrapper.querySelector('.arc-original')!
    expect(original.textContent).toContain('Sequence transduction problems')

    fireEvent.click(within(wrapper as HTMLElement).getByRole('button', { name: 'Show full text' }))
    expect(wrapper).toHaveClass('is-original')
    fireEvent.click(within(wrapper as HTMLElement).getByRole('button', { name: 'Show summary' }))
    expect(wrapper).toHaveClass('is-generated')
  })

  it('keeps highlight offsets correct after a passage is replaced inline', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      answer: 'A short generated summary that is a different length from the passage.',
    }), { status: 200, headers: { 'content-type': 'application/json' } })))
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Explore the sample' }))
    const article = screen.getByRole('article', { name: 'Attention Is All You Need' })
    const paragraph = within(article).getByText(/Sequence transduction problems are usually framed/)
    const range = document.createRange()
    range.selectNodeContents(paragraph)
    Object.defineProperty(range, 'getBoundingClientRect', {
      value: () => ({ left: 300, right: 520, top: 280, bottom: 310, width: 220, height: 30, x: 300, y: 280, toJSON() {} }),
    })
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    fireEvent.mouseDown(paragraph)
    fireEvent.mouseUp(paragraph)
    await user.click(await screen.findByRole('button', { name: 'Summarize selection' }))
    await screen.findByText('A short generated summary that is a different length from the passage.')

    // Generated text sits in the article but must not count toward offsets, or the
    // sample's saved highlights would drift onto the wrong words.
    expect(screen.getAllByRole('button', { name: 'Remove highlight' })).toHaveLength(2)
    expect(within(article).getByText(/relies on attention to model dependencies/)).toBeInTheDocument()
  })

  it('sends a contextual question from Ask Arc', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      answer: 'Self-attention shortens the path between distant positions.',
    }), { status: 200, headers: { 'content-type': 'application/json' } })))
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Explore the sample' }))
    await user.click(screen.getByRole('tab', { name: 'Ask Arc' }))
    await user.type(screen.getByRole('textbox', { name: 'Ask about this paper' }), 'Why is self-attention useful?')
    await user.click(screen.getByRole('button', { name: 'Send question' }))

    expect(await screen.findByText('Self-attention shortens the path between distant positions.')).toBeInTheDocument()
  })

  it('retries a failed Ask Arc answer without duplicating the question', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'CODEX_FAILED', message: 'Codex stopped early.' } }), { status: 500, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ answer: 'The retry succeeded.' }), { status: 200, headers: { 'content-type': 'application/json' } })))
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Explore the sample' }))
    await user.click(screen.getByRole('tab', { name: 'Ask Arc' }))
    await user.type(screen.getByRole('textbox', { name: 'Ask about this paper' }), 'What changed?')
    await user.click(screen.getByRole('button', { name: 'Send question' }))

    await user.click(await screen.findByRole('button', { name: 'Retry answer' }))

    expect(await screen.findByText('The retry succeeded.')).toBeInTheDocument()
    expect(screen.getAllByText('What changed?')).toHaveLength(1)
  })

  it('offers the arXiv source and PDF when structured import fails', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: {
        code: 'PAPER_IMPORT_FAILED',
        message: 'Structured HTML is unavailable.',
        sourceUrl: 'https://arxiv.org/abs/1706.03762',
        pdfUrl: 'https://arxiv.org/pdf/1706.03762.pdf',
      } }), { status: 502, headers: { 'content-type': 'application/json' } })))
    render(<App />)

    await user.type(screen.getByRole('textbox', { name: /arxiv/i }), '1706.03762')
    await user.click(screen.getByRole('button', { name: 'Open paper' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Structured HTML is unavailable.')
    expect(screen.getByRole('link', { name: 'Open arXiv source' })).toHaveAttribute('href', 'https://arxiv.org/abs/1706.03762')
    expect(screen.getByRole('link', { name: 'Open PDF' })).toHaveAttribute('href', 'https://arxiv.org/pdf/1706.03762.pdf')
  })

  it('persists reading appearance and closes drawers with Escape', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Explore the sample' }))

    await user.click(screen.getByText('Reading appearance'))
    await user.click(screen.getByRole('button', { name: 'Change reading theme' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'dim')
    expect(localStorage.getItem('arclight:theme')).toBe('dim')

    await user.click(screen.getByRole('button', { name: 'Increase text size' }))
    expect(document.documentElement.style.getPropertyValue('--article-scale')).toBe('1.1')
    expect(localStorage.getItem('arclight:text-scale')).toBe('1.1')

    await user.click(screen.getByRole('button', { name: 'Toggle paper outline' }))
    expect(document.querySelector('.outline-rail')).toHaveClass('is-open')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.querySelector('.outline-rail')).not.toHaveClass('is-open')
  })
})
