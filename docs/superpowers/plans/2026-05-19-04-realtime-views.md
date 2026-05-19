# Plan 4: Real-time + Views

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Resources kanban view, a Capacity heatmap view, and a who's-online presence panel to Plum Planner.

**Architecture:** Three independent features. Resources view: Zustand v5 store (mirrors timeline store pattern) for kanban drag state; drag within a column calls existing `reorderFluidTask`; drag between columns calls new `reassignTask` server action. Capacity view: pure server-rendered math passed to thin client wrapper for week navigation via URL search params. Presence: Supabase Realtime presence API in a `usePresence` hook; `SidebarNav` (already a client component) mounts it and renders a `WhoIsOnline` panel.

**Tech Stack:** Next.js 15 App Router, Supabase Realtime (presence API), Zustand v5 (`createStore`), Framer Motion (kanban drag), Tailwind CSS, Vitest, TypeScript

---

## File Map

| File | Change | Purpose |
|------|--------|---------|
| `lib/capacity-utils.ts` | Create | Pure util: day contribution, heatmap cells, KPIs, week param parsing |
| `__tests__/lib/capacity-utils.test.ts` | Create | TDD tests for capacity math |
| `actions/schedule.ts` | Modify | Add `reassignTask` server action |
| `lib/store/resources.ts` | Create | Zustand v5 store for resources kanban drag state |
| `app/(app)/[orgSlug]/resources/page.tsx` | Create | Server component: fetch resources + tasks |
| `components/resources/resources-view.tsx` | Create | Client root: mounts resources store |
| `components/resources/resource-column.tsx` | Create | One droppable kanban column per resource |
| `components/resources/resource-task-card.tsx` | Create | Draggable fluid task card |
| `app/(app)/[orgSlug]/capacity/page.tsx` | Create | Server component: fetch tasks, compute heatmap |
| `components/capacity/capacity-view.tsx` | Create | Client wrapper: week nav prev/next |
| `components/capacity/kpi-cards.tsx` | Create | Three team KPI stat cards |
| `components/capacity/capacity-heatmap.tsx` | Create | Resources × days heatmap grid |
| `hooks/use-presence.ts` | Create | Supabase Realtime presence hook |
| `components/presence/who-is-online.tsx` | Create | Online users list (name + current page) |
| `components/sidebar-nav.tsx` | Modify | Accept user props, mount presence hook, render WhoIsOnline |
| `app/(app)/[orgSlug]/layout.tsx` | Modify | Fetch current user, pass to SidebarNav |

---

## Key Architecture Decisions

- **`reassignTask`** reuses the existing `persistAndBroadcast` helper from `actions/schedule.ts` — call it once for the source resource (old tasks minus the moved task) and once for the target resource (new tasks including the moved task). The task's `resource_id` is updated in the DB as part of the upsert.
- **Resources store** mirrors `lib/store/timeline.ts` exactly: `createStore`, context pattern, `useResourcesStore(selector)` hook. Includes `beginOptimistic()` (no-arg snapshot), `commitOptimistic()`, `revertOptimistic()`.
- **Capacity math** is pure TypeScript in `lib/capacity-utils.ts`. Per-day contribution = `task.duration_hours / calendarDaySpan`. Week navigation via `?week=YYYY-WNN` search param — server re-fetches, no client task state.
- **Presence** uses Supabase built-in presence API (`channel.track` / `presenceState`). Channel: `org:{orgId}:presence`. `SidebarNav` already a client component — ideal place to mount. Page label derived from `usePathname()`.
- **Nav links** for Resources and Capacity already exist in `SidebarNav` — no changes needed there.
- All UTC — no `getDay()`, `getDate()`, `getMonth()`.

---

## Task 1: Capacity Utils (TDD)

