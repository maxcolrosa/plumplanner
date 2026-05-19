// __tests__/lib/status-report.test.ts
import { describe, it, expect } from 'vitest'
import { buildStatusReportPrompt } from '@/lib/ai/status-report'
import type { EngineTask } from '@/lib/engine/types'

function makeTask(overrides: Partial<EngineTask> = {}): EngineTask {
  return {
    id: 'task-1',
    org_id: 'org-1',
    resource_id: 'res-1',
    project_id: null,
    name: 'Test Task',
    type: 'fluid',
    status: 'pending',
    start_date: new Date('2026-05-19'),
    end_date: new Date('2026-05-20'),
    duration_hours: 8,
    actual_duration_hours: null,
    position: 0,
    task_group_id: null,
    segment_index: 0,
    constraints: [],
    tags: [],
    external_ref: null,
    created_at: '2026-05-19T00:00:00Z',
    updated_at: '2026-05-19T00:00:00Z',
    ...overrides,
  }
}

describe('buildStatusReportPrompt', () => {
  it('groups tasks by resource name', () => {
    const tasks = [
      makeTask({ resource_id: 'res-1', name: 'Task A', type: 'fluid' }),
      makeTask({ id: 'task-2', resource_id: 'res-2', name: 'Task B', type: 'fluid' }),
    ]
    const resourceNames = { 'res-1': 'Alice', 'res-2': 'Bob' }
    const prompt = buildStatusReportPrompt(tasks, resourceNames)
    const parsed = JSON.parse(prompt)
    expect(parsed).toHaveLength(2)
    expect(parsed.map((r: { resourceName: string }) => r.resourceName)).toContain('Alice')
    expect(parsed.map((r: { resourceName: string }) => r.resourceName)).toContain('Bob')
  })

  it('separates fluid and fixed tasks', () => {
    const tasks = [
      makeTask({ name: 'Fluid Task', type: 'fluid' }),
      makeTask({ id: 'task-2', name: 'Fixed Task', type: 'fixed' }),
    ]
    const resourceNames = { 'res-1': 'Alice' }
    const prompt = buildStatusReportPrompt(tasks, resourceNames)
    const parsed = JSON.parse(prompt)
    expect(parsed[0].fluidTasks).toHaveLength(1)
    expect(parsed[0].fixedTasks).toHaveLength(1)
    expect(parsed[0].fluidTasks[0].name).toBe('Fluid Task')
  })

  it('skips tasks with null resource_id', () => {
    const tasks = [
      makeTask({ resource_id: null as unknown as string, name: 'Orphan Task' }),
    ]
    const resourceNames = {}
    const prompt = buildStatusReportPrompt(tasks, resourceNames)
    const parsed = JSON.parse(prompt)
    expect(parsed).toHaveLength(0)
  })

  it('returns empty array JSON for no tasks', () => {
    const prompt = buildStatusReportPrompt([], {})
    expect(JSON.parse(prompt)).toEqual([])
  })
})
