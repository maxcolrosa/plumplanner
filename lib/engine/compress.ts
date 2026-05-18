import { hoursToEndDate, nextWorkingDay, addDays, toMidnightUTC } from '@/lib/engine/working-week'
import type { EngineResource, EngineTask } from '@/lib/engine/types'

export function compress(
  resource: EngineResource,
  tasks: EngineTask[],
  fromDate: Date,
  remerge: boolean
): EngineTask[] {
  if (tasks.length === 0) return []

  // Step 1: Separate fixed from fluid tasks
  const fixedTasks = tasks.filter(t => t.type === 'fixed')
  let fluidTasks = tasks
    .filter(t => t.type === 'fluid')
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

  // Step 2: Re-merge adjacent split segments (only when remerge === true)
  if (remerge) {
    let i = 0
    while (i < fluidTasks.length - 1) {
      const a = fluidTasks[i]
      const b = fluidTasks[i + 1]
      const aGroupId = a.task_group_id
      const aSegIdx = a.segment_index ?? 0
      if (
        aGroupId !== null &&
        b.task_group_id === aGroupId &&
        b.segment_index === aSegIdx + 1 &&
        b.position === (a.position ?? 0) + 1
      ) {
        // Merge b into a: new object with combined duration
        const merged: EngineTask = { ...a, duration_hours: a.duration_hours + b.duration_hours }
        fluidTasks = [
          ...fluidTasks.slice(0, i),
          merged,
          ...fluidTasks.slice(i + 2),
        ]
        // Re-sort and restart scan from beginning to handle chained merges
        fluidTasks = fluidTasks.sort((x, y) => (x.position ?? 0) - (y.position ?? 0))
        i = 0
      } else {
        i++
      }
    }
  }

  // Step 3: Find anchor cursor
  const from = toMidnightUTC(fromDate)
  const beforeTasks = fluidTasks.filter(t => t.start_date < from)
  const fromTasks = fluidTasks.filter(t => t.start_date >= from)

  let cursor: Date
  if (beforeTasks.length > 0) {
    const lastBefore = beforeTasks[beforeTasks.length - 1]
    cursor = addDays(lastBefore.end_date, 1)
  } else {
    cursor = from
  }

  // Step 4: Recalculate dates for tasks from fromDate onwards
  const updatedFromTasks = fromTasks.map(task => {
    cursor = nextWorkingDay(cursor, resource.working_week)
    let potentialEnd = hoursToEndDate(cursor, task.duration_hours, resource.working_week)

    // Keep advancing past any conflicting fixed task
    let conflict = fixedTasks.find(f => f.start_date <= potentialEnd && f.end_date >= cursor)
    while (conflict) {
      cursor = nextWorkingDay(addDays(conflict.end_date, 1), resource.working_week)
      potentialEnd = hoursToEndDate(cursor, task.duration_hours, resource.working_week)
      conflict = fixedTasks.find(f => f.start_date <= potentialEnd && f.end_date >= cursor)
    }

    const updated = { ...task, start_date: cursor, end_date: potentialEnd }
    cursor = addDays(potentialEnd, 1)
    return updated
  })

  // Step 5: Return combined list (new objects for all, no mutation)
  const updatedBeforeTasks = beforeTasks.map(t => ({ ...t }))
  return [...fixedTasks.map(t => ({ ...t })), ...updatedBeforeTasks, ...updatedFromTasks]
}
