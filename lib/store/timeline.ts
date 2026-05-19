import { createStore, useStore } from 'zustand'
import type { StoreApi } from 'zustand'
import { createContext, useContext } from 'react'
import type { EngineTask, ConstraintViolation } from '@/lib/engine/types'
import type { ZoomLevel } from '@/lib/timeline-utils'
import { startOfCurrentWeekUTC } from '@/lib/timeline-utils'

// ---------------------------------------------------------------------------
// State + Actions
// ---------------------------------------------------------------------------

interface TimelineState {
  viewportStart: Date
  zoomLevel: ZoomLevel
  tasks: Record<string, EngineTask[]>        // keyed by resource_id
  violations: ConstraintViolation[]
  selectedTaskId: string | null
  draggingTaskId: string | null
  preOptimisticTasks: Record<string, EngineTask[]> | null
  connectedUserIds: Set<string>    // user IDs with calendar connected
  taskSyncErrors: Set<string>      // task IDs with sync_error=true
}

interface TimelineActions {
  setViewportStart: (d: Date) => void
  setZoomLevel: (z: ZoomLevel) => void
  scrollToCurrentWeek: () => void
  setTasks: (resourceId: string, tasks: EngineTask[]) => void
  setAllTasks: (tasks: Record<string, EngineTask[]>) => void
  setViolations: (v: ConstraintViolation[]) => void
  setSelectedTask: (id: string | null) => void
  setDragging: (id: string | null) => void
  setConnectedUserIds: (ids: Set<string>) => void
  setTaskSyncErrors: (ids: Set<string>) => void
  beginOptimistic: (resourceId: string, newTasks: EngineTask[]) => void
  commitOptimistic: () => void
  revertOptimistic: () => void
}

// ---------------------------------------------------------------------------
// Store factory (vanilla — one instance per component tree via useMemo)
// ---------------------------------------------------------------------------

export type TimelineStore = StoreApi<TimelineState & TimelineActions>

export function createTimelineStore(
  initial?: Partial<TimelineState>,
): TimelineStore {
  return createStore<TimelineState & TimelineActions>((set, get) => ({
    // --- default state ---
    viewportStart: startOfCurrentWeekUTC(),
    zoomLevel: 'week',
    tasks: {},
    violations: [],
    selectedTaskId: null,
    draggingTaskId: null,
    preOptimisticTasks: null,
    connectedUserIds: initial?.connectedUserIds ?? new Set<string>(),
    taskSyncErrors: initial?.taskSyncErrors ?? new Set<string>(),
    // spread caller overrides (excluding Set fields handled above)
    ...initial,

    // --- actions ---
    setViewportStart: (d) => set({ viewportStart: d }),

    setZoomLevel: (z) => set({ zoomLevel: z }),

    scrollToCurrentWeek: () => set({ viewportStart: startOfCurrentWeekUTC() }),

    setTasks: (resourceId, tasks) =>
      set((state) => ({
        tasks: { ...state.tasks, [resourceId]: tasks },
      })),

    setAllTasks: (tasks) => set({ tasks }),

    setViolations: (v) => set({ violations: v }),

    setSelectedTask: (id) => set({ selectedTaskId: id }),

    setDragging: (id) => set({ draggingTaskId: id }),

    setConnectedUserIds: (ids) => set({ connectedUserIds: ids }),

    setTaskSyncErrors: (ids) => set({ taskSyncErrors: ids }),

    beginOptimistic: (resourceId, newTasks) =>
      set((state) => ({
        preOptimisticTasks: state.preOptimisticTasks ?? state.tasks, // keep original snapshot if already in optimistic state
        tasks: { ...state.tasks, [resourceId]: newTasks },
      })),

    commitOptimistic: () => set({ preOptimisticTasks: null }),

    revertOptimistic: () =>
      set((state) => ({
        tasks: state.preOptimisticTasks ?? state.tasks,
        preOptimisticTasks: null,
      })),
  }))
}

// ---------------------------------------------------------------------------
// React context + hook
// ---------------------------------------------------------------------------

export const TimelineStoreContext = createContext<TimelineStore | null>(null)

export function useTimelineStore<T>(
  selector: (s: TimelineState & TimelineActions) => T,
): T {
  const store = useContext(TimelineStoreContext)
  if (!store) {
    throw new Error(
      'useTimelineStore must be used inside a TimelineStoreContext.Provider',
    )
  }
  return useStore(store, selector)
}
