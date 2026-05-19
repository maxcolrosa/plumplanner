'use client'

import { createStore, useStore } from 'zustand'
import type { StoreApi } from 'zustand'
import { createContext, useContext } from 'react'
import type { EngineTask } from '@/lib/engine/types'

interface ResourcesState {
  tasks: Record<string, EngineTask[]>
  draggingTaskId: string | null
  draggingFromResourceId: string | null
  preOptimisticTasks: Record<string, EngineTask[]> | null
}

interface ResourcesActions {
  setTasks: (resourceId: string, tasks: EngineTask[]) => void
  setAllTasks: (tasks: Record<string, EngineTask[]>) => void
  setDragging: (taskId: string | null, fromResourceId: string | null) => void
  beginOptimistic: () => void
  commitOptimistic: () => void
  revertOptimistic: () => void
}

export type ResourcesStore = StoreApi<ResourcesState & ResourcesActions>

export function createResourcesStore(
  initial?: Partial<ResourcesState>,
): ResourcesStore {
  return createStore<ResourcesState & ResourcesActions>((set) => ({
    tasks: {},
    draggingTaskId: null,
    draggingFromResourceId: null,
    preOptimisticTasks: null,
    ...initial,
    setTasks: (resourceId, tasks) =>
      set((s) => ({ tasks: { ...s.tasks, [resourceId]: tasks } })),
    setAllTasks: (tasks) => set({ tasks }),
    setDragging: (taskId, fromResourceId) =>
      set({ draggingTaskId: taskId, draggingFromResourceId: fromResourceId }),
    beginOptimistic: () => set((s) => ({ preOptimisticTasks: s.tasks })),
    commitOptimistic: () => set({ preOptimisticTasks: null }),
    revertOptimistic: () =>
      set((s) =>
        s.preOptimisticTasks
          ? { tasks: s.preOptimisticTasks, preOptimisticTasks: null }
          : {},
      ),
  }))
}

export const ResourcesStoreContext = createContext<ResourcesStore | null>(null)

export function useResourcesStore<T>(
  selector: (s: ResourcesState & ResourcesActions) => T,
): T {
  const store = useContext(ResourcesStoreContext)
  if (!store) {
    throw new Error(
      'useResourcesStore must be used inside a ResourcesStoreContext.Provider',
    )
  }
  return useStore(store, selector)
}
