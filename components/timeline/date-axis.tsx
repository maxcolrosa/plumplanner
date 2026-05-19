'use client'

import { useTimelineStore } from '@/lib/store/timeline'
import {
  DAY_WIDTH_PX,
  VISIBLE_DAY_COUNT,
  RESOURCE_COL_WIDTH,
  getVisibleDays,
  formatAxisDate,
} from '@/lib/timeline-utils'

export function DateAxis() {
  const viewportStart = useTimelineStore((s) => s.viewportStart)
  const zoomLevel = useTimelineStore((s) => s.zoomLevel)

  const dayWidthPx = DAY_WIDTH_PX[zoomLevel]
  const visibleDayCount = VISIBLE_DAY_COUNT[zoomLevel]
  const totalWidthPx = RESOURCE_COL_WIDTH + visibleDayCount * dayWidthPx

  const days = getVisibleDays(viewportStart, totalWidthPx - RESOURCE_COL_WIDTH, dayWidthPx)

  const now = new Date()
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())

  return (
    <div className="h-12 sticky top-0 z-10 flex border-b bg-background shrink-0">
      {/* Spacer aligns with resource name column */}
      <div className="w-48 shrink-0" />
      {/* Day columns */}
      {days.map((date) => {
        const isWeekend = date.getUTCDay() === 0 || date.getUTCDay() === 6
        const isToday = date.getTime() === todayUTC

        return (
          <div
            key={date.getTime()}
            style={{ width: dayWidthPx, minWidth: dayWidthPx }}
            className={[
              'flex items-center justify-center text-[10px] truncate border-r border-border/30',
              isWeekend ? 'bg-muted/30' : '',
              isToday
                ? 'bg-plum-accent-subtle/60 text-plum-accent font-semibold'
                : 'text-muted-foreground',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {dayWidthPx >= 14 ? formatAxisDate(date, zoomLevel) : null}
          </div>
        )
      })}
    </div>
  )
}
