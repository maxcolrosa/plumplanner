// __tests__/lib/quick-add.test.ts
import { describe, it, expect } from 'vitest'

function parseLLMResponse(raw: string): {
  name: string
  resource_id: string
  duration_hours: number
  type: 'fluid' | 'fixed'
  start_date: string | null
} | { error: string } {
  try {
    const parsed = JSON.parse(raw)
    if ('error' in parsed) return { error: parsed.error }
    return parsed
  } catch {
    return { error: 'Could not parse AI response' }
  }
}

describe('parseLLMResponse', () => {
  it('parses a valid fluid task response', () => {
    const raw = JSON.stringify({
      name: 'Design review',
      resource_id: 'abc-123',
      duration_hours: 3,
      type: 'fluid',
      start_date: null,
    })
    const result = parseLLMResponse(raw)
    expect(result).toEqual({
      name: 'Design review',
      resource_id: 'abc-123',
      duration_hours: 3,
      type: 'fluid',
      start_date: null,
    })
  })

  it('parses a valid fixed task response', () => {
    const raw = JSON.stringify({
      name: 'Client meeting',
      resource_id: 'def-456',
      duration_hours: 2,
      type: 'fixed',
      start_date: '2026-05-26',
    })
    const result = parseLLMResponse(raw)
    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.type).toBe('fixed')
      expect(result.start_date).toBe('2026-05-26')
    }
  })

  it('returns error object when LLM returns error JSON', () => {
    const raw = JSON.stringify({ error: 'Could not understand input' })
    const result = parseLLMResponse(raw)
    expect(result).toEqual({ error: 'Could not understand input' })
  })

  it('returns error object when response is not valid JSON', () => {
    const result = parseLLMResponse('not json at all')
    expect(result).toEqual({ error: 'Could not parse AI response' })
  })
})
