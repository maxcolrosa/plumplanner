'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTimelineStore } from '@/lib/store/timeline'
import { cn } from '@/lib/utils'
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
    <>
      <div className="flex items-center gap-3 px-4 h-12 border-b border-border bg-background shrink-0">
        {/* Nav group */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewportStart(addUTCDays(viewportStart, -step))}
            className="flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:bg-plum-surface-raised hover:text-foreground transition-colors duration-150"
            title="Previous period"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={scrollToCurrentWeek}
            className="px-2 h-7 rounded text-[12px] font-medium text-muted-foreground hover:bg-plum-surface-raised hover:text-foreground transition-colors duration-150"
          >
            Today
          </button>
          <button
            onClick={() => setViewportStart(addUTCDays(viewportStart, step))}
            className="flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:bg-plum-surface-raised hover:text-foreground transition-colors duration-150"
            title="Next period"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Zoom pills */}
        <div className="flex items-center bg-muted rounded-[var(--radius)] p-0.5 gap-0.5">
          {ZOOM_LABELS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setZoomLevel(value)}
              className={cn(
                'px-2.5 h-6 rounded text-[11px] font-medium transition-colors duration-150',
                zoomLevel === value
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Actions */}
        <button
          onClick={() => setAddResourceOpen(true)}
          className="h-7 px-3 rounded-[var(--radius)] border border-border text-[12px] font-medium text-muted-foreground hover:bg-plum-surface-raised hover:text-foreground transition-colors duration-150"
        >
          + Add Resource
        </button>
        <button
          onClick={() => { setPrefillValues(null); setAddTaskOpen(true) }}
          className="h-7 px-3 rounded-[var(--radius)] bg-plum-cta text-white text-[12px] font-semibold transition-[filter] duration-150 hover:brightness-110"
          style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,.10)' }}
        >
          + Add Task
        </button>
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
    </>
  )
}
