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
