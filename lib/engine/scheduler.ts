import { hoursToEndDate, endDateToHours, nextWorkingDay, addDays, toMidnightUTC } from '@/lib/engine/working-week'
import type { EngineResource, EngineTask, TaskInput } from '@/lib/engine/types'

export function insertTask(
  resource: EngineResource,
  tasks: EngineTask[],
  newTask: TaskInput,
  atPosition: number,
  now: Date
): EngineTask[] {
  const ww = resource.working_week

  // --- Fixed task path ---
  if (newTask.type === 'fixed') {
    const startDate = toMidnightUTC(newTask.start_date!)
    const endDate = hoursToEndDate(startDate, newTask.duration_hours, ww)
    const engineTask: EngineTask = {
      id: newTask.id,
      org_id: newTask.org_id,
      resource_id: newTask.resource_id,
      project_id: newTask.project_id ?? null,
      name: newTask.name,
      type: 'fixed',
      status: 'pending',
      start_date: startDate,
      end_date: endDate,
      duration_hours: newTask.duration_hours,
      actual_duration_hours: null,
      position: null,
      task_group_id: null,
      segment_index: null,
      constraints: newTask.constraints ?? [],
      tags: newTask.tags ?? [],
      external_ref: newTask.external_ref ?? null,
    }
    return [...tasks.map(t => ({ ...t })), engineTask]
  }

  // --- Fluid task path ---
  const nowMidnight = toMidnightUTC(now)

  // Sort existing fluid tasks by position; make new copies
  let fluidTasks: EngineTask[] = tasks
    .filter(t => t.type === 'fluid')
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map(t => ({ ...t }))

  const fixedTasks: EngineTask[] = tasks
    .filter(t => t.type === 'fixed')
    .map(t => ({ ...t }))

  // Clamp atPosition to valid range
  atPosition = Math.min(atPosition, fluidTasks.length)

  // Check occupant at atPosition
  const occupant = fluidTasks[atPosition]

  if (occupant?.status === 'in_progress') {
    const hasNoSplit = occupant.constraints.some(c => c.type === 'no_split')
    const elapsed = Math.min(
      endDateToHours(occupant.start_date, nowMidnight, ww),
      occupant.duration_hours
    )
    const remainder = occupant.duration_hours - elapsed

    if (!hasNoSplit && elapsed > 0 && remainder > 0) {
      // Split the task: update original with elapsed hours, create continuation for remainder
      const updatedOriginal: EngineTask = {
        ...occupant,
        duration_hours: elapsed,
        end_date: hoursToEndDate(occupant.start_date, elapsed, ww),
        // status stays 'in_progress'
      }
      const groupId = occupant.task_group_id ?? occupant.id
      const continuationId = crypto.randomUUID()
      const continuation: EngineTask = {
        ...occupant,
        id: continuationId,
        duration_hours: remainder,
        status: 'pending',
        task_group_id: groupId,
        segment_index: (occupant.segment_index ?? 0) + 1,
        position: atPosition + 1, // temporary, will be renumbered
      }

      // Replace occupant with updatedOriginal
      fluidTasks[atPosition] = updatedOriginal
      // Insert continuation right after occupant
      fluidTasks.splice(atPosition + 1, 0, continuation)
      // Shift all tasks at positions > atPosition + 1 (index >= atPosition + 2)
      for (let i = atPosition + 2; i < fluidTasks.length; i++) {
        fluidTasks[i] = { ...fluidTasks[i], position: (fluidTasks[i].position ?? 0) + 1 }
      }
    } else {
      // Push: no_split or remainder = 0 — shift all tasks at atPosition and beyond
      for (let i = atPosition; i < fluidTasks.length; i++) {
        fluidTasks[i] = { ...fluidTasks[i], position: (fluidTasks[i].position ?? 0) + 1 }
      }
    }
  } else {
    // No occupant or occupant not in_progress: shift all tasks at atPosition and beyond
    for (let i = atPosition; i < fluidTasks.length; i++) {
      fluidTasks[i] = { ...fluidTasks[i], position: (fluidTasks[i].position ?? 0) + 1 }
    }
  }

  // Create new fluid task with placeholder dates (will be recalculated below)
  const newFluidTask: EngineTask = {
    id: newTask.id,
    org_id: newTask.org_id,
    resource_id: newTask.resource_id,
    project_id: newTask.project_id ?? null,
    name: newTask.name,
    type: 'fluid',
    status: 'pending',
    start_date: nowMidnight,
    end_date: nowMidnight,
    duration_hours: newTask.duration_hours,
    actual_duration_hours: null,
    position: atPosition,
    task_group_id: null,
    segment_index: null,
    constraints: newTask.constraints ?? [],
    tags: newTask.tags ?? [],
    external_ref: newTask.external_ref ?? null,
  }

  // Insert new task at atPosition
  fluidTasks.splice(atPosition, 0, newFluidTask)

  // Renumber positions to be contiguous
  fluidTasks = fluidTasks.map((t, i) => ({ ...t, position: i }))

  // Auto-compress: recalculate dates for tasks at positions >= atPosition
  // Determine the cursor start: either end of previous task + 1 day, or nowMidnight
  let currentCursor: Date
  if (atPosition > 0) {
    // Start after the last task before atPosition (which hasn't been recalculated)
    // For the in_progress case, the original stays at position atPosition, and
    // the original's end_date is already set. The new task starts at atPosition.
    // We need the end_date of task at index atPosition - 1.
    const prevTask = fluidTasks[atPosition - 1]
    currentCursor = addDays(prevTask.end_date, 1)
  } else {
    currentCursor = nowMidnight
  }

  for (let i = atPosition; i < fluidTasks.length; i++) {
    // Skip in_progress tasks — their dates are already set
    if (fluidTasks[i].status === 'in_progress') {
      currentCursor = addDays(fluidTasks[i].end_date, 1)
      continue
    }

    currentCursor = nextWorkingDay(currentCursor, ww)
    let potentialEnd = hoursToEndDate(currentCursor, fluidTasks[i].duration_hours, ww)

    // Advance past any conflicting fixed task
    let conflict = fixedTasks.find(f => f.start_date <= potentialEnd && f.end_date >= currentCursor)
    while (conflict) {
      currentCursor = nextWorkingDay(addDays(conflict.end_date, 1), ww)
      potentialEnd = hoursToEndDate(currentCursor, fluidTasks[i].duration_hours, ww)
      conflict = fixedTasks.find(f => f.start_date <= potentialEnd && f.end_date >= currentCursor)
    }

    fluidTasks[i] = { ...fluidTasks[i], start_date: currentCursor, end_date: potentialEnd }
    currentCursor = addDays(potentialEnd, 1)
  }

  return [...fixedTasks, ...fluidTasks]
}

