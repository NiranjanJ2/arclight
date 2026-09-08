// @vitest-environment node

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { extractAcronyms, normalizePaperHtml } from './paper'

const fixture = readFileSync(fileURLToPath(new URL('./fixtures/paper.html', import.meta.url)), 'utf8')

describe('extractAcronyms', () => {
  it('keeps conservative definitions from paper text and rejects mismatches', () => {
    const result = extractAcronyms(
      'A large language model (LLM) uses retrieval-augmented generation (RAG). Random words (XYZ). LLM (large language model).',
    )

    expect(result).toEqual([
      { acronym: 'LLM', expansion: 'large language model' },
      { acronym: 'RAG', expansion: 'retrieval-augmented generation' },
    ])
  })

  it('matches plural acronyms against their singular expansion', () => {
    expect(extractAcronyms('Large Language Models (LLMs) and graphics processing units (GPUs).')).toEqual([
      { acronym: 'LLMs', expansion: 'Large Language Models' },
      { acronym: 'GPUs', expansion: 'graphics processing units' },
    ])
  })

  it('resolves an acronym whose expansion carries filler and trailing words', () => {
    expect(extractAcronyms('the Area Under the Receiver Operating Characteristic curve (AUROC) rose.')).toEqual([
      { acronym: 'AUROC', expansion: 'Area Under the Receiver Operating Characteristic curve' },
    ])
  })

  it('still rejects a phrase whose initials do not contain the acronym', () => {
    expect(extractAcronyms('we ran many experiments over time (MRI) here.')).toEqual([])
  })

  it('does not strip a capital S that belongs to the acronym', () => {
    expect(extractAcronyms('Autonomous Systems (AS) differ.')).toEqual([
      { acronym: 'AS', expansion: 'Autonomous Systems' },
    ])
  })
})

describe('normalizePaperHtml', () => {
  it('returns a safe, structured paper with an outline and acronym markup', () => {
    const paper = normalizePaperHtml(fixture, '1706.03762', 'https://ar5iv.labs.arxiv.org/html/1706.03762')

    expect(paper.metadata.title).toBe('A Small Test of Attention')
    expect(paper.metadata.authors).toEqual(['Ada Lovelace', 'Alan Turing'])
    expect(paper.metadata.abstract).toContain('large language model')
    expect(paper.outline).toEqual([
      { id: 'section-1-introduction', title: '1 Introduction', depth: 2 },
      { id: 'section-1-1-method', title: '1.1 Method', depth: 3 },
      { id: 'section-2-results', title: '2 Results', depth: 2 },
    ])
    expect(paper.acronyms).toEqual([
      { acronym: 'LLM', expansion: 'large language model' },
      { acronym: 'RAG', expansion: 'retrieval-augmented generation' },
    ])
    expect(paper.html).toContain('<abbr class="paper-acronym"')
    expect(paper.html).toContain('title="large language model"')
    expect(paper.html).toContain('aria-label="LLM: large language model; defined in this paper"')
    expect(paper.html).toContain('href="https://ar5iv.labs.arxiv.org/abs/1706.03762"')
    expect(paper.html).toContain('href="#section-note"')
    expect(paper.html).toContain('<img src="https://ar5iv.labs.arxiv.org/html/figures/architecture.svg"')
    expect(paper.html).not.toContain('https://evil.test/tracker.png')
    expect(paper.html).not.toMatch(/script|onerror|javascript:/i)
    expect(paper.plainText).toContain('RAG improves grounding')
  })
})