**Files:**
- Create: `lib/capacity-utils.ts`
- Create: `__tests__/lib/capacity-utils.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// __tests__/lib/capacity-utils.test.ts
import { describe, it, expect } from 'vitest'
import {
  taskDayContributionHours,
  computeWeekCells,
  computeKPIs,
  parseWeekParam,
  formatWeekParam,
  getWeekDays,
} from '@/lib/capacity-utils'
import type { EngineTask } from '@/lib/engine/types'

function makeTask(overrides: Partial<EngineTask> = {}): EngineTask {
  return {
    id: 'task-1',
    org_id: 'org-1',
    resource_id: 'res-1',
    project_id: null,
    name: 'Test',
    type: 'fluid',
    status: 'pending',
    start_date: new Date(Date.UTC(2026, 4, 18)), // Mon 18 May
    end_date: new Date(Date.UTC(2026, 4, 18)),
    duration_hours: 8,
    actual_duration_hours: null,
    position: 0,
    task_group_id: null,
    segment_index: null,
    constraints: [],
    tags: [],
    external_ref: null,
    ...overrides,
  }
}

const WORKING_WEEK = { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 0, sun: 0 }

describe('taskDayContributionHours', () => {
  it('single-day task contributes full duration_hours to that day', () => {
    const task = makeTask({ duration_hours: 8 })
    expect(taskDayContributionHours(task, new Date(Date.UTC(2026, 4, 18)))).toBe(8)
  })

  it('3-day task contributes duration_hours/3 per day', () => {
    const task = makeTask({
      duration_hours: 24,
      start_date: new Date(Date.UTC(2026, 4, 18)),
      end_date: new Date(Date.UTC(2026, 4, 20)),
    })
    expect(taskDayContributionHours(task, new Date(Date.UTC(2026, 4, 19)))).toBe(8)
  })

  it('returns 0 for a day before task start', () => {
    const task = makeTask()
    expect(taskDayContributionHours(task, new Date(Date.UTC(2026, 4, 17)))).toBe(0)
  })

  it('returns 0 for a day after task end', () => {
    const task = makeTask()
    expect(taskDayContributionHours(task, new Date(Date.UTC(2026, 4, 19)))).toBe(0)
  })
})

describe('computeWeekCells', () => {
  it('produces one cell per resource per weekday', () => {
    const weekDays = getWeekDays(new Date(Date.UTC(2026, 4, 18)))
    const resources = [{ id: 'res-1', name: 'Alice', working_week: WORKING_WEEK }]
    const cells = computeWeekCells(weekDays, resources, [])
    expect(cells).toHaveLength(5)
  })

  it('accumulates booked hours from tasks overlapping that day', () => {
    const weekDays = getWeekDays(new Date(Date.UTC(2026, 4, 18)))
    const resources = [{ id: 'res-1', name: 'Alice', working_week: WORKING_WEEK }]
    const tasks = [makeTask({ duration_hours: 8 })]
    const cells = computeWeekCells(weekDays, resources, tasks)
    const monCell = cells.find(c => c.resourceId === 'res-1' && c.dayIndex === 0)!
    expect(monCell.bookedHours).toBe(8)
    expect(monCell.capacityHours).toBe(8)
    expect(monCell.utilization).toBe(1)
    expect(monCell.overloaded).toBe(false)
  })

  it('marks overloaded when booked exceeds capacity', () => {
    const weekDays = getWeekDays(new Date(Date.UTC(2026, 4, 18)))
    const resources = [{ id: 'res-1', name: 'Alice', working_week: WORKING_WEEK }]
    const tasks = [makeTask({ duration_hours: 12 })]
    const cells = computeWeekCells(weekDays, resources, tasks)
    const monCell = cells.find(c => c.resourceId === 'res-1' && c.dayIndex === 0)!
    expect(monCell.overloaded).toBe(true)
  })
})

describe('computeKPIs', () => {
  it('computes avgUtilization, overloadedDays, slackHours', () => {
    const cells = [
      { resourceId: 'r1', dayIndex: 0, bookedHours: 8, capacityHours: 8, utilization: 1, overloaded: false, tasks: [] },
      { resourceId: 'r1', dayIndex: 1, bookedHours: 4, capacityHours: 8, utilization: 0.5, overloaded: false, tasks: [] },
      { resourceId: 'r1', dayIndex: 2, bookedHours: 10, capacityHours: 8, utilization: 1.25, overloaded: true, tasks: [] },
    ]
    const kpis = computeKPIs(cells)
    expect(kpis.avgUtilization).toBeCloseTo((1 + 0.5 + 1.25) / 3)
    expect(kpis.overloadedDays).toBe(1)
    expect(kpis.slackHours).toBe(4) // only the 4h gap on day with 4h booked / 8h capacity
  })
})

describe('parseWeekParam / formatWeekParam', () => {
  it('round-trips a known Monday', () => {
    const weekStart = new Date(Date.UTC(2026, 4, 18))
    expect(parseWeekParam(formatWeekParam(weekStart))).toEqual(weekStart)
  })

  it('parseWeekParam(null) returns current week Monday', () => {
    const result = parseWeekParam(null)
    expect(result.getUTCDay()).toBe(1)
  })
})
```

- [ ] **Step 2: Run to confirm all fail**

```bash
pnpm test __tests__/lib/capacity-utils.test.ts
```
Expected: all fail with "Cannot find module '@/lib/capacity-utils'"

- [ ] **Step 3: Implement `lib/capacity-utils.ts`**

