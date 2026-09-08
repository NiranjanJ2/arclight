// @vitest-environment node

import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import type { PaperDocument } from '../src/types/paper'
import { createServer } from './index'
import { CodexError } from './codex'
import { ClaudeError } from './claude'

const paper: PaperDocument = {
  id: '1706.03762',
  metadata: {
    id: '1706.03762',
    title: 'Attention Is All You Need',
    authors: ['Ashish Vaswani'],
    abstract: 'A transformer paper.',
    categories: ['cs.CL'],
    sourceUrl: 'https://arxiv.org/abs/1706.03762',
    pdfUrl: 'https://arxiv.org/pdf/1706.03762.pdf',
  },
  html: '<section><h2 id="intro">Introduction</h2></section>',
  outline: [{ id: 'intro', title: 'Introduction', depth: 2 }],
  plainText: 'Introduction',
  acronyms: [],
  importedAt: '2026-09-06T00:00:00.000Z',
}

const sessionToken = 'test-session-capability'
const sessionCookie = `arclight_session=${sessionToken}`
const server = (options: Parameters<typeof createServer>[0] = {}) => createServer({ ...options, sessionToken })

describe('ArcLight API', () => {
  it('rejects an invalid import before calling the fetcher', async () => {
    const fetchPaper = vi.fn()
    const response = await request(server({ fetchPaper })).post('/api/papers/import').set('Cookie', sessionCookie).send({ input: 'https://evil.test/1706.03762' })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('INVALID_ARXIV_ID')
    expect(fetchPaper).not.toHaveBeenCalled()
  })

  it('imports a canonical paper through the injected fetcher', async () => {
    const fetchPaper = vi.fn().mockResolvedValue(paper)
    const response = await request(server({ fetchPaper })).post('/api/papers/import').set('Cookie', sessionCookie).send({ input: 'https://arxiv.org/abs/1706.03762' })

    expect(response.status).toBe(200)
    expect(response.body.paper.metadata.title).toBe('Attention Is All You Need')
    expect(fetchPaper).toHaveBeenCalledWith('1706.03762')
  })

  it('returns a recoverable upstream error when no conversion is available', async () => {
    const fetchPaper = vi.fn().mockRejectedValue(new Error('conversion missing'))
    const response = await request(server({ fetchPaper })).post('/api/papers/import').set('Cookie', sessionCookie).send({ input: '1706.03762' })

    expect(response.status).toBe(502)
    expect(response.body.error.code).toBe('PAPER_IMPORT_FAILED')
    expect(response.body.error.message).toContain('structured HTML')
    expect(response.body.error.sourceUrl).toBe('https://arxiv.org/abs/1706.03762')
    expect(response.body.error.pdfUrl).toBe('https://arxiv.org/pdf/1706.03762.pdf')
  })

  it('reports local Codex availability without exposing system details', async () => {
    const response = await request(server({ codexAvailable: async () => true })).get('/api/health')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true, codexAvailable: true })
  })

  it('validates and forwards grounded AI requests', async () => {
    const runCodex = vi.fn().mockResolvedValue('A concise answer.')
    const response = await request(server({ runCodex })).post('/api/ai').set('Cookie', sessionCookie).send({
      action: 'summarize',
      paper: { id: paper.id, title: paper.metadata.title, abstract: paper.metadata.abstract, plainText: paper.plainText },
      selection: { quote: 'A selected claim.', sectionTitle: 'Introduction' },
    })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ answer: 'A concise answer.' })
    expect(runCodex).toHaveBeenCalledOnce()
  })

  it('rejects transforms without a selected passage', async () => {
    const runCodex = vi.fn()
    const response = await request(server({ runCodex })).post('/api/ai').set('Cookie', sessionCookie).send({
      action: 'bullets',
      paper: { id: paper.id, title: paper.metadata.title, abstract: paper.metadata.abstract, plainText: paper.plainText },
    })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('INVALID_AI_REQUEST')
    expect(runCodex).not.toHaveBeenCalled()
  })

  it('issues an HttpOnly same-site session capability', async () => {
    const response = await request(server()).get('/api/session')

    expect(response.status).toBe(200)
    expect(response.headers['set-cookie']?.[0]).toContain(`arclight_session=${sessionToken}`)
    expect(response.headers['set-cookie']?.[0]).toContain('HttpOnly')
    expect(response.headers['set-cookie']?.[0]).toContain('SameSite=Strict')
  })

  it('hands the request to Claude when Codex has hit its usage limit', async () => {
    const runCodex = vi.fn().mockRejectedValue(new CodexError('CODEX_LIMIT_REACHED', 'Codex has reached its usage limit.'))
    const runClaude = vi.fn().mockResolvedValue('An answer from Claude.')
    const response = await request(server({ runCodex, runClaude })).post('/api/ai').set('Cookie', sessionCookie).send({
      action: 'summarize',
      paper: { id: paper.id, title: paper.metadata.title, abstract: paper.metadata.abstract, plainText: paper.plainText },
      selection: { quote: 'A selected claim.', sectionTitle: 'Introduction' },
    })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ answer: 'An answer from Claude.', provider: 'claude' })
    expect(runClaude).toHaveBeenCalledOnce()
  })

  it('does not fall back to Claude for a Codex failure that is not a usage limit', async () => {
    const runCodex = vi.fn().mockRejectedValue(new CodexError('CODEX_TIMEOUT', 'Codex took too long to answer.'))
    const runClaude = vi.fn()
    const response = await request(server({ runCodex, runClaude })).post('/api/ai').set('Cookie', sessionCookie).send({
      action: 'summarize',
      paper: { id: paper.id, title: paper.metadata.title, abstract: paper.metadata.abstract, plainText: paper.plainText },
      selection: { quote: 'A selected claim.', sectionTitle: 'Introduction' },
    })

    expect(response.status).toBe(500)
    expect(response.body.error.code).toBe('CODEX_TIMEOUT')
    expect(runClaude).not.toHaveBeenCalled()
  })

  it('reports both providers when Codex is limited and Claude is signed out', async () => {
    const runCodex = vi.fn().mockRejectedValue(new CodexError('CODEX_LIMIT_REACHED', 'Codex has reached its usage limit.'))
    const runClaude = vi.fn().mockRejectedValue(new ClaudeError('CLAUDE_AUTH_REQUIRED', 'Claude needs you to sign in.'))
    const response = await request(server({ runCodex, runClaude })).post('/api/ai').set('Cookie', sessionCookie).send({
      action: 'summarize',
      paper: { id: paper.id, title: paper.metadata.title, abstract: paper.metadata.abstract, plainText: paper.plainText },
      selection: { quote: 'A selected claim.', sectionTitle: 'Introduction' },
    })

    expect(response.status).toBe(503)
    expect(response.body.error.code).toBe('CLAUDE_AUTH_REQUIRED')
    expect(response.body.error.message).toContain('usage limit')
  })

  it('goes straight to Claude when the client reports Codex already limited', async () => {
    const runCodex = vi.fn()
    const runClaude = vi.fn().mockResolvedValue('Answered without retrying Codex.')
    const response = await request(server({ runCodex, runClaude })).post('/api/ai').set('Cookie', sessionCookie).send({
      action: 'summarize',
      paper: { id: paper.id, title: paper.metadata.title, abstract: paper.metadata.abstract, plainText: paper.plainText },
      selection: { quote: 'A selected claim.', sectionTitle: 'Introduction' },
      skipCodex: true,
    })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ answer: 'Answered without retrying Codex.', provider: 'claude', codexLimited: true })
    expect(runCodex).not.toHaveBeenCalled()
  })

  it('flags the exhausted allowance so the client can stop retrying Codex', async () => {
    const runCodex = vi.fn().mockRejectedValue(new CodexError('CODEX_LIMIT_REACHED', 'Codex has reached its usage limit.'))
    const runClaude = vi.fn().mockRejectedValue(new ClaudeError('CLAUDE_FAILED', 'Claude fell over.'))
    const response = await request(server({ runCodex, runClaude })).post('/api/ai').set('Cookie', sessionCookie).send({
      action: 'summarize',
      paper: { id: paper.id, title: paper.metadata.title, abstract: paper.metadata.abstract, plainText: paper.plainText },
      selection: { quote: 'A selected claim.', sectionTitle: 'Introduction' },
    })

    // Reported even on the failing path, so one bad Claude run does not make the
    // client resume paying for Codex round trips.
    expect(response.body.codexLimited).toBe(true)
  })

  it('accepts simplify as a grounded action', async () => {
    const runCodex = vi.fn().mockResolvedValue('Think of attention as a spotlight.')
    const response = await request(server({ runCodex })).post('/api/ai').set('Cookie', sessionCookie).send({
      action: 'simplify',
      paper: { id: paper.id, title: paper.metadata.title, abstract: paper.metadata.abstract, plainText: paper.plainText },
      selection: { quote: 'A selected claim.', sectionTitle: 'Introduction' },
    })

    expect(response.status).toBe(200)
    expect(response.body.answer).toBe('Think of attention as a spotlight.')
  })

  it('rejects POST requests without the session capability', async () => {
    const fetchPaper = vi.fn()
    const response = await request(server({ fetchPaper })).post('/api/papers/import').send({ input: '1706.03762' })

    expect(response.status).toBe(403)
    expect(fetchPaper).not.toHaveBeenCalled()
  })

  it('rejects foreign origins even when a capability cookie is supplied', async () => {
    const runCodex = vi.fn()
    const response = await request(server({ runCodex })).post('/api/ai')
      .set('Cookie', sessionCookie)
      .set('Origin', 'https://attacker.example')
      .send({ action: 'chat' })

    expect(response.status).toBe(403)
    expect(runCodex).not.toHaveBeenCalled()
  })

  it('rejects non-loopback Host headers before routing', async () => {
    const response = await request(server()).get('/api/health').set('Host', 'attacker.example')

    expect(response.status).toBe(403)
  })
})
