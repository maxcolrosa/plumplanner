import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia',
})

function requiredEnv(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`Missing env var: ${key}`)
  return v
}

export const PRICE_TIER_MAP: Record<string, 'starter' | 'team' | 'agency'> = {
  [requiredEnv('STRIPE_PRICE_ID_STARTER')]: 'starter',
  [requiredEnv('STRIPE_PRICE_ID_TEAM')]: 'team',
  [requiredEnv('STRIPE_PRICE_ID_AGENCY')]: 'agency',
}
