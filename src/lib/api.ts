import type { AIRequest, PaperDocument } from '../types/paper'

export class ApiError extends Error {
  constructor(message: string, readonly code = 'UNKNOWN', readonly sourceUrl?: string, readonly pdfUrl?: string) {
    super(message)
  }
}

async function openLocalSession(signal?: AbortSignal): Promise<void> {
  const response = await fetch('/api/session', { credentials: 'same-origin', signal })
  if (!response.ok) throw new ApiError('ArcLight could not establish a private local session.', 'SESSION_REQUIRED')
}

export async function importPaper(input: string, signal?: AbortSignal): Promise<PaperDocument> {
  await openLocalSession(signal)
  const response = await fetch('/api/papers/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input }),
    credentials: 'same-origin',
    signal,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new ApiError(payload.error?.message ?? 'The paper could not be imported.', payload.error?.code, payload.error?.sourceUrl, payload.error?.pdfUrl)
  }
  return payload.paper
}

// Once Codex reports an exhausted allowance, every later request in this page
// session is addressed straight to Claude instead of spending another Codex round
// trip rediscovering the same limit. Module state is deliberate: a reload clears
// it, which is also the moment the allowance may have reset.
let codexExhausted = false

export function isCodexExhausted(): boolean {
  return codexExhausted
}

export function resetCodexAvailability(): void {
  codexExhausted = false
}

export async function askCodex(request: AIRequest): Promise<string> {
  await openLocalSession()
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(codexExhausted ? { ...request, skipCodex: true } : request),
    credentials: 'same-origin',
  })
  const payload = await response.json().catch(() => ({}))
  // The server reports the limit on both the answered and the failed path, so the
  // latch is set from an explicit flag rather than inferred from the message.
  if (payload.codexLimited === true) codexExhausted = true
  if (!response.ok) {
    throw new ApiError(payload.error?.message ?? 'Codex could not answer this request.', payload.error?.code)
  }
  return payload.answer
}