```ts
import type { EngineTask } from '@/lib/engine/types'

export type WorkingWeekConfig = {
  mon: number; tue: number; wed: number; thu: number; fri: number; sat: number; sun: number
}

export interface CapacityCell {
  resourceId: string
  dayIndex: number        // 0=Mon … 4=Fri
  bookedHours: number
  capacityHours: number
  utilization: number
  overloaded: boolean
  tasks: Array<{ id: string; name: string; hours: number }>
}

export interface CapacityKPIs {
  avgUtilization: number
  overloadedDays: number
  slackHours: number
}

export function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(weekStart)
    d.setUTCDate(d.getUTCDate() + i)
    return d
  })
}

export function taskDayContributionHours(task: EngineTask, day: Date): number {
  const dayMs = day.getTime()
  const startMs = task.start_date.getTime()
  const endMs = task.end_date.getTime()
  if (dayMs < startMs || dayMs > endMs) return 0
  const calendarDays = Math.round((endMs - startMs) / 86_400_000) + 1
  return task.duration_hours / calendarDays
}

export function computeWeekCells(
  weekDays: Date[],
  resources: Array<{ id: string; name: string; working_week: WorkingWeekConfig }>,
  tasks: EngineTask[]
): CapacityCell[] {
  const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri'] as const
  const cells: CapacityCell[] = []

  for (const [dayIndex, day] of weekDays.entries()) {
    const dayKey = DAY_KEYS[dayIndex]
    for (const resource of resources) {
      const capacityHours = resource.working_week[dayKey] ?? 0
      const resourceTasks = tasks.filter(t => t.resource_id === resource.id)
      const taskContributions = resourceTasks
        .map(t => ({ id: t.id, name: t.name, hours: taskDayContributionHours(t, day) }))
        .filter(t => t.hours > 0)
      const bookedHours = taskContributions.reduce((sum, t) => sum + t.hours, 0)
      const utilization = capacityHours > 0 ? bookedHours / capacityHours : 0
      cells.push({
        resourceId: resource.id,
        dayIndex,
        bookedHours,
        capacityHours,
        utilization,
        overloaded: bookedHours > capacityHours,
        tasks: taskContributions,
      })
    }
  }
  return cells
}

export function computeKPIs(cells: CapacityCell[]): CapacityKPIs {
  const activeCells = cells.filter(c => c.capacityHours > 0)
  const avgUtilization = activeCells.length > 0
    ? activeCells.reduce((sum, c) => sum + c.utilization, 0) / activeCells.length
    : 0
  const overloadedDays = cells.filter(c => c.overloaded).length
  const slackHours = activeCells
    .filter(c => !c.overloaded)
    .reduce((sum, c) => sum + (c.capacityHours - c.bookedHours), 0)
  return { avgUtilization, overloadedDays, slackHours }
}

export function formatWeekParam(weekStart: Date): string {
  const y = weekStart.getUTCFullYear()
  const jan4 = new Date(Date.UTC(y, 0, 4))
  const startOfW1 = new Date(jan4)
  startOfW1.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7))
  const weekNum = Math.round((weekStart.getTime() - startOfW1.getTime()) / (7 * 86_400_000)) + 1
  return `${y}-W${String(weekNum).padStart(2, '0')}`
}

export function parseWeekParam(param: string | null): Date {
  if (!param) return currentWeekMonday()
  const match = param.match(/^(\d{4})-W(\d{2})$/)
  if (!match) return currentWeekMonday()
  const year = Number(match[1])
  const week = Number(match[2])
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const startOfW1 = new Date(jan4)
  startOfW1.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7))
  const weekStart = new Date(startOfW1)
  weekStart.setUTCDate(startOfW1.getUTCDate() + (week - 1) * 7)
  return weekStart
}

function currentWeekMonday(): Date {
  const now = new Date()
  const day = now.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff))
}
```

- [ ] **Step 4: Run tests — all must pass**

```bash
pnpm test __tests__/lib/capacity-utils.test.ts
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/capacity-utils.ts __tests__/lib/capacity-utils.test.ts
git commit -m "feat: capacity utils — utilization math, heatmap cells, KPIs, week param parsing"
```

---

## Task 2: `reassignTask` Server Action

**Files:**
- Modify: `actions/schedule.ts`

`reassignTask` reuses the existing `persistAndBroadcast` helper (already in `actions/schedule.ts`). Read the file first to understand the helper signature before implementing.

- [ ] **Step 1: Add `reassignTask` to `actions/schedule.ts`**

Add this export after `reorderFluidTask`. The existing `fetchResourceAndTasks`, `persistAndBroadcast`, `toEngineTask`, and engine imports (`insertTask`, `deleteTask` from `@/lib/engine/scheduler`) are already present.

```ts
export async function reassignTask(
  taskId: string,
  toResourceId: string,
  atPosition: number
): Promise<
  | { sourceTasks: EngineTask[]; targetTasks: EngineTask[]; violations: ConstraintViolation[] }
  | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Fetch the task to move
  const { data: taskRow } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single()
  if (!taskRow) return { error: 'Task not found' }
  if (taskRow.type !== 'fluid') return { error: 'Only fluid tasks can be reassigned' }

  const fromResourceId: string = taskRow.resource_id
  if (fromResourceId === toResourceId) return { error: 'Task is already on this resource' }

  // Verify org membership
  const { data: membership } = await supabase
    .from('org_members')
    .select('id')
    .eq('org_id', taskRow.org_id)
    .eq('user_id', user.id)
    .not('joined_at', 'is', null)
    .single()
  if (!membership) return { error: 'Not a member of this organisation' }

  // Fetch both resource task lists
  const [sourceResult, targetResult] = await Promise.all([
    fetchResourceAndTasks(fromResourceId, supabase),
    fetchResourceAndTasks(toResourceId, supabase),
  ])
  if (sourceResult.error) return { error: sourceResult.error }
  if (targetResult.error) return { error: targetResult.error }

  const sourceTasks = sourceResult.tasks
  const targetTasks = targetResult.tasks

  // Run engine: remove from source, insert into target (keeping same task ID)
  const movedTask = toEngineTask({ ...taskRow, resource_id: toResourceId })
  const newSourceTasks = deleteTask(sourceTasks, taskId)
  const { tasks: newTargetTasks, violations } = insertTask(
    targetTasks.filter(t => t.id !== taskId), // exclude if already present
    movedTask,
    atPosition
  )

  // Persist + broadcast both resources (persistAndBroadcast handles upsert + delete + broadcast)
  const [sourceErr, targetErr] = await Promise.all([
    persistAndBroadcast(fromResourceId, sourceTasks, newSourceTasks, taskRow.org_id, supabase),
    persistAndBroadcast(toResourceId, targetTasks, newTargetTasks, taskRow.org_id, supabase),
  ])
  if (sourceErr) return { error: sourceErr }
  if (targetErr) return { error: targetErr }

  return { sourceTasks: newSourceTasks, targetTasks: newTargetTasks, violations }
}
```

