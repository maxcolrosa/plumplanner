import { validateConstraints } from '@/lib/engine/constraints'
import type { EngineTask } from '@/lib/engine/types'

function makeTask(id: string, start: string, end: string, opts?: Partial<EngineTask>): EngineTask {
  return {
    id,
    org_id: 'o1',
    resource_id: 'r1',
    project_id: null,
    name: id,
    type: 'fluid',
    status: 'pending',
    start_date: new Date(start + 'T00:00:00Z'),
    end_date: new Date(end + 'T00:00:00Z'),
    duration_hours: 8,
    actual_duration_hours: null,
    position: 0,
    task_group_id: null,
    segment_index: null,
    constraints: [],
    tags: [],
    external_ref: null,
    ...opts,
  }
}

describe('validateConstraints', () => {
  // 1. No constraints → no violations
  it('returns empty array when no tasks have constraints', () => {
    const tasks = [makeTask('a', '2026-05-18', '2026-05-18')]
    expect(validateConstraints(tasks)).toEqual([])
  })

  // 2. not_before_date: task starts before limit → violation
  it('returns violation when task starts before not_before_date', () => {
    const task = makeTask('a', '2026-05-18', '2026-05-18', {
      constraints: [{ type: 'not_before_date', value: '2026-05-20' }],
    })
    const violations = validateConstraints([task])
    expect(violations).toHaveLength(1)
    expect(violations[0].task_id).toBe('a')
    expect(violations[0].constraint_type).toBe('not_before_date')
  })

  // 3. not_before_date: task starts on the limit date → no violation (boundary: on date is OK)
  it('returns no violation when task starts exactly on not_before_date', () => {
    const task = makeTask('a', '2026-05-20', '2026-05-20', {
      constraints: [{ type: 'not_before_date', value: '2026-05-20' }],
    })
    expect(validateConstraints([task])).toEqual([])
  })

  // 4. not_before_date: task starts after limit → no violation
  it('returns no violation when task starts after not_before_date', () => {
    const task = makeTask('a', '2026-05-22', '2026-05-22', {
      constraints: [{ type: 'not_before_date', value: '2026-05-20' }],
    })
    expect(validateConstraints([task])).toEqual([])
  })

  // 5. not_after_date: task ends after limit → violation
  it('returns violation when task ends after not_after_date', () => {
    const task = makeTask('a', '2026-05-20', '2026-05-22', {
      constraints: [{ type: 'not_after_date', value: '2026-05-21' }],
    })
    const violations = validateConstraints([task])
    expect(violations).toHaveLength(1)
    expect(violations[0].task_id).toBe('a')
    expect(violations[0].constraint_type).toBe('not_after_date')
  })

  // 6. not_after_date: task ends exactly on limit → no violation
  it('returns no violation when task ends exactly on not_after_date', () => {
    const task = makeTask('a', '2026-05-20', '2026-05-21', {
      constraints: [{ type: 'not_after_date', value: '2026-05-21' }],
    })
    expect(validateConstraints([task])).toEqual([])
  })

  // 7. not_after_date: task ends before limit → no violation
  it('returns no violation when task ends before not_after_date', () => {
    const task = makeTask('a', '2026-05-19', '2026-05-19', {
      constraints: [{ type: 'not_after_date', value: '2026-05-21' }],
    })
    expect(validateConstraints([task])).toEqual([])
  })

  // 8. not_before_task: task starts before referenced task ends → violation
  it('returns violation when task starts before referenced task ends', () => {
    const ref = makeTask('ref', '2026-05-18', '2026-05-20') // ends Wed
    const task = makeTask('a', '2026-05-19', '2026-05-21', {
      // starts Tue (before ref ends Wed)
      constraints: [{ type: 'not_before_task', value: 'ref' }],
    })
    const violations = validateConstraints([task, ref])
    expect(violations).toHaveLength(1)
    expect(violations[0].task_id).toBe('a')
    expect(violations[0].constraint_type).toBe('not_before_task')
  })

  // 9. not_before_task: task starts exactly when referenced task ends → no violation
  it('returns no violation when task starts exactly when referenced task ends', () => {
    const ref = makeTask('ref', '2026-05-18', '2026-05-20') // ends Wed
    const task = makeTask('a', '2026-05-20', '2026-05-22', {
      // starts Wed (same as ref end)
      constraints: [{ type: 'not_before_task', value: 'ref' }],
    })
    expect(validateConstraints([task, ref])).toEqual([])
  })

  // 10. not_before_task: referenced task not found → violation
  it('returns violation when referenced task is not found', () => {
    const task = makeTask('a', '2026-05-18', '2026-05-18', {
      constraints: [{ type: 'not_before_task', value: 'nonexistent-id' }],
    })
    const violations = validateConstraints([task])
    expect(violations).toHaveLength(1)
    expect(violations[0].task_id).toBe('a')
    expect(violations[0].constraint_type).toBe('not_before_task')
    expect(violations[0].message).toContain('not found')
  })

  // 11. no_split: never produces a violation
  it('does not produce a violation for no_split constraint', () => {
    const task = makeTask('a', '2026-05-18', '2026-05-18', {
      constraints: [{ type: 'no_split' }],
    })
    expect(validateConstraints([task])).toEqual([])
  })

  // 12. Multiple violations from multiple tasks
  it('returns all violations from multiple tasks', () => {
    const a = makeTask('a', '2026-05-18', '2026-05-18', {
      constraints: [{ type: 'not_before_date', value: '2026-05-20' }],
    })
    const b = makeTask('b', '2026-05-19', '2026-05-25', {
      constraints: [{ type: 'not_after_date', value: '2026-05-21' }],
    })
    const violations = validateConstraints([a, b])
    expect(violations).toHaveLength(2)
  })

  // 13. Multiple constraints on one task
  it('returns all violations from multiple constraints on one task', () => {
    const task = makeTask('a', '2026-05-18', '2026-05-25', {
      constraints: [
        { type: 'not_before_date', value: '2026-05-20' }, // violated (starts Mon before Wed)
        { type: 'not_after_date', value: '2026-05-21' }, // violated (ends Mon2 after Thu)
      ],
    })
    const violations = validateConstraints([task])
    expect(violations).toHaveLength(2)
    expect(violations.every(v => v.task_id === 'a')).toBe(true)
  })
})
