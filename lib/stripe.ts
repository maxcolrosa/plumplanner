import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia',
  typescript: true,
})

export const PRICE_TIER_MAP: Record<string, 'starter' | 'team' | 'agency'> = {
  [process.env.STRIPE_PRICE_ID_STARTER!]: 'starter',
  [process.env.STRIPE_PRICE_ID_TEAM!]: 'team',
  [process.env.STRIPE_PRICE_ID_AGENCY!]: 'agency',
}