**Note:** Check the actual signatures of `fetchResourceAndTasks` and `persistAndBroadcast` in the file before implementing — adapt parameter names and return shapes to match exactly. The above is a structural guide, not verbatim.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm build 2>&1 | grep -E "error TS|Error"
```
Expected: no errors related to `reassignTask`.

- [ ] **Step 3: Run full test suite to confirm no regressions**

```bash
pnpm test
```
Expected: all existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add actions/schedule.ts
git commit -m "feat: reassignTask — atomically moves fluid task between resources"
```

---

## Task 3: Resources Store + Server Page

**Files:**
- Create: `lib/store/resources.ts`
- Create: `app/(app)/[orgSlug]/resources/page.tsx`

- [ ] **Step 1: Create `lib/store/resources.ts`**

Mirror `lib/store/timeline.ts` exactly. Differences: no viewport/zoom state; `beginOptimistic()` takes no args (snapshots all current tasks).

```ts
'use client'

import { createStore, useStore } from 'zustand'
import { createContext, useContext } from 'react'
import type { EngineTask } from '@/lib/engine/types'

interface ResourcesState {
  tasks: Record<string, EngineTask[]>             // keyed by resource_id
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

export type ResourcesStore = ReturnType<typeof createResourcesStore>

export function createResourcesStore(initial?: Partial<ResourcesState>): ResourcesStore {
  return createStore<ResourcesState & ResourcesActions>((set) => ({
    tasks: {},
    draggingTaskId: null,
    draggingFromResourceId: null,
    preOptimisticTasks: null,
    ...initial,
    setTasks: (resourceId, tasks) =>
      set(s => ({ tasks: { ...s.tasks, [resourceId]: tasks } })),
    setAllTasks: tasks => set({ tasks }),
    setDragging: (taskId, fromResourceId) =>
      set({ draggingTaskId: taskId, draggingFromResourceId: fromResourceId }),
    beginOptimistic: () => set(s => ({ preOptimisticTasks: s.tasks })),
    commitOptimistic: () => set({ preOptimisticTasks: null }),
    revertOptimistic: () =>
      set(s => s.preOptimisticTasks
        ? { tasks: s.preOptimisticTasks, preOptimisticTasks: null }
        : {}),
  }))
}

export const ResourcesStoreContext = createContext<ResourcesStore | null>(null)

export function useResourcesStore<T>(
  selector: (s: ResourcesState & ResourcesActions) => T
): T {
  const store = useContext(ResourcesStoreContext)
  if (!store) throw new Error('useResourcesStore must be used inside ResourcesStoreContext.Provider')
  return useStore(store, selector)
}
```

- [ ] **Step 2: Create `app/(app)/[orgSlug]/resources/page.tsx`**

```tsx
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ResourcesView } from '@/components/resources/resources-view'
import type { EngineTask } from '@/lib/engine/types'

export default async function ResourcesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const supabase = await createClient()

  const { data: org } = await supabase
    .from('orgs')
    .select('id, name, slug')
    .eq('slug', orgSlug)
    .single()
  if (!org) notFound()

  const [{ data: resources }, { data: taskRows }] = await Promise.all([
    supabase
      .from('resources')
      .select('id, name, icon_type, working_week')
      .eq('org_id', org.id),
    supabase
      .from('tasks')
      .select('*')
      .eq('org_id', org.id)
      .order('position'),
  ])

  function toDate(s: string): Date {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d))
  }

  const tasks = (taskRows ?? []).map(row => ({
    ...row,
    start_date: toDate(row.start_date),
    end_date: toDate(row.end_date),
  })) as EngineTask[]

  const tasksByResource = tasks.reduce<Record<string, EngineTask[]>>((acc, t) => {
    acc[t.resource_id] = [...(acc[t.resource_id] ?? []), t]
    return acc
  }, {})

  return (
    <ResourcesView
      resources={resources ?? []}
      initialTasks={tasksByResource}
      orgId={org.id}
    />
  )
}
```

- [ ] **Step 3: Verify build**

```bash
pnpm build 2>&1 | grep -E "error TS|Error"
```

- [ ] **Step 4: Commit**

```bash
git add lib/store/resources.ts "app/(app)/[orgSlug]/resources/page.tsx"
git commit -m "feat: resources store + server page"
```

---

## Task 4: Resources Kanban Components

**Files:**
- Create: `components/resources/resources-view.tsx`
- Create: `components/resources/resource-column.tsx`
- Create: `components/resources/resource-task-card.tsx`

- [ ] **Step 1: Create `components/resources/resources-view.tsx`**

```tsx
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
```

- [ ] **Step 2: Create `components/resources/resource-column.tsx`**

