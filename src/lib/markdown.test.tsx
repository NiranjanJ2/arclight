import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './markdown'

const show = (source: string) => render(<div>{renderMarkdown(source)}</div>).container

describe('renderMarkdown', () => {
  it('renders emphasis and code rather than printing the markers', () => {
    const container = show('The **focus score** uses `Attn` values and is *training-free*.')
    expect(container.querySelector('strong')?.textContent).toBe('focus score')
    expect(container.querySelector('code')?.textContent).toBe('Attn')
    expect(container.querySelector('em')?.textContent).toBe('training-free')
    expect(container.textContent).not.toContain('**')
  })

  it('renders a bullet list, which is what the bullets prompt asks for', () => {
    const container = show('- first point\n- second point\n- third point')
    expect(container.querySelectorAll('ul li')).toHaveLength(3)
    expect(screen.getByText('second point')).toBeInTheDocument()
  })

  it('keeps numbered lists ordered and separate from bullets', () => {
    const container = show('1. one\n2. two\n\n- a bullet')
    expect(container.querySelectorAll('ol li')).toHaveLength(2)
    expect(container.querySelectorAll('ul li')).toHaveLength(1)
  })

  it('splits paragraphs on blank lines and joins wrapped lines', () => {
    const container = show('First paragraph\nwrapped onto two lines.\n\nSecond paragraph.')
    const paragraphs = container.querySelectorAll('p')
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0].textContent).toBe('First paragraph wrapped onto two lines.')
  })

  // Model output is untrusted: it is built into React nodes, never assigned as HTML.
  it('does not interpret HTML in model output', () => {
    const container = show('watch out <img src=x onerror=alert(1)> and <b>bold</b>')
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(container.textContent).toContain('<b>bold</b>')
  })

  it('survives empty input', () => {
    expect(show('').textContent).toBe('')
  })
})
