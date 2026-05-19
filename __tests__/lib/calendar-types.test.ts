import { describe, it, expect } from 'vitest'
import type { EngineTask } from '@/lib/engine/types'

describe('EngineTask.calendar_sync_enabled', () => {
  it('accepts true', () => {
    const t = { calendar_sync_enabled: true } as Partial<EngineTask>
    expect(t.calendar_sync_enabled).toBe(true)
  })

  it('accepts false', () => {
    const t = { calendar_sync_enabled: false } as Partial<EngineTask>
    expect(t.calendar_sync_enabled).toBe(false)
  })

  it('is undefined when not set (treated as false by sync)', () => {
    const t = {} as Partial<EngineTask>
    expect(t.calendar_sync_enabled).toBeUndefined()
  })
})