```tsx
'use client'

import { useRef } from 'react'
import { User, Building2, Wrench } from 'lucide-react'
import { useResourcesStore } from '@/lib/store/resources'
import { ResourceTaskCard } from './resource-task-card'

const ICONS = {
  person: User,
  room: Building2,
  equipment: Wrench,
} as const

interface Props {
  resource: { id: string; name: string; icon_type: string }
  orgId: string
}

export function ResourceColumn({ resource, orgId }: Props) {
  const columnRef = useRef<HTMLDivElement>(null)
  const tasks = useResourcesStore(s => s.tasks[resource.id] ?? [])
  const fluidTasks = tasks
    .filter(t => t.type === 'fluid')
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const fixedTasks = tasks.filter(t => t.type === 'fixed')
  const Icon = ICONS[resource.icon_type as keyof typeof ICONS] ?? User

  return (
    <div
      ref={columnRef}
      data-resource-id={resource.id}
      className="flex flex-col w-56 shrink-0 rounded-lg border border-border bg-muted/20 p-3 min-h-48"
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="font-medium text-sm text-foreground truncate">{resource.name}</span>
        <span className="ml-auto text-xs text-muted-foreground">{fluidTasks.length}</span>
      </div>

      <div className="flex flex-col gap-2 flex-1">
        {fluidTasks.map(task => (
          <ResourceTaskCard
            key={task.id}
            task={task}
            fromResourceId={resource.id}
            orgId={orgId}
          />
        ))}
      </div>

      {fixedTasks.length > 0 && (
        <>
          <div className="mt-3 mb-1.5 text-xs text-muted-foreground uppercase tracking-wide border-t border-border pt-2">
            Fixed
          </div>
          {fixedTasks.map(task => (
            <div
              key={task.id}
              className="rounded border border-blue-500/30 bg-blue-500/10 px-2 py-1.5 text-xs text-foreground mb-1"
            >
              🔒 {task.name}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create `components/resources/resource-task-card.tsx`**

Drop detection: on `onDragEnd`, iterate all `[data-resource-id]` elements to find which column bounding box contains the drop point. Count cards above the drop Y to determine `atPosition`.

```tsx
'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { useResourcesStore } from '@/lib/store/resources'
import { reassignTask, reorderFluidTask } from '@/actions/schedule'
import type { EngineTask } from '@/lib/engine/types'

interface Props {
  task: EngineTask
  fromResourceId: string
  orgId: string
}

export function ResourceTaskCard({ task, fromResourceId }: Props) {
  const store = useResourcesStore(s => s)
  const [shaking, setShaking] = useState(false)

  function findDrop(px: number, py: number): { resourceId: string; position: number } | null {
    const columns = document.querySelectorAll<HTMLElement>('[data-resource-id]')
    for (const col of columns) {
      const rect = col.getBoundingClientRect()
      if (px < rect.left || px > rect.right || py < rect.top || py > rect.bottom) continue
      const resourceId = col.dataset.resourceId!
      const cards = col.querySelectorAll<HTMLElement>('[data-task-id]')
      let position = 0
      for (const card of cards) {
        if (card.dataset.taskId === task.id) continue // skip self
        const cr = card.getBoundingClientRect()
        if (py > cr.top + cr.height / 2) position++
      }
      return { resourceId, position }
    }
    return null
  }

  async function handleDragEnd(_: unknown, info: { point: { x: number; y: number } }) {
    const drop = findDrop(info.point.x, info.point.y)
    if (!drop) return

    store.beginOptimistic()

    let failed = false
    if (drop.resourceId !== fromResourceId) {
      // Optimistic: move card between columns
      const newSource = (store.tasks[fromResourceId] ?? []).filter(t => t.id !== task.id)
      const newTarget = [
        ...(store.tasks[drop.resourceId] ?? []).slice(0, drop.position),
        { ...task, resource_id: drop.resourceId },
        ...(store.tasks[drop.resourceId] ?? []).slice(drop.position),
      ]
      store.setTasks(fromResourceId, newSource)
      store.setTasks(drop.resourceId, newTarget)

      const result = await reassignTask(task.id, drop.resourceId, drop.position)
      if ('error' in result) {
        failed = true
      } else {
        store.setTasks(fromResourceId, result.sourceTasks)
        store.setTasks(drop.resourceId, result.targetTasks)
      }
    } else {
      const result = await reorderFluidTask(task.id, drop.position)
      if ('error' in result) {
        failed = true
      } else {
        store.setTasks(fromResourceId, result.tasks)
      }
    }

    if (failed) {
      store.revertOptimistic()
      setShaking(true)
      setTimeout(() => setShaking(false), 400)
    } else {
      store.commitOptimistic()
    }
  }

  return (
    <motion.div
      data-task-id={task.id}
      drag
      dragSnapToOrigin
      animate={shaking ? { x: [0, -6, 6, -6, 6, 0] } : { x: 0 }}
      transition={shaking ? { duration: 0.4 } : undefined}
      onDragEnd={handleDragEnd}
      whileDrag={{ opacity: 0.8, scale: 1.02, zIndex: 50 }}
      className="rounded border border-primary/30 bg-primary/10 px-2 py-2 text-xs cursor-grab active:cursor-grabbing select-none"
    >
      <div className="font-medium text-foreground truncate">{task.name}</div>
      <div className="text-muted-foreground mt-0.5">{task.duration_hours}h</div>
    </motion.div>
  )
}
```

**Note on `reorderFluidTask`:** Check its signature in `actions/schedule.ts` — it may take `(taskId, resourceId, atPosition)` or just `(taskId, atPosition)`. Adapt the call to match.

- [ ] **Step 4: Start dev server and smoke-test**

```bash
pnpm dev
```

Navigate to `/{orgSlug}/resources`. Check:
- Columns render for each resource
- Fluid tasks shown as draggable cards
- Fixed tasks shown below divider (non-draggable)
- Drag within column reorders (shake on error if server fails)
- Drag between columns moves card (shake on error if server fails)

- [ ] **Step 5: Commit**

```bash
git add components/resources/
git commit -m "feat: resources kanban — drag to reorder and reassign tasks between resources"
```

---

## Task 5: Capacity Page + Components

**Files:**
- Create: `app/(app)/[orgSlug]/capacity/page.tsx`
- Create: `components/capacity/capacity-view.tsx`
- Create: `components/capacity/kpi-cards.tsx`
- Create: `components/capacity/capacity-heatmap.tsx`

- [ ] **Step 1: Create `app/(app)/[orgSlug]/capacity/page.tsx`**

```tsx
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getWeekDays, computeWeekCells, computeKPIs, parseWeekParam } from '@/lib/capacity-utils'
import { CapacityView } from '@/components/capacity/capacity-view'
import { KpiCards } from '@/components/capacity/kpi-cards'
import { CapacityHeatmap } from '@/components/capacity/capacity-heatmap'
import type { EngineTask } from '@/lib/engine/types'

