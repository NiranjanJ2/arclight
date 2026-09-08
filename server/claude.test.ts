// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { claudeFailureText, parseClaudeAnswer } from './claude'

describe('parseClaudeAnswer', () => {
  // Shape confirmed against the installed CLI: `claude -p --output-format json`
  // returns one object whose answer sits in `result`.
  it('reads the answer the CLI actually returns', () => {
    expect(parseClaudeAnswer('{"type":"result","subtype":"success","is_error":false,"result":"OK","total_cost_usd":0.08}')).toBe('OK')
  })

  it('treats a run flagged as an error as having no answer', () => {
    expect(parseClaudeAnswer('{"is_error":true,"result":"partial text"}')).toBe('')
  })

  it('falls back to later spellings of the answer field', () => {
    expect(parseClaudeAnswer('{"response":"from response"}')).toBe('from response')
    expect(parseClaudeAnswer('{"content":[{"text":"a "},{"text":"b"}]}')).toBe('a b')
  })

  it('treats a non-JSON payload as plain text and empty output as no answer', () => {
    expect(parseClaudeAnswer('just prose')).toBe('just prose')
    expect(parseClaudeAnswer('   ')).toBe('')
  })
})

describe('claudeFailureText', () => {
  // Captured from a real run launched without USER in the environment, which is how
  // a signed-in machine still reported itself as logged out.
  it('surfaces the reason from a run flagged as an error', () => {
    expect(claudeFailureText('{"is_error":true,"subtype":"success","result":"Not logged in \u00b7 Please run /login"}'))
      .toBe('Not logged in \u00b7 Please run /login')
  })

  it('reports nothing for a successful run', () => {
    expect(claudeFailureText('{"is_error":false,"result":"OK"}')).toBe('')
    expect(claudeFailureText('not json')).toBe('')
  })
})
