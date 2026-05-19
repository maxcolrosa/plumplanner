import { describe, it, expect } from 'vitest'

// Test the pure tier-mapping logic in isolation
function tierFromPriceId(
  priceId: string,
  map: Record<string, 'starter' | 'team' | 'agency'>
): 'starter' | 'team' | 'agency' {
  return map[priceId] ?? 'starter'
}

describe('tierFromPriceId', () => {
  const map = {
    'price_starter': 'starter',
    'price_team': 'team',
    'price_agency': 'agency',
  } as const

  it('returns starter for starter price', () => {
    expect(tierFromPriceId('price_starter', map)).toBe('starter')
  })

  it('returns team for team price', () => {
    expect(tierFromPriceId('price_team', map)).toBe('team')
  })

  it('returns agency for agency price', () => {
    expect(tierFromPriceId('price_agency', map)).toBe('agency')
  })

  it('defaults to starter for unknown price', () => {
    expect(tierFromPriceId('price_unknown', map)).toBe('starter')
  })
})
