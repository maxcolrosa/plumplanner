'use client'

import { useRouter } from 'next/navigation'
import { formatWeekParam } from '@/lib/capacity-utils'

interface Props {
  weekStart: Date | string
  orgSlug: string
  children: React.ReactNode
}

export function CapacityView({ weekStart, orgSlug, children }: Props) {
  const router = useRouter()
  const weekStartDate = weekStart instanceof Date ? weekStart : new Date(weekStart)

  function navigate(deltaDays: number) {
    const next = new Date(weekStartDate)
    next.setUTCDate(next.getUTCDate() + deltaDays)
    router.push(`/${orgSlug}/capacity?week=${formatWeekParam(next)}`)
  }

  const label = weekStartDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-7)}
          className="px-2 py-1 text-sm border border-border rounded hover:bg-accent transition-colors"
        >
          ←
        </button>
        <span className="text-sm font-medium">Week of {label}</span>
        <button
          onClick={() => navigate(7)}
          className="px-2 py-1 text-sm border border-border rounded hover:bg-accent transition-colors"
        >
          →
        </button>
      </div>
      {children}
    </div>
  )
}
