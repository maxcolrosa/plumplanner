'use client'

import { useMemo, useEffect } from 'react'
import { TimelineStoreContext, createTimelineStore } from '@/lib/store/timeline'
import type { EngineTask } from '@/lib/engine/types'
import type { WorkingWeek } from '@/lib/types'
import { TimelineToolbar } from './timeline-toolbar'
import { TimelineGrid } from './timeline-grid'

interface TimelineViewProps {
  initialTasks: Record<string, EngineTask[]>
  resources: Array<{
    id: string
    name: string
    icon_type: 'person' | 'room' | 'equipment'
    working_week: WorkingWeek
  }>
  org: { id: string; name: string; slug: string }
  projects: Array<{ id: string; name: string; color: string }>
}

export function TimelineView({ initialTasks, resources, org, projects }: TimelineViewProps) {
  const store = useMemo(() => createTimelineStore({ tasks: initialTasks }), [])

  // Sync when server re-fetches (e.g., after router.refresh())
  useEffect(() => {
    store.getState().setAllTasks(initialTasks)
  }, [initialTasks, store])

  return (
    <TimelineStoreContext.Provider value={store}>
      <div className="flex flex-col h-full">
        <TimelineToolbar resources={resources} projects={projects} orgId={org.id} />
        <TimelineGrid resources={resources} orgId={org.id} />
      </div>
    </TimelineStoreContext.Provider>
  )
}
