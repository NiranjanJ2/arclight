import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AIRequest } from '../src/types/paper'
import { buildCodexPrompt } from './codex'

type SpawnClaude = (command: string, args: readonly string[], options: SpawnOptionsWithoutStdio) => ChildProcessWithoutNullStreams

export interface ClaudeOptions {
  spawn?: SpawnClaude
  timeoutMs?: number
  maxOutputBytes?: number
  model?: string
}

export class ClaudeError extends Error {
  constructor(readonly code: 'CLAUDE_NOT_FOUND' | 'CLAUDE_AUTH_REQUIRED' | 'CLAUDE_TIMEOUT' | 'CLAUDE_FAILED', message: string) {
    super(message)
  }
}

function minimalClaudeEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { NO_COLOR: '1', DISABLE_AUTOUPDATER: '1' }
  // USER is required: without it the CLI cannot locate the stored credentials and
  // reports "Not logged in" even on a signed-in machine.
  for (const key of ['PATH', 'HOME', 'USER', 'LOGNAME', 'CLAUDE_CONFIG_DIR', 'TMPDIR', 'LANG', 'LC_ALL', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY']) {
    if (process.env[key]) environment[key] = process.env[key]
  }
  return environment
}

// A failed run is reported in-band: is_error is set while the process still exits
// 0, and the reason sits in the same field that normally carries the answer.
export function claudeFailureText(stdout: string): string {
  try {
    const payload = JSON.parse(stdout.trim()) as { is_error?: unknown; result?: unknown }
    if (payload.is_error !== true) return ''
    return typeof payload.result === 'string' && payload.result.trim() ? payload.result.trim() : 'Claude reported an error.'
  } catch {
    return ''
  }
}

// `claude -p --output-format json` returns one object per run. The field carrying
// the answer has moved between CLI versions, so the known spellings are tried in
// turn before falling back to treating the payload as plain text.
export function parseClaudeAnswer(stdout: string): string {
  const trimmed = stdout.trim()
  if (!trimmed) return ''
  try {
    const payload = JSON.parse(trimmed)
    // The CLI can report a failed run while still exiting 0, so the flag decides
    // before the answer field is read.
    if ((payload as { is_error?: unknown }).is_error === true) return ''
    for (const key of ['result', 'response', 'text', 'completion']) {
      const value = (payload as Record<string, unknown>)[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
    if (Array.isArray((payload as { content?: unknown }).content)) {
      const joined = ((payload as { content: Array<{ text?: unknown }> }).content)
        .map((part) => typeof part?.text === 'string' ? part.text : '')
        .join('')
      return joined.trim()
    }
    return ''
  } catch {
    return trimmed
  }
}

// The Claude CLI is driven exactly as Codex is: a local subprocess reading the
// prompt on stdin, so no API key is introduced and the user's existing sign-in
// is reused. The prompt is shared with Codex so both backends answer alike.
export function runClaude(request: AIRequest, options: ClaudeOptions = {}): Promise<string> {
  const spawn = options.spawn ?? nodeSpawn
  const timeoutMs = options.timeoutMs ?? 90_000
  const maxOutputBytes = options.maxOutputBytes ?? 128_000
  const model = options.model ?? process.env.ARCLIGHT_CLAUDE_MODEL ?? 'claude-sonnet-5'

  return new Promise((resolve, reject) => {
    const scratchDirectory = mkdtempSync(join(tmpdir(), 'arclight-claude-'))
    const cleanupScratch = () => {
      try { rmSync(scratchDirectory, { recursive: true, force: true }) } catch { /* best effort */ }
    }
    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn('claude', ['-p', '--output-format', 'json', '--model', model], {
        cwd: scratchDirectory,
        env: minimalClaudeEnvironment(),
        shell: false,
        detached: process.platform !== 'win32',
      })
    } catch {
      cleanupScratch()
      reject(new ClaudeError('CLAUDE_FAILED', 'Claude could not be started.'))
      return
    }

    let stdout = ''
    let stderr = ''
    let settled = false
    let terminating = false
    let forceKillTimer: NodeJS.Timeout | undefined
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      callback()
    }
    const signalProcess = (signal: NodeJS.Signals) => {
      if (process.platform !== 'win32' && child.pid) {
        try {
          process.kill(-child.pid, signal)
          return
        } catch { /* process may already have exited */ }
      }
      child.kill(signal)
    }
    const terminate = () => {
      if (terminating) return
      terminating = true
      signalProcess('SIGTERM')
      forceKillTimer = setTimeout(() => {
        signalProcess('SIGKILL')
        cleanupScratch()
      }, 1_000)
      forceKillTimer.unref?.()
    }
    const timeout = setTimeout(() => {
      terminate()
      finish(() => reject(new ClaudeError('CLAUDE_TIMEOUT', 'Claude took too long to answer. Try a shorter selection.')))
    }, timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => {
      if (settled) return
      stdout += chunk.toString('utf8')
      if (Buffer.byteLength(stdout, 'utf8') > maxOutputBytes) {
        terminate()
        finish(() => reject(new ClaudeError('CLAUDE_FAILED', 'Claude returned more text than ArcLight can display safely.')))
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      if (settled) return
      if (stderr.length < 8_000) stderr += chunk.toString('utf8')
    })
    child.once('error', (error: NodeJS.ErrnoException) => {
      if (forceKillTimer) clearTimeout(forceKillTimer)
      cleanupScratch()
      finish(() => reject(error.code === 'ENOENT'
        ? new ClaudeError('CLAUDE_NOT_FOUND', 'Claude is not installed or is not available on your PATH.')
        : new ClaudeError('CLAUDE_FAILED', 'Claude could not be started.')))
    })
    child.once('close', (code) => {
      if (forceKillTimer) clearTimeout(forceKillTimer)
      cleanupScratch()
      finish(() => {
        if (code !== 0) {
          const authFailure = /auth|login|credential|unauthorized|not logged in/i.test(stderr)
          reject(new ClaudeError(
            authFailure ? 'CLAUDE_AUTH_REQUIRED' : 'CLAUDE_FAILED',
            authFailure ? 'Claude needs you to sign in. Run `claude` in Terminal to log in, then retry.' : 'Claude could not complete this request.',
          ))
          return
        }
        const failure = claudeFailureText(stdout)
        if (failure) {
          const authFailure = /not logged in|\/login|unauthorized|credential|authenticat/i.test(failure)
          reject(new ClaudeError(
            authFailure ? 'CLAUDE_AUTH_REQUIRED' : 'CLAUDE_FAILED',
            authFailure ? 'Claude needs you to sign in. Run `claude` in Terminal, use /login, then retry.' : `Claude could not complete this request: ${failure}`,
          ))
          return
        }
        const answer = parseClaudeAnswer(stdout)
        if (!answer) return reject(new ClaudeError('CLAUDE_FAILED', 'Claude finished without returning an answer.'))
        resolve(answer)
      })
    })

    child.stdin.end(buildCodexPrompt(request))
  })
}
