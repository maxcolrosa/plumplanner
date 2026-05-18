import { describe, it, expect } from 'vitest'

import { generateOrgSlug, validateInviteEmail } from '@/actions/orgs'

describe('generateOrgSlug', () => {
  it('converts name to lowercase kebab-case', () => {
    expect(generateOrgSlug('My Agency')).toBe('my-agency')
  })

  it('strips special characters', () => {
    expect(generateOrgSlug('Acme & Co.')).toBe('acme-co')
  })

  it('collapses multiple hyphens', () => {
    expect(generateOrgSlug('A  B   C')).toBe('a-b-c')
  })

  it('truncates to 50 characters', () => {
    const long = 'a'.repeat(60)
    expect(generateOrgSlug(long).length).toBeLessThanOrEqual(50)
  })
})

describe('validateInviteEmail', () => {
  it('accepts a valid email', () => {
    expect(validateInviteEmail('user@example.com')).toBe(true)
  })

  it('rejects an invalid email', () => {
    expect(validateInviteEmail('notanemail')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(validateInviteEmail('')).toBe(false)
  })
})
