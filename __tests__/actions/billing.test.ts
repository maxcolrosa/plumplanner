import { describe, it, expect } from 'vitest'
import { PRICE_TIER_MAP } from '@/lib/stripe'

describe('PRICE_TIER_MAP', () => {
  it('maps starter price ID to starter tier', () => {
    const tiers = Object.values(PRICE_TIER_MAP)
    expect(tiers).toContain('starter')
    expect(tiers).toContain('team')
    expect(tiers).toContain('agency')
  })

  it('returns undefined for unknown price ID', () => {
    expect(PRICE_TIER_MAP['price_unknown_xyz']).toBeUndefined()
  })
})
