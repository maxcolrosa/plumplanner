'use client'

import { useState } from 'react'
import { useTimelineStore } from '@/lib/store/timeline'
import { DAY_WIDTH_PX, dateToPixel } from '@/lib/timeline-utils'
import { DateAxis } from './date-axis'
import { ResourceRow } from './resource-row'
import type { WorkingWeek } from '@/lib/types'

const RESOURCE_COL_WIDTH = 192

interface TimelineGridProps {
  resources: Array<{
    id: string
    name: string
    icon_type: 'person' | 'room' | 'equipment'
    working_week: WorkingWeek
  }>
  orgId: string
}

export function TimelineGrid({ resources, orgId }: TimelineGridProps) {
  const viewportStart = useTimelineStore((s) => s.viewportStart)
  const zoomLevel = useTimelineStore((s) => s.zoomLevel)

  const [_addResourceOpen, setAddResourceOpen] = useState(false)

  const dayWidthPx = DAY_WIDTH_PX[zoomLevel]
  const visibleDayCount = { day: 60, week: 84, month: 180 }[zoomLevel]
  const totalWidthPx = RESOURCE_COL_WIDTH + visibleDayCount * dayWidthPx

  const today = new Date(
    Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate(),
    ),
  )
  const todayLineLeft =
    RESOURCE_COL_WIDTH + dateToPixel(today, viewportStart, dayWidthPx)

  if (resources.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground">
        <p>No resources yet.</p>
        <button
          className="text-sm underline underline-offset-2"
          onClick={() => setAddResourceOpen(true)}
        >
          Create your first resource
        </button>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto flex-1">
      <div style={{ minWidth: totalWidthPx }} className="flex flex-col">
        <DateAxis />
        <div className="relative">
          {/* Today line */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-timeline-today pointer-events-none z-10"
            style={{ left: todayLineLeft }}
          />
          {resources.map((resource) => (
            <ResourceRow key={resource.id} resource={resource} orgId={orgId} />
          ))}
        </div>
      </div>
    </div>
  )
}
