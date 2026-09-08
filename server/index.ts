import { spawn } from 'node:child_process'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import express, { type Express } from 'express'
import type { AIRequest, PaperDocument } from '../src/types/paper'
import { fetchPaper as fetchPaperFromArxiv, parseArxivId } from './arxiv'
import { CodexError, runCodex as runCodexProcess } from './codex'
import { ClaudeError, runClaude as runClaudeProcess } from './claude'

type FetchPaper = (id: string) => Promise<PaperDocument>

export interface ServerOptions {
  fetchPaper?: FetchPaper
  codexAvailable?: () => Promise<boolean>
  runCodex?: (request: AIRequest) => Promise<string>
  runClaude?: (request: AIRequest) => Promise<string>
  sessionToken?: string
  // The packaged desktop app serves the client from inside its own bundle, where
  // the path cannot be derived from this file's location.
  staticRoot?: string
}

function isLoopbackHostname(value: string): boolean {
  return ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(value.toLowerCase())
}

function requestUsesLoopbackHost(host: string | undefined): boolean {
  if (!host) return false
  try {
    return isLoopbackHostname(new URL(`http://${host}`).hostname)
  } catch {
    return false
  }
}

function requestUsesLoopbackOrigin(origin: string | undefined): boolean {
  if (!origin) return true
  try {
    const url = new URL(origin)
    return ['http:', 'https:'].includes(url.protocol) && isLoopbackHostname(url.hostname)
  } catch {
    return false
  }
}

function cookieValue(header: string | undefined, name: string): string | undefined {
  return header?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1)
}

function tokensMatch(expected: string, actual: string | undefined): boolean {
  if (!actual) return false
  const expectedBytes = Buffer.from(expected)
  const actualBytes = Buffer.from(actual)
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes)
}

export function checkCodexAvailable(): Promise<boolean> {
  return new Promise((resolveAvailability) => {
    const child = spawn('codex', ['--version'], { shell: false, stdio: 'ignore' })
    const timeout = setTimeout(() => {
      child.kill()
      resolveAvailability(false)
    }, 2_000)
    child.once('error', () => {
      clearTimeout(timeout)
      resolveAvailability(false)
    })
    child.once('exit', (code) => {
      clearTimeout(timeout)
      resolveAvailability(code === 0)
    })
  })
}

