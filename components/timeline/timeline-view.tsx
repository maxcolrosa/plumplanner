'use client'

import { useMemo, useEffect } from 'react'
import { TimelineStoreContext, createTimelineStore } from '@/lib/store/timeline'
import type { EngineTask } from '@/lib/engine/types'
import type { WorkingWeek } from '@/lib/types'
import { TimelineToolbar } from './timeline-toolbar'
import { TimelineGrid } from './timeline-grid'
import { createClient } from '@/lib/supabase/client'

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
  // Skip if an optimistic edit is in flight to avoid clobbering concurrent state
  useEffect(() => {
    const { preOptimisticTasks } = store.getState()
    if (preOptimisticTasks !== null) return
    store.getState().setAllTasks(initialTasks)
  }, [initialTasks, store])

  // Supabase Realtime subscription for collaborative schedule updates
  useEffect(() => {
    const supabase = createClient()
    const storeRef = store

    const channel = supabase
      .channel(`org:${org.id}:schedule`)
      .on('broadcast', { event: 'schedule:update' }, ({ payload }) => {
        const { draggingTaskId, tasks } = storeRef.getState()
        // Guard: skip updates for a resource while user is mid-drag on that resource's task
        if (
          draggingTaskId &&
          tasks[payload.resource_id]?.some((t: EngineTask) => t.id === draggingTaskId)
        ) {
          return
        }

        const parsedTasks = (payload.tasks as Record<string, unknown>[]).map((row) => ({
          ...row,
          start_date: new Date(row.start_date as string),
          end_date: new Date(row.end_date as string),
        })) as EngineTask[]

        storeRef.getState().setTasks(payload.resource_id as string, parsedTasks)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [org.id, store])

  return (
    <TimelineStoreContext.Provider value={store}>
      <div className="flex flex-col h-full">
        <TimelineToolbar resources={resources} projects={projects} orgId={org.id} />
        <TimelineGrid resources={resources} orgId={org.id} />
      </div>
    </TimelineStoreContext.Provider>
  )
}
