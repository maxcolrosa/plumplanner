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
      try {
        const session = event.data.object as Stripe.Checkout.Session
        const orgId = session.client_reference_id
        if (!orgId) break

        const subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : (session.subscription as Stripe.Subscription | null)?.id
        if (!subscriptionId) break

        const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ['items.data.price'],
        })
        const priceId = subscription.items.data[0]?.price.id
        if (!priceId) break
        const planTier = PRICE_TIER_MAP[priceId] ?? 'starter'

        const stripeCustomerId =
          typeof session.customer === 'string'
            ? session.customer
            : (session.customer as Stripe.Customer | null)?.id ?? ''
        if (!stripeCustomerId) break

        await admin
          .from('orgs')
          .update({
            stripe_customer_id: stripeCustomerId,
            stripe_subscription_id: subscriptionId,
            plan_tier: planTier,
          })
          .eq('id', orgId)
      } catch (err) {
        console.error('[webhook]', event.type, err)
      }
      break
    }

    case 'customer.subscription.updated': {
      try {
        const subscription = event.data.object as Stripe.Subscription
        const customerId =
          typeof subscription.customer === 'string'
            ? subscription.customer
            : (subscription.customer as Stripe.Customer).id
        const priceId = subscription.items.data[0]?.price.id
        if (!priceId) break
        const planTier = PRICE_TIER_MAP[priceId] ?? 'starter'
        if (!PRICE_TIER_MAP[priceId]) {
          console.warn('[webhook] Unknown price ID, defaulting to starter:', priceId)
        }

        await admin
          .from('orgs')
          .update({ plan_tier: planTier })
          .eq('stripe_customer_id', customerId)
      } catch (err) {
        console.error('[webhook]', event.type, err)
      }
      break
    }

    case 'customer.subscription.deleted': {
      try {
        const subscription = event.data.object as Stripe.Subscription
        const customerId =
          typeof subscription.customer === 'string'
            ? subscription.customer
            : (subscription.customer as Stripe.Customer).id

        await admin
          .from('orgs')
          .update({
            stripe_subscription_id: null,
            plan_tier: 'starter',
          })
          .eq('stripe_customer_id', customerId)
      } catch (err) {
        console.error('[webhook]', event.type, err)
      }
      break
    }
  }

  return new Response('ok', { status: 200 })
}
