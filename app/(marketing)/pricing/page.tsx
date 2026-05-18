import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Check } from 'lucide-react'

const plans = [
  {
    name: 'Starter',
    price: { monthly: '$99', annual: '$950' },
    description: 'Perfect for small teams just getting started.',
    members: 'Up to 5 members',
    features: [
      'Unlimited resources',
      'Fixed & fluid task scheduling',
      'Real-time collaboration',
      'AI quick-add & status reports',
      'Calendar integration (Google/Outlook)',
      'Email support',
    ],
    cta: 'Get Starter',
    href: '/sign-up',
    featured: false,
  },
  {
    name: 'Team',
    price: { monthly: '$249', annual: '$2,390' },
    description: 'For growing teams that need more power.',
    members: 'Up to 15 members',
    features: [
      'Everything in Starter',
      'Slack integration',
      'GitHub & Linear integration',
      'Capacity heatmap',
      'Priority support',
    ],
    cta: 'Get Team',
    href: '/sign-up',
    featured: true,
  },
  {
    name: 'Agency',
    price: { monthly: '$499', annual: '$4,790' },
    description: 'For agencies managing multiple projects at once.',
    members: 'Up to 25 members',
    features: [
      'Everything in Team',
      'Multiple projects',
      'Advanced reporting',
      'Dedicated onboarding',
      'SLA support',
    ],
    cta: 'Get Agency',
    href: '/sign-up',
    featured: false,
  },
]

export default function PricingPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-16">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold tracking-tight mb-4">Simple, predictable pricing</h1>
        <p className="text-lg text-muted-foreground">
          Flat monthly price — no per-seat surprises.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <Card key={plan.name} className={plan.featured ? 'border-primary shadow-lg scale-[1.02]' : ''}>
            <CardHeader>
              {plan.featured && <Badge className="w-fit mb-2">Most popular</Badge>}
              <CardTitle>{plan.name}</CardTitle>
              <CardDescription>{plan.description}</CardDescription>
              <div className="pt-2">
                <span className="text-4xl font-bold">{plan.price.monthly}</span>
                <span className="text-muted-foreground text-sm">/month</span>
                <p className="text-xs text-muted-foreground mt-1">
                  or {plan.price.annual}/year (save ~20%)
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm font-medium">{plan.members}</p>
              <ul className="space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href={plan.href} className="block pt-2">
                <Button className="w-full" variant={plan.featured ? 'default' : 'outline'}>
                  {plan.cta}
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
