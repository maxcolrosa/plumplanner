'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTimelineStore } from '@/lib/store/timeline'
import { Button } from '@/components/ui/button'
import { addUTCDays } from '@/lib/timeline-utils'
import type { ZoomLevel } from '@/lib/timeline-utils'
import type { WorkingWeek } from '@/lib/types'
import { AddTaskDialog } from '@/components/timeline/add-task-dialog'
import type { PrefillValues } from '@/components/timeline/add-task-dialog'
import { CreateResourceDialog } from '@/components/timeline/create-resource-dialog'

function todayUTCString() {
  return new Date().toISOString().slice(0, 10)
}

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

  // Dialog open states
  const [addResourceOpen, setAddResourceOpen] = useState(false)
  const [addTaskOpen, setAddTaskOpen] = useState(false)
  const [prefillValues, setPrefillValues] = useState<PrefillValues | null>(null)

  const searchParams = useSearchParams()

  useEffect(() => {
    const qaName = searchParams.get('qa_name')
    if (!qaName) return

    setPrefillValues({
      name: qaName,
      resourceId: searchParams.get('qa_resource') ?? resources[0]?.id ?? '',
      durationHours: Number(searchParams.get('qa_duration') ?? 8),
      type: (searchParams.get('qa_type') ?? 'fluid') as 'fluid' | 'fixed',
      startDate: searchParams.get('qa_start') ?? todayUTCString(),
    })
    setAddTaskOpen(true)

    // Clean up URL without triggering a navigation flash
    const url = new URL(window.location.href)
    url.searchParams.delete('qa_name')
    url.searchParams.delete('qa_resource')
    url.searchParams.delete('qa_duration')
    url.searchParams.delete('qa_type')
    url.searchParams.delete('qa_start')
    window.history.replaceState({}, '', url.toString())
  }, [searchParams, resources])

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
        <Button variant="outline" size="sm" onClick={() => { setPrefillValues(null); setAddTaskOpen(true) }}>
          + Add Task
        </Button>
      </div>

      <AddTaskDialog
        open={addTaskOpen}
        onClose={() => { setAddTaskOpen(false); setPrefillValues(null) }}
        resources={resources}
        projects={projects}
        orgId={orgId}
        initialValues={prefillValues}
      />
      <CreateResourceDialog
        open={addResourceOpen}
        onClose={() => setAddResourceOpen(false)}
        orgId={orgId}
      />
    </div>
  )
}
