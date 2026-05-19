import Stripe from 'stripe'
import { stripe, PRICE_TIER_MAP } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig) {
    return new Response('Missing stripe-signature header', { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    return new Response(
      `Webhook error: ${err instanceof Error ? err.message : 'Unknown'}`,
      { status: 400 }
    )
  }

  const admin = createServiceClient()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const orgId = session.client_reference_id
      if (!orgId) break

      const subscriptionId = session.subscription as string
      const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['items.data.price'],
      })
      const priceId = subscription.items.data[0].price.id
      const planTier = PRICE_TIER_MAP[priceId] ?? 'starter'

      await admin
        .from('orgs')
        .update({
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: subscriptionId,
          plan_tier: planTier,
        })
        .eq('id', orgId)
      break
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = subscription.customer as string
      const priceId = subscription.items.data[0].price.id
      const planTier = PRICE_TIER_MAP[priceId] ?? 'starter'

      await admin
        .from('orgs')
        .update({ plan_tier: planTier })
        .eq('stripe_customer_id', customerId)
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = subscription.customer as string

      await admin
        .from('orgs')
        .update({
          stripe_subscription_id: null,
          plan_tier: 'starter',
        })
        .eq('stripe_customer_id', customerId)
      break
    }
  }

  return new Response('ok', { status: 200 })
}
