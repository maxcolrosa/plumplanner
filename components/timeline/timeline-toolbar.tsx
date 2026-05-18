'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTimelineStore } from '@/lib/store/timeline'
import { Button } from '@/components/ui/button'
import { addUTCDays } from '@/lib/timeline-utils'
import type { ZoomLevel } from '@/lib/timeline-utils'
import type { WorkingWeek } from '@/lib/types'

interface TimelineToolbarProps {
  resources: Array<{
    id: string
    name: string
    icon_type: 'person' | 'room' | 'equipment'
    working_week: WorkingWeek
  }>
  projects: Array<{ id: string; name: string; color: string }>
  orgId: string
}

const ZOOM_STEPS: Record<ZoomLevel, number> = {
  day: 1,
  week: 7,
  month: 30,
}

const ZOOM_LABELS: Array<{ value: ZoomLevel; label: string }> = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]

export function TimelineToolbar({ resources, projects, orgId }: TimelineToolbarProps) {
  const viewportStart = useTimelineStore((s) => s.viewportStart)
  const zoomLevel = useTimelineStore((s) => s.zoomLevel)
  const setViewportStart = useTimelineStore((s) => s.setViewportStart)
  const setZoomLevel = useTimelineStore((s) => s.setZoomLevel)
  const scrollToCurrentWeek = useTimelineStore((s) => s.scrollToCurrentWeek)

  // Dialog open states — dialogs built in Task 5
  const [_addResourceOpen, setAddResourceOpen] = useState(false)
  const [_addTaskOpen, setAddTaskOpen] = useState(false)

  const step = ZOOM_STEPS[zoomLevel]

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b gap-4 shrink-0">
      {/* Nav section */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setViewportStart(addUTCDays(viewportStart, -step))}
          aria-label="Previous period"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => scrollToCurrentWeek()}>
          Today
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setViewportStart(addUTCDays(viewportStart, step))}
          aria-label="Next period"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Zoom section */}
      <div className="flex items-center gap-1">
        {ZOOM_LABELS.map(({ value, label }) => (
          <Button
            key={value}
            variant={zoomLevel === value ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setZoomLevel(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* Actions section */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setAddResourceOpen(true)}>
          + Add Resource
        </Button>
        <Button variant="outline" size="sm" onClick={() => setAddTaskOpen(true)}>
          + Add Task
        </Button>
      </div>
    </div>
  )
}
