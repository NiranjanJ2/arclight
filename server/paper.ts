import * as cheerio from 'cheerio'
import sanitizeHtml from 'sanitize-html'
import type { AnyNode } from 'domhandler'
import type { AcronymDefinition, PaperDocument, PaperSection } from '../src/types/paper'

const ACRONYM = '[A-Z][A-Z0-9-]{1,9}s?'
const WORD = "[A-Za-z][A-Za-z'’-]*"
const FORWARD_DEFINITION = new RegExp(`\\b(${WORD}(?:\\s+${WORD}){1,9})\\s*\\((${ACRONYM})\\)`, 'g')
const REVERSE_DEFINITION = new RegExp(`\\b(${ACRONYM})\\s*\\((${WORD}(?:\\s+${WORD}){1,9})\\)`, 'g')
const SAFE_IMAGE_HOSTS = new Set(['arxiv.org', 'www.arxiv.org', 'ar5iv.labs.arxiv.org'])

function initials(value: string): string {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase())
    .join('')
}

function bareAcronym(value: string): string {
  // "LLMs" is defined by "Large Language Models", whose initials are "LLM". Only a
  // lowercase plural is dropped, so a genuine all-caps acronym like "AS" survives.
  return value.replace(/-/g, '').replace(/s$/, '')
}

// An expansion rarely lines up letter-for-letter: "Area Under the Receiver
// Operating Characteristic curve" carries a filler word and a trailing noun that
// "AUROC" does not. The acronym therefore has to appear in order within the
// phrase's initials, and at most two extra words may be skipped — enough for
// articles and a trailing head noun, too few to match an unrelated phrase.
const MAX_SKIPPED_WORDS = 2

function initialsCover(phraseInitials: string, acronym: string): boolean {
  if (phraseInitials.length < acronym.length) return false
  if (phraseInitials.length - acronym.length > MAX_SKIPPED_WORDS) return false
  if (phraseInitials[0] !== acronym[0]) return false
  let cursor = 0
  for (const letter of phraseInitials) {
    if (cursor < acronym.length && letter === acronym[cursor]) cursor += 1
  }
  return cursor === acronym.length
}

function matchingSuffix(phrase: string, acronym: string): string | null {
  const words = phrase.trim().split(/\s+/)
  const bare = bareAcronym(acronym)
  for (let start = words.length - 1; start >= 0; start -= 1) {
    const candidate = words.slice(start).join(' ')
    if (initialsCover(initials(candidate), bare)) return candidate
  }
  return null
}

export function extractAcronyms(text: string): AcronymDefinition[] {
  const candidates: Array<AcronymDefinition & { index: number }> = []
  for (const match of text.matchAll(FORWARD_DEFINITION)) {
    const expansion = matchingSuffix(match[1], match[2])
    if (expansion) candidates.push({ acronym: match[2], expansion, index: match.index })
  }
  for (const match of text.matchAll(REVERSE_DEFINITION)) {
    if (initialsCover(initials(match[2]), bareAcronym(match[1]))) {
      candidates.push({ acronym: match[1], expansion: match[2], index: match.index })
    }
  }

  const seen = new Set<string>()
  return candidates
    .sort((a, b) => a.index - b.index)
    .filter(({ acronym }) => {
      if (seen.has(acronym)) return false
      seen.add(acronym)
      return true
    })
    .map(({ acronym, expansion }) => ({ acronym, expansion }))
}

