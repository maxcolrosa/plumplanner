import { describe, it, expect } from 'vitest'
import { insertTask, deleteTask, adjustTask } from '@/lib/engine/scheduler'
import type { EngineResource, EngineTask, TaskInput } from '@/lib/engine/types'
import type { WorkingWeek } from '@/lib/types'

const MON_FRI: WorkingWeek = { mon:'full', tue:'full', wed:'full', thu:'full', fri:'full', sat:'none', sun:'none' }
const resource: EngineResource = { id: 'r1', working_week: MON_FRI }

const MON = new Date(Date.UTC(2026, 4, 18)) // 2026-05-18 Monday
const TUE = new Date(Date.UTC(2026, 4, 19))
const WED = new Date(Date.UTC(2026, 4, 20))
const THU = new Date(Date.UTC(2026, 4, 21))
const FRI = new Date(Date.UTC(2026, 4, 22))
const MON2 = new Date(Date.UTC(2026, 4, 25))
const TUE2 = new Date(Date.UTC(2026, 4, 26))

function makeFluid(id: string, position: number, opts?: Partial<EngineTask>): EngineTask {
  return {
    id, org_id: 'o1', resource_id: 'r1', project_id: null,
    name: id, type: 'fluid', status: 'pending',
    start_date: MON, end_date: MON, duration_hours: 8,
    actual_duration_hours: null, position,
    task_group_id: null, segment_index: null,
    constraints: [], tags: [], external_ref: null,
    ...opts,
  }
}

function makeFixed(id: string, start: Date, end: Date): EngineTask {
  return {
    id, org_id: 'o1', resource_id: 'r1', project_id: null,
    name: id, type: 'fixed', status: 'pending',
    start_date: start, end_date: end, duration_hours: 8,
    actual_duration_hours: null, position: null,
    task_group_id: null, segment_index: null,
    constraints: [], tags: [], external_ref: null,
  }
}

function makeInput(id: string, type: 'fixed'|'fluid', durationHours = 8, opts?: Partial<TaskInput>): TaskInput {
  return {
    id, org_id: 'o1', resource_id: 'r1', name: id, type, duration_hours: durationHours, ...opts,
  }
}

