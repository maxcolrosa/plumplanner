import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createCheckoutSession } from '@/actions/billing'
import { Button } from '@/components/ui/button'

interface Props {
  params: Promise<{ orgSlug: string }>
}

const PLANS = [
  {
    name: 'Starter',
    price: '$99/mo',
    members: 'Up to 5 members',
    featured: false,
    priceEnvKey: 'STRIPE_PRICE_ID_STARTER',
  },
  {
    name: 'Team',
    price: '$249/mo',
    members: 'Up to 15 members',
    featured: true,
    priceEnvKey: 'STRIPE_PRICE_ID_TEAM',
  },
  {
    name: 'Agency',
    price: '$499/mo',
    members: 'Up to 25 members',
    featured: false,
    priceEnvKey: 'STRIPE_PRICE_ID_AGENCY',
  },
] as const

export default async function SubscribePage({ params }: Props) {
  const { orgSlug } = await params
  const supabase = await createClient()
  const { data: org } = await supabase
    .from('orgs')
    .select('id, name, stripe_subscription_id')
    .eq('slug', orgSlug)
    .single()

  if (!org) redirect('/sign-in')

  // Already subscribed — send to app
  if (org.stripe_subscription_id) redirect(`/${orgSlug}/timeline`)

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 bg-background">
      <h1 className="text-3xl font-bold mb-2">Choose your plan</h1>
      <p className="text-muted-foreground mb-10 text-center">
        Subscribe to start using Plum Planner for{' '}
        <span className="font-medium text-foreground">{org.name}</span>.
      </p>

      <div className="grid md:grid-cols-3 gap-6 w-full max-w-4xl">
        {PLANS.map((plan) => {
          const priceId = process.env[plan.priceEnvKey] ?? ''
          return (
            <div
              key={plan.name}
              className={`rounded-xl border p-6 flex flex-col gap-4 bg-card ${
                plan.featured ? 'border-primary shadow-lg scale-[1.02]' : 'border-border'
              }`}
            >
              {plan.featured && (
                <span className="text-xs font-medium text-primary">Most popular</span>
              )}
              <div>
                <h2 className="text-xl font-semibold">{plan.name}</h2>
                <p className="text-2xl font-bold mt-1">{plan.price}</p>
                <p className="text-sm text-muted-foreground">{plan.members}</p>
              </div>
              <form
                action={async () => {
                  'use server'
                  const result = await createCheckoutSession(org.id, priceId)
                  if ('url' in result) redirect(result.url)
                }}
              >
                <Button
                  type="submit"
                  className="w-full"
                  variant={plan.featured ? 'default' : 'outline'}
                >
                  Subscribe — {plan.price}
                </Button>
              </form>
            </div>
          )
        })}
      </div>
    </div>
  )
}
