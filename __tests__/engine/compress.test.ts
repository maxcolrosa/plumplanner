import { describe, it, expect } from 'vitest'
import { compress } from '@/lib/engine/compress'
import type { EngineResource, EngineTask } from '@/lib/engine/types'
import type { WorkingWeek } from '@/lib/types'

const MON_FRI: WorkingWeek = { mon: 'full', tue: 'full', wed: 'full', thu: 'full', fri: 'full', sat: 'none', sun: 'none' }

// Test resource
const resource: EngineResource = { id: 'r1', working_week: MON_FRI }

// Helper to create a fluid task
function makeFluid(id: string, position: number, startDateStr: string, durationHours: number, extra?: Partial<EngineTask>): EngineTask {
  const start = new Date(startDateStr + 'T00:00:00Z')
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + Math.ceil(durationHours / 8) - 1)
  return {
    id, org_id: 'o1', resource_id: 'r1', project_id: null,
    name: id, type: 'fluid', status: 'pending',
    start_date: start, end_date: end,
    duration_hours: durationHours,
    actual_duration_hours: null,
    position,
    task_group_id: null, segment_index: null,
    constraints: [], tags: [], external_ref: null,
    ...extra,
  }
}

// Helper to create a fixed task
function makeFixed(id: string, startDateStr: string, endDateStr: string): EngineTask {
  return {
    id, org_id: 'o1', resource_id: 'r1', project_id: null,
    name: id, type: 'fixed', status: 'pending',
    start_date: new Date(startDateStr + 'T00:00:00Z'),
    end_date: new Date(endDateStr + 'T00:00:00Z'),
    duration_hours: 8, actual_duration_hours: null,
    position: null, task_group_id: null, segment_index: null,
    constraints: [], tags: [], external_ref: null,
  }
}

describe('compress', () => {
  // 1. Empty list → empty list
  it('returns empty array for no tasks', () => {
    const fromDate = new Date('2026-05-18T00:00:00Z')
    const result = compress(resource, [], fromDate, false)
    expect(result).toEqual([])
  })

  // 2. Single fluid task, no gaps → dates unchanged (already packed)
  it('does not move a single fluid task that is already packed', () => {
    const fromDate = new Date('2026-05-18T00:00:00Z') // Mon
    const a = makeFluid('a', 0, '2026-05-18', 8) // Mon
    const result = compress(resource, [a], fromDate, false)
    const aResult = result.find(t => t.id === 'a')!
    expect(aResult.start_date).toEqual(new Date('2026-05-18T00:00:00Z'))
    expect(aResult.end_date).toEqual(new Date('2026-05-18T00:00:00Z'))
  })

  // 3. Two fluid tasks with a gap → second task pulled forward
  it('fills gap between two fluid tasks', () => {
    const fromDate = new Date('2026-05-18T00:00:00Z') // Mon
    const a = makeFluid('a', 0, '2026-05-18', 8) // Mon
    const b = makeFluid('b', 1, '2026-05-21', 8) // Thu — should move to Tue
    const result = compress(resource, [a, b], fromDate, false)
    const bResult = result.find(t => t.id === 'b')!
    expect(bResult.start_date).toEqual(new Date('2026-05-19T00:00:00Z')) // Tue
    expect(bResult.end_date).toEqual(new Date('2026-05-19T00:00:00Z'))   // Tue
  })

  // 4. Fluid task would overlap fixed task → pushed past it
  it('flows fluid tasks around a fixed task', () => {
    const fromDate = new Date('2026-05-18T00:00:00Z')
    const fixed = makeFixed('fixed', '2026-05-20', '2026-05-21') // Wed-Thu
    const a = makeFluid('a', 0, '2026-05-18', 8)   // Mon
    const b = makeFluid('b', 1, '2026-05-19', 8)   // Tue
    const c = makeFluid('c', 2, '2026-05-25', 8)   // some future date with gap
    const result = compress(resource, [a, b, c, fixed], fromDate, false)
    const cResult = result.find(t => t.id === 'c')!
    expect(cResult.start_date).toEqual(new Date('2026-05-22T00:00:00Z')) // Fri (past Wed-Thu fixed)
  })

  // 5. Tasks before fromDate are untouched
  it('does not move fluid tasks that start before fromDate', () => {
    const fromDate = new Date('2026-05-20T00:00:00Z') // Wed
    const a = makeFluid('a', 0, '2026-05-18', 8) // Mon — before fromDate, untouched
    const b = makeFluid('b', 1, '2026-05-25', 8) // Mon next week — should compress to Tue
    const result = compress(resource, [a, b], fromDate, false)
    const aResult = result.find(t => t.id === 'a')!
    const bResult = result.find(t => t.id === 'b')!
    expect(aResult.start_date).toEqual(new Date('2026-05-18T00:00:00Z')) // unchanged
    expect(bResult.start_date).toEqual(new Date('2026-05-19T00:00:00Z')) // Tue (day after A)
  })

  // 6. remerge=true merges adjacent split segments
  it('merges adjacent split segments when remerge=true', () => {
    const fromDate = new Date('2026-05-18T00:00:00Z')
    const seg0 = makeFluid('seg0', 0, '2026-05-18', 8, { task_group_id: 'original', segment_index: 0 })
    const seg1 = makeFluid('seg1', 1, '2026-05-19', 8, { task_group_id: 'original', segment_index: 1 })
    const result = compress(resource, [seg0, seg1], fromDate, true)
    // Should merge: one task with duration 16h
    const fluids = result.filter(t => t.type === 'fluid')
    expect(fluids).toHaveLength(1)
    expect(fluids[0].id).toBe('seg0')
    expect(fluids[0].duration_hours).toBe(16)
    // seg1 should be absent (deleted via ID diff)
    expect(result.find(t => t.id === 'seg1')).toBeUndefined()
  })

  // 7. remerge=false does NOT merge adjacent split segments
  it('does not merge segments when remerge=false', () => {
    const fromDate = new Date('2026-05-18T00:00:00Z')
    const seg0 = makeFluid('seg0', 0, '2026-05-18', 8, { task_group_id: 'original', segment_index: 0 })
    const seg1 = makeFluid('seg1', 1, '2026-05-19', 8, { task_group_id: 'original', segment_index: 1 })
    const result = compress(resource, [seg0, seg1], fromDate, false)
    expect(result.filter(t => t.type === 'fluid')).toHaveLength(2)
  })

  // 8. Fixed tasks are never moved by compress
  it('never moves fixed tasks', () => {
    const fromDate = new Date('2026-05-18T00:00:00Z')
    const fixed = makeFixed('fixed', '2026-05-20', '2026-05-21') // Wed-Thu
    const a = makeFluid('a', 0, '2026-05-25', 8) // Mon next week
    const result = compress(resource, [a, fixed], fromDate, false)
    const fixedResult = result.find(t => t.id === 'fixed')!
    expect(fixedResult.start_date).toEqual(new Date('2026-05-20T00:00:00Z'))
    expect(fixedResult.end_date).toEqual(new Date('2026-05-21T00:00:00Z'))
  })

  // 9. Input objects are never mutated
  it('does not mutate input task objects', () => {
    const fromDate = new Date('2026-05-18T00:00:00Z')
    const a = makeFluid('a', 0, '2026-05-25', 8) // Mon next week (has gap from fromDate)
    const originalStart = a.start_date.getTime()
    compress(resource, [a], fromDate, false)
    expect(a.start_date.getTime()).toBe(originalStart) // not mutated
  })
})