describe('insertTask', () => {
  it('inserts a fluid task into an empty stack at position 0', () => {
    const result = insertTask(resource, [], makeInput('new', 'fluid'), 0, MON)
    const fluids = result.filter(t => t.type === 'fluid')
    expect(fluids).toHaveLength(1)
    expect(fluids[0].id).toBe('new')
    expect(fluids[0].position).toBe(0)
    expect(fluids[0].start_date).toEqual(MON)
    expect(fluids[0].end_date).toEqual(MON) // 8h = 1 full day
  })

  it('inserts at position 0 and pushes existing fluid tasks', () => {
    const existing = [makeFluid('a', 0, { start_date: MON, end_date: MON })]
    const result = insertTask(resource, existing, makeInput('new', 'fluid'), 0, MON)
    const fluids = result.filter(t => t.type === 'fluid').sort((a,b) => a.position! - b.position!)
    expect(fluids[0].id).toBe('new')
    expect(fluids[0].position).toBe(0)
    expect(fluids[1].id).toBe('a')
    expect(fluids[1].position).toBe(1)
    // auto-compress: 'new' starts Mon (8h→ends Mon), 'a' starts Tue
    expect(fluids[0].start_date).toEqual(MON)
    expect(fluids[1].start_date).toEqual(TUE)
  })

  it('inserts at position > fluidTasks.length (clamps to end)', () => {
    const existing = [makeFluid('a', 0, { start_date: MON, end_date: MON })]
    const result = insertTask(resource, existing, makeInput('new', 'fluid'), 99, MON)
    const fluids = result.filter(t => t.type === 'fluid').sort((a,b) => a.position! - b.position!)
    expect(fluids[0].id).toBe('a')
    expect(fluids[1].id).toBe('new')
    expect(fluids[1].position).toBe(1)
  })

  it('inserts a fixed task (no position, dates from start_date + duration)', () => {
    const input = makeInput('fixed-new', 'fixed', 16, { start_date: WED })
    const result = insertTask(resource, [], input, 0, MON)
    const fixed = result.find(t => t.id === 'fixed-new')!
    expect(fixed.position).toBeNull()
    expect(fixed.start_date).toEqual(WED)
    // 16h from Wed (full days): Wed(8h) + Thu(8h) → ends Thu
    expect(fixed.end_date).toEqual(THU)
  })

  it('inserts fixed task without affecting fluid tasks', () => {
    const fluid = makeFluid('a', 0, { start_date: MON, end_date: MON })
    const input = makeInput('f', 'fixed', 8, { start_date: FRI })
    const result = insertTask(resource, [fluid], input, 0, MON)
    const aResult = result.find(t => t.id === 'a')!
    expect(aResult.position).toBe(0)
    expect(aResult.start_date).toEqual(MON) // fluid tasks recalculated but no conflict
  })

  it('splits an in-progress fluid task at atPosition', () => {
    // Task 'a' is in_progress, started Mon, 16h total. now = Tue (8h elapsed)
    const a = makeFluid('a', 0, {
      start_date: MON, end_date: TUE,
      duration_hours: 16, status: 'in_progress',
    })
    const result = insertTask(resource, [a], makeInput('new', 'fluid'), 0, TUE)
    const fluids = result.filter(t => t.type === 'fluid').sort((a,b) => a.position! - b.position!)
    expect(fluids).toHaveLength(3) // original (in_progress), new (at 0), continuation
    const newTask = fluids.find(t => t.id === 'new')!
    expect(newTask.position).toBe(0)
    const continuation = fluids.find(t => t.id !== 'new' && t.id !== 'a')!
    expect(continuation.task_group_id).toBeTruthy()
    expect(continuation.segment_index).toBe(1)
    expect(continuation.duration_hours).toBe(8) // remainder
    expect(continuation.status).toBe('pending')
    const original = fluids.find(t => t.id === 'a')!
    expect(original.status).toBe('in_progress')
    expect(original.duration_hours).toBe(8) // elapsed

    // Date assertions: new task must start >= now (midnight UTC of TUE)
    const nowMidnight = new Date(Date.UTC(2026, 4, 19)) // TUE midnight UTC
    expect(newTask.start_date.getTime()).toBeGreaterThanOrEqual(nowMidnight.getTime())
    // Continuation must start >= new task's end_date (or next working day after it)
    expect(continuation.start_date.getTime()).toBeGreaterThanOrEqual(newTask.end_date.getTime())
  })

  it('pushes (does not split) an in-progress task with no_split constraint', () => {
    const a = makeFluid('a', 0, {
      start_date: MON, end_date: TUE,
      duration_hours: 16, status: 'in_progress',
      constraints: [{ type: 'no_split' }],
    })
    const result = insertTask(resource, [a], makeInput('new', 'fluid'), 0, TUE)
    const fluids = result.filter(t => t.type === 'fluid').sort((a,b) => a.position! - b.position!)
    // No split: 'new' at 0, 'a' pushed to 1 (no continuation created)
    expect(fluids).toHaveLength(2)
    expect(fluids[0].id).toBe('new')
    expect(fluids[1].id).toBe('a')
    expect(fluids[1].task_group_id).toBeNull() // not split
  })

  it('does not split when elapsed hours equals duration (remainder = 0)', () => {
    // Task already fully elapsed — treat as push not split
    const a = makeFluid('a', 0, {
      start_date: MON, end_date: MON,
      duration_hours: 8, status: 'in_progress',
    })
    // now = TUE → elapsed = endDateToHours(Mon, Tue) = 8h = duration, remainder = 0
    const result = insertTask(resource, [a], makeInput('new', 'fluid'), 0, TUE)
    const fluids = result.filter(t => t.type === 'fluid').sort((a,b) => a.position! - b.position!)
    expect(fluids).toHaveLength(2)
    expect(fluids[0].id).toBe('new')
    expect(fluids[1].id).toBe('a')
  })

  it('does not split when elapsed hours is 0 (task just started)', () => {
    // now === task start_date → elapsed = 0, remainder = full duration
    // Should push (not split), so original keeps full duration_hours
    const a = makeFluid('a', 0, {
      start_date: MON, end_date: TUE,
      duration_hours: 16, status: 'in_progress',
    })
    // now = MON (same as start_date) → elapsed = endDateToHours(Mon, Mon) = 0
    const result = insertTask(resource, [a], makeInput('new', 'fluid'), 0, MON)
    const fluids = result.filter(t => t.type === 'fluid').sort((a, b) => a.position! - b.position!)
    // Should push: new at 0, 'a' at 1 — no continuation
    expect(fluids).toHaveLength(2)
    expect(fluids[0].id).toBe('new')
    expect(fluids[1].id).toBe('a')
    expect(fluids[1].duration_hours).toBe(16) // full duration preserved, not 0
    expect(fluids[1].task_group_id).toBeNull() // not split
  })

  it('fluid tasks flow around a fixed task during auto-compress', () => {
    // Fixed: Wed-Wed. Two fluid tasks starting Mon.
    // After inserting 'new' at pos 0: [new@Mon, existing@after-new]
    // existing should flow past fixed Wed → land Thu
    const fixed = makeFixed('f', WED, WED)
    const existing = makeFluid('a', 0, { start_date: MON, end_date: MON })
    const result = insertTask(resource, [existing, fixed], makeInput('new', 'fluid'), 0, MON)
    const fluids = result.filter(t => t.type === 'fluid').sort((a,b) => a.position! - b.position!)
    expect(fluids[0].id).toBe('new')
    expect(fluids[0].start_date).toEqual(MON)
    expect(fluids[1].id).toBe('a')
    // new ends Mon, next is Tue. Tue is fine (fixed is Wed). a starts Tue.
    expect(fluids[1].start_date).toEqual(TUE)
  })

  it('does not mutate input task objects', () => {
    const a = makeFluid('a', 0, { start_date: MON, end_date: MON })
    const origStart = a.start_date.getTime()
    insertTask(resource, [a], makeInput('new', 'fluid'), 0, MON)
    expect(a.start_date.getTime()).toBe(origStart)
  })
})