export function deleteTask(tasks: EngineTask[], taskId: string): EngineTask[] {
  const filtered = tasks.filter(t => t.id !== taskId)

  // Renumber fluid task positions to be contiguous
  const fluids = filtered
    .filter(t => t.type === 'fluid')
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((t, i) => ({ ...t, position: i }))

  const fixed = filtered
    .filter(t => t.type === 'fixed')
    .map(t => ({ ...t }))

  return [...fixed, ...fluids]
}

export function adjustTask(
  resource: EngineResource,
  tasks: EngineTask[],
  taskId: string,
  changes: { start_date?: Date; duration_hours?: number },
  now: Date
): EngineTask[] {
  const original = tasks.find(t => t.id === taskId)
  if (!original) return tasks.map(t => ({ ...t }))

  if (original.type === 'fixed') {
    const newStart = changes.start_date ? toMidnightUTC(changes.start_date) : original.start_date
    const newDuration = changes.duration_hours ?? original.duration_hours
    const newEnd = hoursToEndDate(newStart, newDuration, resource.working_week)
    return tasks.map(t =>
      t.id === taskId
        ? { ...t, start_date: newStart, end_date: newEnd, duration_hours: newDuration }
        : { ...t }
    )
  }

  // Fluid task: delete then re-insert at same position, preserving original id
  const position = original.position!
  const afterDelete = deleteTask(tasks, taskId)
  const taskInput: TaskInput = {
    id: original.id, // PRESERVE original id
    org_id: original.org_id,
    resource_id: original.resource_id,
    project_id: original.project_id,
    name: original.name,
    type: 'fluid',
    duration_hours: changes.duration_hours ?? original.duration_hours,
    constraints: original.constraints,
    tags: original.tags,
    external_ref: original.external_ref,
  }
  return insertTask(resource, afterDelete, taskInput, position, now)
}
