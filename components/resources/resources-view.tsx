'use client'

import { useMemo, useEffect } from 'react'
import { createResourcesStore, ResourcesStoreContext } from '@/lib/store/resources'
import { ResourceColumn } from './resource-column'
import type { EngineTask } from '@/lib/engine/types'

interface Props {
  resources: Array<{ id: string; name: string; icon_type: string }>
  initialTasks: Record<string, EngineTask[]>
  orgId: string
}

export function ResourcesView({ resources, initialTasks, orgId }: Props) {
  const store = useMemo(() => createResourcesStore({ tasks: initialTasks }), [])

  useEffect(() => {
    const { preOptimisticTasks } = store.getState()
    if (preOptimisticTasks !== null) return
    store.getState().setAllTasks(initialTasks)
  }, [initialTasks, store])

  return (
    <ResourcesStoreContext.Provider value={store}>
      <div className="flex gap-4 p-4 overflow-x-auto h-full items-start">
        {resources.length === 0 ? (
          <p className="text-sm text-muted-foreground m-auto">No resources yet. Add one from the Timeline.</p>
        ) : (
          resources.map(resource => (
            <ResourceColumn key={resource.id} resource={resource} orgId={orgId} />
          ))
        )}
      </div>
    </ResourcesStoreContext.Provider>
  )
}