export function createServer(options: ServerOptions = {}): Express {
  const app = express()
  const paperFetcher = options.fetchPaper ?? fetchPaperFromArxiv
  const codexAvailable = options.codexAvailable ?? checkCodexAvailable
  const runCodex = options.runCodex ?? runCodexProcess
  const runClaude = options.runClaude ?? runClaudeProcess
  const sessionToken = options.sessionToken ?? randomBytes(32).toString('base64url')

  app.disable('x-powered-by')
  app.use((request, response, next) => {
    response.set({
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://arxiv.org https://www.arxiv.org https://ar5iv.labs.arxiv.org; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    })
    if (!requestUsesLoopbackHost(request.headers.host)) {
      response.status(403).json({ error: { code: 'LOCAL_ACCESS_ONLY', message: 'ArcLight accepts requests only from this computer.' } })
      return
    }
    if (!requestUsesLoopbackOrigin(request.headers.origin)) {
      response.status(403).json({ error: { code: 'LOCAL_ACCESS_ONLY', message: 'ArcLight rejected a request from another site.' } })
      return
    }
    next()
  })
  app.use(express.json({ limit: '1mb' }))

  app.get('/api/session', (_request, response) => {
    response.setHeader('Cache-Control', 'no-store')
    response.cookie('arclight_session', sessionToken, { httpOnly: true, sameSite: 'strict', path: '/' })
    response.json({ ok: true })
  })

  app.use('/api', (request, response, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return next()
    if (!tokensMatch(sessionToken, cookieValue(request.headers.cookie, 'arclight_session'))) {
      response.status(403).json({ error: { code: 'SESSION_REQUIRED', message: 'Refresh ArcLight and try again.' } })
      return
    }
    next()
  })

  app.get('/api/health', async (_request, response) => {
    response.json({ ok: true, codexAvailable: await codexAvailable() })
  })

  app.post('/api/papers/import', async (request, response) => {
    const id = typeof request.body?.input === 'string' ? parseArxivId(request.body.input) : null
    if (!id) {
      response.status(400).json({
        error: { code: 'INVALID_ARXIV_ID', message: 'Enter an arXiv link or identifier, such as 1706.03762.' },
      })
      return
    }

    try {
      response.json({ paper: await paperFetcher(id) })
    } catch {
      response.status(502).json({
        error: {
          code: 'PAPER_IMPORT_FAILED',
          message: 'ArcLight could not find structured HTML for this paper. You can still open the source PDF on arXiv.',
          sourceUrl: `https://arxiv.org/abs/${id}`,
          pdfUrl: `https://arxiv.org/pdf/${id}.pdf`,
        },
      })
    }
  })

  app.post('/api/ai', async (request, response) => {
    const body = request.body as Partial<AIRequest> & { skipCodex?: unknown }
    const skipCodex = body.skipCodex === true
    const action = body.action
    const paper = body.paper
    const hasPaper = paper && parseArxivId(paper.id ?? '') === paper.id && typeof paper.title === 'string'
      && paper.title.length <= 1_000 && typeof paper.abstract === 'string' && paper.abstract.length <= 50_000
      && typeof paper.plainText === 'string' && paper.plainText.length <= 900_000
    const hasSelection = typeof body.selection?.quote === 'string' && body.selection.quote.trim().length > 0 && body.selection.quote.length <= 20_000
    const hasQuestion = typeof body.question === 'string' && body.question.trim().length > 0 && body.question.length <= 4_000
    const validAction = action === 'summarize' || action === 'bullets' || action === 'simplify' || action === 'chat'
    if (!validAction || !hasPaper || (action === 'chat' ? !hasQuestion : !hasSelection)) {
      response.status(400).json({ error: { code: 'INVALID_AI_REQUEST', message: 'Choose a passage or enter a question before asking Codex.' } })
      return
    }
    const safeRequest: AIRequest = {
      action,
      paper: paper as AIRequest['paper'],
      selection: hasSelection ? { quote: body.selection!.quote, sectionTitle: body.selection!.sectionTitle?.slice(0, 300) } : undefined,
      question: hasQuestion ? body.question!.trim() : undefined,
      history: Array.isArray(body.history) ? body.history.slice(-8).filter((message) =>
        (message?.role === 'user' || message?.role === 'assistant') && typeof message.content === 'string',
      ).map((message) => ({ role: message.role, content: message.content.slice(0, 4_000) })) : [],
    }
    // `codexLimited` tells the client the allowance is gone so it can address later
    // requests straight to Claude instead of spending another Codex round trip
    // rediscovering it.
    const answerWithClaude = async () => {
      try {
        response.json({ answer: await runClaude(safeRequest), provider: 'claude', codexLimited: true })
      } catch (fallbackError) {
        const knownFallback = fallbackError instanceof ClaudeError
        response.status(knownFallback && ['CLAUDE_NOT_FOUND', 'CLAUDE_AUTH_REQUIRED'].includes(fallbackError.code) ? 503 : 500).json({
          codexLimited: true,
          error: {
            code: knownFallback ? fallbackError.code : 'CLAUDE_FAILED',
            message: `Codex has reached its usage limit and Claude could not take over. ${knownFallback ? fallbackError.message : 'Claude could not answer this request.'}`,
          },
        })
      }
    }

    // The client latches onto the limit for the rest of its page session and asks
    // to skip Codex outright; a reload drops the latch and Codex is tried again.
    if (skipCodex) return void await answerWithClaude()

    try {
      response.json({ answer: await runCodex(safeRequest) })
    } catch (error) {
      // Only an exhausted Codex allowance falls through to Claude. Every other
      // failure — not installed, signed out, timed out, crashed — is surfaced, so
      // a broken Codex stays visible instead of being quietly papered over.
      if (error instanceof CodexError && error.code === 'CODEX_LIMIT_REACHED') return void await answerWithClaude()
      const known = error instanceof CodexError
      response.status(known && ['CODEX_NOT_FOUND', 'CODEX_AUTH_REQUIRED'].includes(error.code) ? 503 : 500).json({
        error: { code: known ? error.code : 'CODEX_FAILED', message: known ? error.message : 'Codex could not answer this request.' },
      })
    }
  })

  const dist = options.staticRoot ?? resolve(dirname(fileURLToPath(import.meta.url)), '../dist')
  if (existsSync(dist)) {
    app.use(express.static(dist))
    app.use((request, response, next) => {
      if (request.method !== 'GET' || request.path.startsWith('/api/')) return next()
      response.sendFile(join(dist, 'index.html'))
    })
  }

  return app
}

function openBrowser(url: string) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
  spawn(command, args, { detached: true, shell: false, stdio: 'ignore' }).unref()
}

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isEntryPoint) {
  const port = Number(process.env.PORT ?? 8787)
  const host = '127.0.0.1'
  createServer().listen(port, host, () => {
    const url = `http://${host}:${port}`
    console.log(`ArcLight is ready at ${url}`)
    if (process.argv.includes('--open') && !process.env.CI) openBrowser(url)
  })
}
