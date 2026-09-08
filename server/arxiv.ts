import type { PaperDocument } from '../src/types/paper'
import { normalizePaperHtml } from './paper'

const MODERN_ID = /^\d{4}\.\d{4,5}(?:v\d+)?$/
const LEGACY_ID = /^[a-z-]+(?:\.[A-Z]{2})?\/\d{7}(?:v\d+)?$/
const MAX_PAPER_BYTES = 12_000_000
const PAPER_HOSTS = new Set(['arxiv.org', 'www.arxiv.org', 'ar5iv.labs.arxiv.org'])
const paperCache = new Map<string, PaperDocument>()

export function parseArxivId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed || trimmed.length > 256) return null

  const direct = trimmed.replace(/\.pdf$/i, '')
  if (MODERN_ID.test(direct) || LEGACY_ID.test(direct)) return direct

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  if (!['arxiv.org', 'www.arxiv.org'].includes(url.hostname.toLowerCase())) return null
  const match = url.pathname.match(/^\/(?:abs|pdf|html)\/(.+?)(?:\.pdf)?\/?$/i)
  if (!match) return null

  let candidate: string
  try {
    candidate = decodeURIComponent(match[1])
  } catch {
    return null
  }
  return MODERN_ID.test(candidate) || LEGACY_ID.test(candidate) ? candidate : null
}

async function fetchAllowlisted(url: string, signal: AbortSignal, fetchImpl: typeof fetch): Promise<{ response: Response; finalUrl: string }> {
  let current = new URL(url)
  for (let redirect = 0; redirect < 4; redirect += 1) {
    if (current.protocol !== 'https:' || (current.port && current.port !== '443') || !PAPER_HOSTS.has(current.hostname)) {
      throw new Error('Paper sources must use secure arXiv hosts on the standard HTTPS port.')
    }
    const response = await fetchImpl(current, {
      redirect: 'manual',
      signal,
      headers: { 'user-agent': 'ArcLight/0.1 local paper reader' },
    })
    if (![301, 302, 303, 307, 308].includes(response.status)) return { response, finalUrl: current.href }
    const location = response.headers.get('location')
    if (!location) throw new Error('Paper source returned an invalid redirect.')
    current = new URL(location, current)
  }
  throw new Error('Paper source redirected too many times.')
}

export async function readBoundedText(response: Response, maxBytes = MAX_PAPER_BYTES): Promise<string> {
  const declaredBytes = Number(response.headers.get('content-length') ?? 0)
  if (declaredBytes > maxBytes) throw new Error('Paper HTML is too large to import safely.')
  if (!response.body) {
    const text = await response.text()
    if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new Error('Paper HTML is too large to import safely.')
    return text
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const chunks: string[] = []
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > maxBytes) {
        await reader.cancel()
        throw new Error('Paper HTML is too large to import safely.')
      }
      chunks.push(decoder.decode(value, { stream: true }))
    }
    chunks.push(decoder.decode())
    return chunks.join('')
  } finally {
    reader.releaseLock()
  }
}

export async function fetchPaper(
  id: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<PaperDocument> {
  if (parseArxivId(id) !== id) throw new Error('Invalid arXiv identifier.')
  if (fetchImpl === globalThis.fetch && paperCache.has(id)) return paperCache.get(id)!

  const encodedId = id.split('/').map(encodeURIComponent).join('/')
  const sources = [
    `https://arxiv.org/html/${encodedId}`,
    `https://ar5iv.labs.arxiv.org/html/${encodedId}`,
  ]
  const timeout = AbortSignal.timeout(15_000)
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout
  let lastError: Error | undefined

  for (const source of sources) {
    try {
      const { response, finalUrl } = await fetchAllowlisted(source, requestSignal, fetchImpl)
      if (!response.ok) throw new Error(`Paper source returned HTTP ${response.status}.`)
      const html = await readBoundedText(response)
      const paper = normalizePaperHtml(html, id, finalUrl)
      if (fetchImpl === globalThis.fetch) paperCache.set(id, paper)
      return paper
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Paper import failed.')
    }
  }

  throw lastError ?? new Error('No structured HTML conversion is available for this paper.')
}