describe('deleteTask', () => {
  it('removes a fluid task and renumbers positions', () => {
    const tasks = [
      makeFluid('a', 0, { start_date: MON, end_date: MON }),
      makeFluid('b', 1, { start_date: TUE, end_date: TUE }),
      makeFluid('c', 2, { start_date: WED, end_date: WED }),
    ]
    const result = deleteTask(tasks, 'b')
    const fluids = result.filter(t => t.type === 'fluid').sort((a,b) => a.position! - b.position!)
    expect(fluids).toHaveLength(2)
    expect(fluids[0].id).toBe('a')
    expect(fluids[0].position).toBe(0)
    expect(fluids[1].id).toBe('c')
    expect(fluids[1].position).toBe(1)
    // Dates NOT recalculated (gap left intentionally)
    expect(fluids[1].start_date).toEqual(WED)
  })

  it('removes a fixed task without affecting fluid tasks', () => {
    const fixed = makeFixed('f', WED, WED)
    const fluid = makeFluid('a', 0, { start_date: MON, end_date: MON })
    const result = deleteTask([fluid, fixed], 'f')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('a')
    expect(result[0].start_date).toEqual(MON) // unchanged
  })

  it('returns tasks unchanged if taskId not found', () => {
    const tasks = [makeFluid('a', 0)]
    const result = deleteTask(tasks, 'nonexistent')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('a')
  })

  it('does not recalculate dates (leaves gap)', () => {
    const tasks = [
      makeFluid('a', 0, { start_date: MON, end_date: MON }),
      makeFluid('b', 1, { start_date: TUE, end_date: TUE }),
      makeFluid('c', 2, { start_date: THU, end_date: THU }), // gap after b
    ]
    const result = deleteTask(tasks, 'a')
    const c = result.find(t => t.id === 'c')!
    // c's date should be UNCHANGED even though there's now a gap
    expect(c.start_date).toEqual(THU)
  })
})

describe('adjustTask', () => {
  it('adjusts fixed task start_date and recalculates end_date', () => {
    const fixed = makeFixed('f', MON, MON)
    const result = adjustTask(resource, [fixed], 'f', { start_date: WED }, MON)
    const updated = result.find(t => t.id === 'f')!
    expect(updated.start_date).toEqual(WED)
    // 8h from Wed = Wed (full day)
    expect(updated.end_date).toEqual(WED)
    expect(updated.position).toBeNull()
  })

  it('adjusts fixed task duration_hours and recalculates end_date', () => {
    const fixed = makeFixed('f', MON, MON)
    const result = adjustTask(resource, [fixed], 'f', { duration_hours: 16 }, MON)
    const updated = result.find(t => t.id === 'f')!
    // 16h from Mon = Mon(8) + Tue(8) = ends Tue
    expect(updated.end_date).toEqual(TUE)
    expect(updated.duration_hours).toBe(16)
  })

  it('adjusts fluid task duration and preserves task id', () => {
    const a = makeFluid('a', 0, { start_date: MON, end_date: MON, duration_hours: 8 })
    const result = adjustTask(resource, [a], 'a', { duration_hours: 16 }, MON)
    const updated = result.find(t => t.id === 'a')!
    expect(updated).toBeDefined()
    expect(updated.id).toBe('a') // id preserved
    expect(updated.duration_hours).toBe(16)
    // 16h from Mon = Mon+Tue = ends Tue
    expect(updated.end_date).toEqual(TUE)
  })

  it('adjusts fluid task position is maintained', () => {
    const a = makeFluid('a', 0, { start_date: MON, end_date: MON })
    const b = makeFluid('b', 1, { start_date: TUE, end_date: TUE })
    const result = adjustTask(resource, [a, b], 'a', { duration_hours: 16 }, MON)
    const fluids = result.filter(t => t.type === 'fluid').sort((x,y) => x.position! - y.position!)
    expect(fluids[0].id).toBe('a')
    expect(fluids[0].position).toBe(0)
    expect(fluids[1].id).toBe('b')
    expect(fluids[1].position).toBe(1)
    // b should be pushed to Wed (after a's new end Tue)
    expect(fluids[1].start_date).toEqual(WED)
  })
})
