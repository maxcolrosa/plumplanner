'use server'

import { createClient } from '@/lib/supabase/server'
import { stripe, PRICE_TIER_MAP } from '@/lib/stripe'

export async function createCheckoutSession(
  orgId: string,
  priceId: string,
): Promise<{ url: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: member } = await supabase
    .from('org_members')
    .select('id')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .not('joined_at', 'is', null)
    .single()
  if (!member) return { error: 'Not a member of this organisation' }

  if (!PRICE_TIER_MAP[priceId]) return { error: 'Invalid plan' }

  const { data: org } = await supabase
    .from('orgs')
    .select('slug')
    .eq('id', orgId)
    .single()
  if (!org) return { error: 'Organisation not found' }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: orgId,
    customer_email: user.email,
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/${org.slug}/timeline`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/${org.slug}/subscribe`,
  })

  if (!session.url) return { error: 'Failed to create checkout session' }
  return { url: session.url }
}

export async function createPortalSession(
  orgId: string,
): Promise<{ url: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: member } = await supabase
    .from('org_members')
    .select('id')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .not('joined_at', 'is', null)
    .single()
  if (!member) return { error: 'Not a member of this organisation' }

  const { data: org } = await supabase
    .from('orgs')
    .select('stripe_customer_id, slug')
    .eq('id', orgId)
    .single()

  if (!org?.stripe_customer_id) {
    return { error: 'No billing account found. Please contact support.' }
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/${org.slug}/timeline`,
  })

  return { url: session.url }
}
