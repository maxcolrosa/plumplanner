import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CalendarDays, Users, Zap, Globe } from 'lucide-react'

export default function LandingPage() {
  return (
    <>
      <section className="max-w-6xl mx-auto px-4 pt-24 pb-16 text-center">
        <Badge variant="secondary" className="mb-6">Real-time team scheduling</Badge>
        <h1 className="text-5xl font-bold tracking-tight mb-6 max-w-3xl mx-auto">
          Plan your team&apos;s work — beautifully
        </h1>
        <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
          Plum Planner sits between a heavyweight project tool and a to-do list.
          See who&apos;s doing what, when. No spreadsheets, no meetings about meetings.
        </p>
        <div className="flex gap-3 justify-center">
          <Link href="/sign-up">
            <Button size="lg" className="px-8">Start planning</Button>
          </Link>
          <Link href="/pricing">
            <Button size="lg" variant="outline">View pricing</Button>
          </Link>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {
              icon: CalendarDays,
              title: 'Fixed + fluid tasks',
              description: 'Fixed tasks anchor in time. Fluid tasks flow around them automatically.',
            },
            {
              icon: Users,
              title: 'Real-time collaboration',
              description: "See your team's cursors live. Changes sync instantly — no refresh needed.",
            },
            {
              icon: Zap,
              title: 'AI-powered',
              description: 'Add tasks with natural language. Generate team status reports in one click.',
            },
            {
              icon: Globe,
              title: 'Integrations',
              description: 'Connects with Google Calendar, Slack, GitHub, and Linear.',
            },
          ].map((feature) => (
            <div key={feature.title} className="p-6 rounded-xl border bg-card">
              <feature.icon className="w-8 h-8 mb-3 text-primary" />
              <h3 className="font-semibold mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