export default async function CapacityPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ week?: string }>
}) {
  const { orgSlug } = await params
  const { week } = await searchParams
  const supabase = await createClient()

  const { data: org } = await supabase
    .from('orgs')
    .select('id, slug')
    .eq('slug', orgSlug)
    .single()
  if (!org) notFound()

  const weekStart = parseWeekParam(week ?? null)
  const weekDays = getWeekDays(weekStart)
  const weekEnd = weekDays[4]

  const [{ data: resources }, { data: taskRows }] = await Promise.all([
    supabase
      .from('resources')
      .select('id, name, icon_type, working_week')
      .eq('org_id', org.id),
    supabase
      .from('tasks')
      .select('id, resource_id, name, type, status, duration_hours, actual_duration_hours, start_date, end_date, position, task_group_id, segment_index, constraints, tags, external_ref, project_id, org_id')
      .eq('org_id', org.id)
      .lte('start_date', weekEnd.toISOString().split('T')[0])
      .gte('end_date', weekStart.toISOString().split('T')[0]),
  ])

  function toDate(s: string): Date {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d))
  }

  const tasks = (taskRows ?? []).map(row => ({
    ...row,
    start_date: toDate(row.start_date),
    end_date: toDate(row.end_date),
  })) as EngineTask[]

  const cells = computeWeekCells(weekDays, resources ?? [], tasks)
  const kpis = computeKPIs(cells)

  return (
    <CapacityView weekStart={weekStart} orgSlug={org.slug}>
      <KpiCards kpis={kpis} />
      <CapacityHeatmap weekDays={weekDays} resources={resources ?? []} cells={cells} />
    </CapacityView>
  )
}
```

- [ ] **Step 2: Create `components/capacity/capacity-view.tsx`**

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { formatWeekParam } from '@/lib/capacity-utils'

interface Props {
  weekStart: Date
  orgSlug: string
  children: React.ReactNode
}

export function CapacityView({ weekStart, orgSlug, children }: Props) {
  const router = useRouter()

  function navigate(deltaDays: number) {
    const next = new Date(weekStart)
    next.setUTCDate(next.getUTCDate() + deltaDays)
    router.push(`/${orgSlug}/capacity?week=${formatWeekParam(next)}`)
  }

  const label = weekStart.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-7)}
          className="px-2 py-1 text-sm border border-border rounded hover:bg-accent transition-colors"
        >
          ←
        </button>
        <span className="text-sm font-medium">Week of {label}</span>
        <button
          onClick={() => navigate(7)}
          className="px-2 py-1 text-sm border border-border rounded hover:bg-accent transition-colors"
        >
          →
        </button>
      </div>
      {children}
    </div>
  )
}
```

- [ ] **Step 3: Create `components/capacity/kpi-cards.tsx`**

