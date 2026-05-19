import { describe, it, expect } from 'vitest'
import type { EngineTask } from '@/lib/engine/types'

// toEngineTask / toDbRow are private helpers inside actions/schedule.ts
// (Next.js 'use server' files cannot export non-async functions).
// These tests verify the EngineTask type accepts calendar_sync_enabled
// at the TypeScript level — catching regressions if the field is removed
// from the interface or its type changes.

function makeEngineTask(overrides: Partial<EngineTask>): EngineTask {
  const base: EngineTask = {
    id: 'task-1',
    org_id: 'org-1',
    resource_id: 'res-1',
    project_id: null,
    name: 'Test task',
    type: 'fluid',
    status: 'pending',
    start_date: new Date('2026-05-19T09:00:00Z'),
    end_date: new Date('2026-05-19T17:00:00Z'),
    duration_hours: 8,
    actual_duration_hours: null,
    position: 0,
    task_group_id: null,
    segment_index: null,
    constraints: [],
    tags: [],
    external_ref: null,
  }
  return { ...base, ...overrides }
}

describe('EngineTask.calendar_sync_enabled', () => {
  it('accepts true — task is opted in to calendar sync', () => {
    const task = makeEngineTask({ calendar_sync_enabled: true })
    expect(task.calendar_sync_enabled).toBe(true)
  })

  it('accepts false — task is explicitly opted out of calendar sync', () => {
    const task = makeEngineTask({ calendar_sync_enabled: false })
    expect(task.calendar_sync_enabled).toBe(false)
  })

  it('is undefined when omitted — treated as disabled by sync logic', () => {
    const task = makeEngineTask({})
    expect(task.calendar_sync_enabled).toBeUndefined()
  })
})