function slugify(value: string, fallback: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
  return slug || fallback
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function decorateAcronyms(
  $: cheerio.CheerioAPI,
  root: cheerio.Cheerio<AnyNode>,
  acronyms: AcronymDefinition[],
) {
  if (!acronyms.length) return
  // A paper defines "LLMs" once and then writes "LLM" throughout (or the reverse),
  // so both spellings point at the same expansion.
  const expansions = new Map<string, string>()
  for (const { acronym, expansion } of acronyms) {
    const singular = bareAcronym(acronym)
    for (const form of [acronym, singular, `${singular}s`]) {
      if (!expansions.has(form)) expansions.set(form, expansion)
    }
  }
  // Longest first, so "LLMs" is not consumed as "LLM" followed by a stray "s".
  const forms = [...expansions.keys()].sort((a, b) => b.length - a.length)
  const pattern = new RegExp(`\\b(${forms.map((form) => form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'g')

  root.find('*').addBack().contents().each((_index, node) => {
    if (node.type !== 'text' || !node.data.trim()) return
    const parent = $(node).parent()
    if (parent.is('abbr, code, pre, math, svg, style, script') || parent.parents('abbr, code, pre, math, svg').length) return
    const replaced = node.data.replace(pattern, (acronym) => {
      const expansion = expansions.get(acronym)
      return expansion
        ? `<abbr class="paper-acronym" data-expansion="${escapeAttribute(expansion)}" title="${escapeAttribute(expansion)}" aria-label="${escapeAttribute(`${acronym}: ${expansion}; defined in this paper`)}" tabindex="0">${acronym}</abbr>`
        : acronym
    })
    if (replaced !== node.data) $(node).replaceWith(replaced)
  })
}

const allowedTags = [
  ...sanitizeHtml.defaults.allowedTags,
  'article', 'section', 'figure', 'figcaption', 'details', 'summary', 'abbr', 'img',
  'math', 'mrow', 'mi', 'mn', 'mo', 'msub', 'msup', 'msubsup', 'mfrac', 'msqrt',
  'mover', 'munder', 'munderover', 'mtable', 'mtr', 'mtd', 'mtext', 'semantics',
  'svg', 'path', 'g', 'line', 'rect', 'circle', 'polyline',
]

export function normalizePaperHtml(html: string, id: string, sourceUrl = `https://arxiv.org/html/${id}`): PaperDocument {
  const $ = cheerio.load(html)
  const documentRoot = $('article').first().length ? $('article').first() : $('main').first().length ? $('main').first() : $('body')
  const title = normalizeWhitespace($('.ltx_title_document, h1').first().text()) || `arXiv:${id}`
  const authors = $('.ltx_personname, [itemprop="author"]')
    .map((_index, element) => normalizeWhitespace($(element).text()))
    .get()
    .filter(Boolean)
  const abstractNode = $('.ltx_abstract, blockquote.abstract').first()
  abstractNode.find('.ltx_title_abstract').remove()
  const abstract = normalizeWhitespace(abstractNode.text())

  documentRoot.find('script, style, nav, form, iframe, object, embed, input, button, textarea, select, noscript').remove()
  documentRoot.find('.ltx_title_document, .ltx_authors').remove()

  const outline: PaperSection[] = []
  documentRoot.find('h2, h3, h4, h5, h6').each((index, heading) => {
    const headingNode = $(heading)
    if (headingNode.hasClass('ltx_title_abstract')) return
    const headingTitle = normalizeWhitespace(headingNode.text())
    if (!headingTitle) return
    const depth = Number(heading.tagName.slice(1))
    const headingId = `section-${slugify(headingTitle, String(index + 1))}`
    headingNode.attr('id', headingId)
    outline.push({ id: headingId, title: headingTitle, depth })
  })

  documentRoot.find('a[href]').each((_index, anchor) => {
    const node = $(anchor)
    const href = node.attr('href') ?? ''
    if (href.startsWith('#')) {
      node.attr('href', href).removeAttr('target').removeAttr('rel')
      return
    }
    try {
      const safeUrl = new URL(href, sourceUrl)
      if (!['http:', 'https:'].includes(safeUrl.protocol)) throw new Error('unsafe protocol')
      node.attr('href', safeUrl.href).attr('target', '_blank').attr('rel', 'noreferrer noopener')
    } catch {
      node.removeAttr('href')
    }
  })
  documentRoot.find('img[src]').each((_index, image) => {
    const node = $(image)
    try {
      const safeUrl = new URL(node.attr('src') ?? '', sourceUrl)
      if (!['http:', 'https:'].includes(safeUrl.protocol) || !SAFE_IMAGE_HOSTS.has(safeUrl.hostname)) throw new Error('unsafe image source')
      node.attr('src', safeUrl.href).attr('loading', 'lazy').attr('referrerpolicy', 'no-referrer')
    } catch {
      node.removeAttr('src')
    }
  })

  // LaTeXML ships the LaTeX source next to the presentation MathML. The sanitiser
  // drops the wrapper but keeps its text, so every equation rendered twice — laid
  // out, then again as raw "Attn^{l,h}(I)". Removing it here also keeps that noise
  // out of plainText, and so out of the text sent to the model.
  documentRoot.find('annotation, annotation-xml').remove()

  const paperText = normalizeWhitespace(documentRoot.text())
  const acronyms = extractAcronyms(`${abstract} ${paperText}`)
  decorateAcronyms($, documentRoot, acronyms)

  const normalized = sanitizeHtml(documentRoot.html() ?? '', {
    allowedTags,
    // Belt and braces: if an annotation survives the pass above, drop its text too
    // rather than letting it fall out into the paragraph.
    nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript', 'annotation', 'annotation-xml'],
    allowedAttributes: {
      '*': ['id', 'class', 'title', 'role', 'aria-label', 'data-expansion', 'tabindex'],
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height', 'loading', 'referrerpolicy'],
      math: ['display', 'xmlns'],
      svg: ['viewBox', 'width', 'height', 'aria-hidden'],
      path: ['d', 'fill', 'stroke'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
  })

  return {
    id,
    metadata: {
      id,
      title,
      authors,
      abstract,
      categories: [],
      sourceUrl: `https://arxiv.org/abs/${id}`,
      pdfUrl: `https://arxiv.org/pdf/${id}.pdf`,
    },
    html: normalized,
    outline,
    plainText: normalizeWhitespace(cheerio.load(normalized).text()),
    acronyms,
    importedAt: new Date().toISOString(),
  }
}
