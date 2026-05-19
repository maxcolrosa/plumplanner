import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase service client
const mockFrom = vi.fn()
const mockServiceClient = { from: mockFrom }
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => mockServiceClient,
}))

// Mock calendar clients
vi.mock('@/lib/calendar/google', () => ({
  createEvent: vi.fn().mockResolvedValue('google-evt-id'),
  updateEvent: vi.fn().mockResolvedValue(undefined),
  deleteEvent: vi.fn().mockResolvedValue(undefined),
  refreshGoogleToken: vi.fn().mockResolvedValue({ accessToken: 'new-tok', expiresAt: new Date() }),
}))
vi.mock('@/lib/calendar/microsoft', () => ({
  createEvent: vi.fn().mockResolvedValue('ms-evt-id'),
  updateEvent: vi.fn().mockResolvedValue(undefined),
  deleteEvent: vi.fn().mockResolvedValue(undefined),
  refreshMicrosoftToken: vi.fn(),
}))

import { syncTaskToCalendar } from '@/lib/calendar/sync'
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

// Helper: build a chainable Supabase query mock
function makeQuery(data: unknown, error = null) {
  const q: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'is', 'not', 'single', 'maybeSingle', 'update', 'upsert', 'delete']
  for (const m of methods) {
    q[m] = vi.fn().mockReturnValue(q)
  }
  q['then'] = undefined  // not a thenable — use single/maybeSingle instead
  ;(q as { single: ReturnType<typeof vi.fn> }).single = vi.fn().mockResolvedValue({ data, error })
  ;(q as { maybeSingle: ReturnType<typeof vi.fn> }).maybeSingle = vi.fn().mockResolvedValue({ data, error })
  ;(q as { upsert: ReturnType<typeof vi.fn> }).upsert = vi.fn().mockResolvedValue({ error: null })
  ;(q as { update: ReturnType<typeof vi.fn> }).update = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
  })
  ;(q as { delete: ReturnType<typeof vi.fn> }).delete = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
  })
  return q
}

describe('syncTaskToCalendar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns immediately when calendar_sync_enabled is false', async () => {
    const task = { ...baseTask, calendar_sync_enabled: false }
    await syncTaskToCalendar(task, 'create')
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns immediately when calendar_sync_enabled is undefined', async () => {
    const task = { ...baseTask }  // calendar_sync_enabled undefined
    await syncTaskToCalendar(task, 'create')
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns immediately when resource has no linked user_id', async () => {
    const task = { ...baseTask, calendar_sync_enabled: true }
    const resourceQuery = makeQuery({ user_id: null })
    mockFrom.mockReturnValue(resourceQuery)

    await syncTaskToCalendar(task, 'create')
    // Only one DB call (for resource lookup), no calendar API calls
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })

  it('does not throw when calendar API call fails — sets sync_error instead', async () => {
    const { createEvent } = await import('@/lib/calendar/google')
    vi.mocked(createEvent).mockRejectedValueOnce(new Error('Network error'))

    const task = { ...baseTask, calendar_sync_enabled: true }

    // resource query
    const resourceQuery = makeQuery({ user_id: 'user-1' })
    // org_members query
    const memberQuery = makeQuery({ id: 'member-1' })
    // integration_tokens query
    const futureExpiry = new Date(Date.now() + 3_600_000).toISOString()
    const tokensData = [{
      provider: 'google_calendar',
      access_token: 'tok',
      refresh_token: null,
      expires_at: futureExpiry,
      member_id: 'member-1',
      org_id: 'org-1',
    }]
    const tokensFetch = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: tokensData, error: null }),
    }
    // calendar_events query
    const calEvQuery = makeQuery(null)
    // upsert (sync_error)
    const upsertQuery = { upsert: vi.fn().mockResolvedValue({ error: null }) }

    mockFrom
      .mockReturnValueOnce(resourceQuery)   // resources
      .mockReturnValueOnce(memberQuery)     // org_members
      .mockReturnValueOnce(tokensFetch)     // integration_tokens
      .mockReturnValueOnce(calEvQuery)      // calendar_events select
      .mockReturnValueOnce(upsertQuery)     // calendar_events upsert (sync_error)

    // Should NOT throw even though createEvent failed
    await expect(syncTaskToCalendar(task, 'create')).resolves.toBeUndefined()
  })
})