```tsx
import type { CapacityKPIs } from '@/lib/capacity-utils'

export function KpiCards({ kpis }: { kpis: CapacityKPIs }) {
  const pct = Math.round(kpis.avgUtilization * 100)
  const utilizationColor = pct >= 90 ? 'text-red-500' : pct >= 70 ? 'text-green-500' : 'text-muted-foreground'

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="rounded-lg border border-border bg-card p-4 text-center">
        <div className={`text-2xl font-bold ${utilizationColor}`}>{pct}%</div>
        <div className="text-xs text-muted-foreground mt-1">Team avg utilization</div>
      </div>
      <div className="rounded-lg border border-border bg-card p-4 text-center">
        <div className={`text-2xl font-bold ${kpis.overloadedDays > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
          {kpis.overloadedDays}
        </div>
        <div className="text-xs text-muted-foreground mt-1">Overloaded days</div>
      </div>
      <div className="rounded-lg border border-border bg-card p-4 text-center">
        <div className="text-2xl font-bold text-muted-foreground">{Math.round(kpis.slackHours)}h</div>
        <div className="text-xs text-muted-foreground mt-1">Slack this week</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `components/capacity/capacity-heatmap.tsx`**

```tsx
import type { CapacityCell } from '@/lib/capacity-utils'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

function cellBg(cell: CapacityCell): string {
  if (cell.capacityHours === 0) return 'bg-muted/20 text-muted-foreground'
  if (cell.overloaded) return 'bg-red-500/80 text-white'
  if (cell.utilization >= 0.8) return 'bg-amber-500/75 text-white'
  if (cell.bookedHours > 0) return 'bg-green-500/60 text-white'
  return 'bg-muted/20 text-muted-foreground'
}

interface Props {
  weekDays: Date[]
  resources: Array<{ id: string; name: string }>
  cells: CapacityCell[]
}

export function CapacityHeatmap({ weekDays, resources, cells }: Props) {
  if (resources.length === 0) {
    return <p className="text-sm text-muted-foreground">No resources.</p>
  }

  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `140px repeat(5, 1fr)` }}
    >
      {/* Header */}
      <div />
      {DAY_LABELS.map((label, i) => (
        <div key={label} className="text-center text-xs font-medium text-muted-foreground py-1">
          {label} {weekDays[i].getUTCDate()}
        </div>
      ))}

      {/* Resource rows */}
      {resources.map(resource => (
        <>
          <div
            key={`name-${resource.id}`}
            className="flex items-center text-xs text-foreground truncate pr-2 h-9"
          >
            {resource.name}
          </div>
          {[0, 1, 2, 3, 4].map(dayIndex => {
            const cell = cells.find(c => c.resourceId === resource.id && c.dayIndex === dayIndex)
            if (!cell) {
              return <div key={dayIndex} className="rounded h-9 bg-muted/20" />
            }
            const tooltip = cell.tasks.length > 0
              ? cell.tasks.map(t => `${t.name} (${Math.round(t.hours)}h)`).join('\n')
              : 'No tasks'
            return (
              <div
                key={dayIndex}
                title={tooltip}
                className={`rounded h-9 flex items-center justify-center text-xs font-medium ${cellBg(cell)}`}
              >
                {cell.bookedHours > 0 ? `${Math.round(cell.bookedHours)}h` : '—'}
              </div>
            )
          })}
        </>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Smoke-test capacity view**

```bash
pnpm dev
```

Navigate to `/{orgSlug}/capacity`. Check:
- KPI cards render with numbers
- Heatmap shows resource × day grid, colored cells
- Prev/next week navigation changes the date and re-fetches data
- Hover tooltip shows task names

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/[orgSlug]/capacity/" components/capacity/
git commit -m "feat: capacity view — KPI cards, utilization heatmap, week navigation"
```

---

## Task 6: Presence Hook + Who's Online Panel

**Files:**
- Create: `hooks/use-presence.ts`
- Create: `components/presence/who-is-online.tsx`
- Modify: `components/sidebar-nav.tsx`
- Modify: `app/(app)/[orgSlug]/layout.tsx`

- [ ] **Step 1: Create `hooks/use-presence.ts`**

```ts
'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export interface PresenceUser {
  userId: string
  name: string
  page: string
  color: string
}

const PAGE_LABELS: Record<string, string> = {
  timeline: 'Timeline',
  resources: 'Resources',
  capacity: 'Capacity',
  settings: 'Settings',
}

function pageLabel(pathname: string): string {
  const segment = pathname.split('/').at(-1) ?? ''
  return PAGE_LABELS[segment] ?? 'App'
}

// Deterministic color from userId — same color every session
function userColor(userId: string): string {
  const palette = ['#10b981', '#6366f1', '#f59e0b', '#ec4899', '#3b82f6', '#8b5cf6']
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash)
  }
  return palette[Math.abs(hash) % palette.length]
}

export function usePresence(orgId: string, userId: string, userName: string): PresenceUser[] {
  const pathname = usePathname()
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([])
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(`org:${orgId}:presence`, {
      config: { presence: { key: userId } },
    })
    channelRef.current = channel

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ name: string; page: string }>()
        const users: PresenceUser[] = Object.entries(state).map(([uid, presences]) => {
          const latest = presences[presences.length - 1]
          return { userId: uid, name: latest.name, page: latest.page, color: userColor(uid) }
        })
        setOnlineUsers(users)
      })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ name: userName, page: pageLabel(pathname) })
        }
      })

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [orgId, userId, userName])

  // Re-track on page navigation without re-subscribing
  useEffect(() => {
    channelRef.current?.track({ name: userName, page: pageLabel(pathname) })
  }, [pathname, userName])

  return onlineUsers
}
```

- [ ] **Step 2: Create `components/presence/who-is-online.tsx`**

```tsx
import type { PresenceUser } from '@/hooks/use-presence'

export function WhoIsOnline({ users }: { users: PresenceUser[] }) {
  if (users.length === 0) return null

  return (
    <div className="px-3 py-2">
      <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Online</div>
      <div className="flex flex-col gap-2">
        {users.map(user => (
          <div key={user.userId} className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ backgroundColor: user.color }}
            >
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-xs text-foreground truncate leading-none">{user.name}</div>
              <div className="text-xs text-muted-foreground leading-none mt-0.5">{user.page}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Modify `components/sidebar-nav.tsx`**

Add `orgId`, `userId`, `userName` props. Mount `usePresence` inside the component. Render `WhoIsOnline` between the nav items and the sign-out button.

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, Users, BarChart3, Settings, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { signOut } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { usePresence } from '@/hooks/use-presence'
import { WhoIsOnline } from '@/components/presence/who-is-online'

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

interface SidebarNavProps {
  orgSlug: string
  orgName: string
  orgId: string
  userId: string
  userName: string
}

export function SidebarNav({ orgSlug, orgName, orgId, userId, userName }: SidebarNavProps) {
  const pathname = usePathname()
  const onlineUsers = usePresence(orgId, userId, userName)

  const items: NavItem[] = [
    { label: 'Timeline', href: `/${orgSlug}/timeline`, icon: CalendarDays },
    { label: 'Resources', href: `/${orgSlug}/resources`, icon: Users },
    { label: 'Capacity', href: `/${orgSlug}/capacity`, icon: BarChart3 },
    { label: 'Settings', href: `/${orgSlug}/settings`, icon: Settings },
  ]

  return (
    <aside className="flex flex-col w-56 min-h-screen bg-sidebar border-r border-sidebar-border">
      <div className="flex items-center gap-2 px-4 h-14 border-b border-sidebar-border">
        <div className="w-6 h-6 rounded-md bg-primary" />
        <span className="font-semibold text-sm text-sidebar-foreground truncate">{orgName}</span>
      </div>

      <nav className="flex-1 p-2 space-y-0.5">
        {items.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-sidebar-foreground hover:bg-accent/50'
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <WhoIsOnline users={onlineUsers} />

      <div className="p-2 border-t border-sidebar-border">
        <form action={signOut}>
          <Button variant="ghost" size="sm" type="submit" className="w-full justify-start gap-2.5 text-sidebar-foreground">
            <LogOut className="w-4 h-4" />
            Sign out
          </Button>
        </form>
      </div>
    </aside>
  )
}
```

- [ ] **Step 4: Modify `app/(app)/[orgSlug]/layout.tsx`**

Fetch the current user and pass their id + display name to `SidebarNav`:

```tsx
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SidebarNav } from '@/components/sidebar-nav'

interface Props {
  children: React.ReactNode
  params: Promise<{ orgSlug: string }>
}

export default async function OrgLayout({ children, params }: Props) {
  const { orgSlug } = await params
  const supabase = await createClient()

  const [{ data: org }, { data: { user } }] = await Promise.all([
    supabase.from('orgs').select('id, name, slug').eq('slug', orgSlug).single(),
    supabase.auth.getUser(),
  ])

  if (!org) notFound()

  const userName =
    (user?.user_metadata?.full_name as string | undefined) ??
    user?.email?.split('@')[0] ??
    'User'

  return (
    <div className="flex min-h-screen">
      <SidebarNav
        orgSlug={org.slug}
        orgName={org.name}
        orgId={org.id}
        userId={user?.id ?? ''}
        userName={userName}
      />
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 5: Run build — all must pass**

```bash
pnpm build
```
Expected: clean TypeScript compilation, no errors.

- [ ] **Step 6: Smoke-test presence**

```bash
pnpm dev
```

1. Open `/{orgSlug}/timeline` in two browser tabs (or two different browsers signed in as different users)
2. Check that the "Online" section appears in the sidebar showing the current user
3. Switch to the Resources page — the second user's panel should update from "Timeline" to "Resources" within ~1s
4. Verify the online panel disappears when all tabs are closed (untrack on unmount)

- [ ] **Step 7: Commit**

```bash
git add hooks/use-presence.ts components/presence/ components/sidebar-nav.tsx "app/(app)/[orgSlug]/layout.tsx"
git commit -m "feat: presence — who's online panel in sidebar with live page tracking"
```

---

## Verification

```bash
# All existing tests must still pass
pnpm test

# Clean production build
pnpm build
```

**Manual smoke test (`pnpm dev`):**

1. **Resources view:** `/{slug}/resources` — columns render, drag fluid task within column, drag between columns, fixed tasks shown non-draggable
2. **Capacity view:** `/{slug}/capacity` — KPI cards show numbers, heatmap renders, ← → week navigation changes week and re-fetches, hover shows task tooltip
3. **Presence:** Open two tabs — both users appear in sidebar Online panel; switching pages updates the page label in other tab's panel

---

## Invariants

1. All date math uses UTC — `getUTCDay()`, `Date.UTC()` — never local-time `getDay()`/`getDate()`/`getMonth()`
2. `createStore` (not `create`) used for Zustand — one instance per component tree via `useMemo`
3. Only fluid tasks are draggable in the kanban — fixed tasks render but have no `drag` prop
4. `reassignTask` must be called only for cross-resource moves; same-resource reorder uses existing `reorderFluidTask`
5. Presence `channel.track` is idempotent — safe to re-call on pathname change without re-subscribing
6. Browser Supabase client (`lib/supabase/client`) used in all hooks/client components — never the async server client
