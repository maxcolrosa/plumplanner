import { describe, it, expect } from 'vitest'
import { buildCalendarEvent, autoMatchResource } from '@/lib/calendar/utils'
import type { EngineTask } from '@/lib/engine/types'

const baseTask: EngineTask = {
  id: 'task-1',
  org_id: 'org-1',
  resource_id: 'res-1',
  project_id: null,
  name: 'Design Review',
  type: 'fixed',
  status: 'pending',
  start_date: new Date(Date.UTC(2026, 4, 19)),
  end_date: new Date(Date.UTC(2026, 4, 21)),
  duration_hours: 16,
  actual_duration_hours: null,
  position: null,
  task_group_id: null,
  segment_index: null,
  constraints: [],
  tags: [],
  external_ref: null,
}

describe('buildCalendarEvent', () => {
  it('maps task name to event title', () => {
    expect(buildCalendarEvent(baseTask).title).toBe('Design Review')
  })

  it('formats start and end dates as YYYY-MM-DD', () => {
    const ev = buildCalendarEvent(baseTask)
    expect(ev.startDate).toBe('2026-05-19')
    expect(ev.endDate).toBe('2026-05-21')
  })

  it('includes duration and type in description for fixed task', () => {
    const ev = buildCalendarEvent(baseTask)
    expect(ev.description).toBe('16 working hours · Fixed task')
  })

  it('labels fluid tasks as Fluid task', () => {
    const ev = buildCalendarEvent({ ...baseTask, type: 'fluid', duration_hours: 8 })
    expect(ev.description).toBe('8 working hours · Fluid task')
  })
})

describe('autoMatchResource', () => {
  const resources = [
    { id: 'res-alice', name: 'Alice', icon_type: 'person' },
    { id: 'res-bob', name: 'Bob', icon_type: 'person' },
    { id: 'res-room', name: 'Meeting Room', icon_type: 'room' },
  ]

  it('matches user whose display name contains the resource name', () => {
    expect(autoMatchResource('Alice Johnson', 'alice@co.com', resources)).toBe('res-alice')
  })

  it('matches by email prefix when display name does not match', () => {
    // 'A. Smith' does not match; email prefix 'bob' matches 'Bob'
    expect(autoMatchResource('A. Smith', 'bob@co.com', resources)).toBe('res-bob')
  })

  it('returns null when multiple resources match', () => {
    // Both 'Alice' and 'Bob' are substrings of nothing — but 'alice bob' contains both
    expect(autoMatchResource('Alice Bob', 'alicebob@co.com', resources)).toBeNull()
  })

  it('excludes non-person resources from matching', () => {
    // Only person resources considered — 'Meeting Room' is icon_type='room'
    expect(autoMatchResource('Meeting Room', 'room@co.com', resources)).toBeNull()
  })
})
