# Calendar Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one-way calendar sync (Plum → Google Calendar + Outlook) with per-task toggle, resource-user auto-matching, and inline sync in server actions.

**Architecture:** OAuth tokens stored per org-member in the existing `integration_tokens` table. `syncTaskToCalendar` is called from server actions after each task mutation — no background queue. Calendar events are all-day events keyed by `calendar_events(task_id, provider)`. Per-task `calendar_sync_enabled` flag controls opt-in. Resource-user linking via `resources.user_id`.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + RLS), Zustand v5, shadcn/ui DropdownMenu, fetch-based Google Calendar REST API + Microsoft Graph REST API (no extra SDKs), TypeScript, Vitest.

---

## File Map

| File | Create/Modify | Purpose |
|------|--------------|---------|
| `supabase/migrations/004_calendar_sync.sql` | Create | DB schema changes |
| `lib/engine/types.ts` | Modify | Add `calendar_sync_enabled?` to EngineTask |
| `actions/schedule.ts` | Modify | Map new field + add sync calls |
| `lib/calendar/types.ts` | Create | CalendarEvent interface, CalendarProvider type |
| `lib/calendar/utils.ts` | Create | `buildCalendarEvent`, `autoMatchResource` (pure) |
| `lib/calendar/google.ts` | Create | Google Calendar REST client |
| `lib/calendar/microsoft.ts` | Create | Microsoft Graph REST client |
| `lib/calendar/sync.ts` | Create | `syncTaskToCalendar` — dispatch to providers |
| `actions/integrations.ts` | Create | OAuth + toggle server actions |
| `app/api/integrations/google/callback/route.ts` | Create | Google OAuth callback |
| `app/api/integrations/microsoft/callback/route.ts` | Create | Microsoft OAuth callback |
| `lib/store/timeline.ts` | Modify | Add `connectedUserIds`, `taskSyncErrors` state |
| `app/(app)/[orgSlug]/timeline/page.tsx` | Modify | Fetch calendar metadata, pass to store |
| `components/integrations/calendar-settings.tsx` | Create | Connect/disconnect UI + resource picker |
| `app/(app)/[orgSlug]/settings/page.tsx` | Modify | Replace placeholder with real settings page |
| `components/timeline/task-context-menu.tsx` | Create | ⋮ dropdown: add/remove calendar, delete, retry |
| `components/timeline/resource-row.tsx` | Modify | Pass `calendarAvailable` + `hasSyncError` to TaskBlock |
| `components/timeline/task-block.tsx` | Modify | Show ⋮ button on hover, 📅⚠ badge, render context menu |
| `__tests__/lib/calendar-utils.test.ts` | Create | Tests for buildCalendarEvent + autoMatchResource |
| `__tests__/lib/google-calendar.test.ts` | Create | Tests for Google client |
| `__tests__/lib/microsoft-calendar.test.ts` | Create | Tests for Microsoft client |
| `__tests__/lib/sync-task.test.ts` | Create | Tests for syncTaskToCalendar |

---

## Task 1: DB Migration + EngineTask Type Update

**Files:**
- Create: `supabase/migrations/004_calendar_sync.sql`
- Modify: `lib/engine/types.ts`
- Modify: `actions/schedule.ts`
- Create: `__tests__/lib/calendar-types.test.ts`

### Context

The `integration_tokens` table already exists and is keyed by `(org_id, member_id, provider)` where `member_id` is a FK to `org_members`. All three tables (`resources`, `tasks`, `calendar_events`) need schema changes. The `EngineTask` type gets an optional `calendar_sync_enabled` field so server actions can read it without touching the engine internals.

- [ ] **Step 1: Write the test**

```ts
// __tests__/lib/calendar-types.test.ts
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
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm test __tests__/lib/calendar-types.test.ts
```

Expected: FAIL — `calendar_sync_enabled` not on `EngineTask`.

- [ ] **Step 3: Add `calendar_sync_enabled` to EngineTask**

In `lib/engine/types.ts`, add one line at the end of the `EngineTask` interface (after `external_ref`):

```ts
export interface EngineTask {
  id: string
  org_id: string
  resource_id: string
  project_id: string | null
  name: string
  type: 'fixed' | 'fluid'
  status: 'pending' | 'in_progress' | 'completed'
  start_date: Date
  end_date: Date
  duration_hours: number
  actual_duration_hours: number | null
  position: number | null
  task_group_id: string | null
  segment_index: number | null
  constraints: TaskConstraint[]
  tags: string[]
  external_ref: ExternalRef | null
  calendar_sync_enabled?: boolean   // ← ADD THIS LINE
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
pnpm test __tests__/lib/calendar-types.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Update `toEngineTask` in `actions/schedule.ts`**

Find `toEngineTask` and add `calendar_sync_enabled` mapping after `external_ref`:

```ts
function toEngineTask(row: Record<string, unknown>): EngineTask {
  return {
    id: row.id as string,
    org_id: row.org_id as string,
    resource_id: row.resource_id as string,
    project_id: (row.project_id as string | null) ?? null,
    name: row.name as string,
    type: row.type as 'fixed' | 'fluid',
    status: row.status as 'pending' | 'in_progress' | 'completed',
    start_date: parseDateStr(row.start_date as string),
    end_date: parseDateStr(row.end_date as string),
    duration_hours: Number(row.duration_hours),
    actual_duration_hours:
      row.actual_duration_hours != null ? Number(row.actual_duration_hours) : null,
    position: (row.position as number | null) ?? null,
    task_group_id: (row.task_group_id as string | null) ?? null,
    segment_index: (row.segment_index as number | null) ?? null,
    constraints: Array.isArray(row.constraints)
      ? (row.constraints as TaskConstraint[])
      : [],
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    external_ref: (row.external_ref as ExternalRef | null) ?? null,
    calendar_sync_enabled: Boolean(row.calendar_sync_enabled ?? false),  // ← ADD
  }
}
```

- [ ] **Step 6: Update `toDbRow` in `actions/schedule.ts`**

Find `toDbRow` and add `calendar_sync_enabled` at the end:

```ts
function toDbRow(task: EngineTask) {
  return {
    id: task.id,
    org_id: task.org_id,
    resource_id: task.resource_id,
    project_id: task.project_id,
    name: task.name,
    type: task.type,
    status: task.status,
    start_date: toDateStr(task.start_date),
    end_date: toDateStr(task.end_date),
    duration_hours: task.duration_hours,
    actual_duration_hours: task.actual_duration_hours,
    position: task.position,
    task_group_id: task.task_group_id,
    segment_index: task.segment_index,
    constraints: task.constraints as unknown as import('@/lib/types/database').Json,
    tags: task.tags,
    external_ref: task.external_ref as unknown as import('@/lib/types/database').Json | null,
    calendar_sync_enabled: task.calendar_sync_enabled ?? false,  // ← ADD
  }
}
```

- [ ] **Step 7: Create the migration**

```sql
-- supabase/migrations/004_calendar_sync.sql

-- Link person resources to their Plum user account
ALTER TABLE resources
  ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Per-task opt-in for calendar sync
ALTER TABLE tasks
  ADD COLUMN calendar_sync_enabled boolean NOT NULL DEFAULT false;

-- Stores the external calendar event ID per (task, provider)
CREATE TABLE calendar_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider   text NOT NULL CHECK (provider IN ('google_calendar', 'outlook')),
  event_id   text NOT NULL,
  sync_error boolean NOT NULL DEFAULT false,
  UNIQUE (task_id, provider)
);

CREATE INDEX idx_calendar_events_task_id ON calendar_events(task_id);
CREATE INDEX idx_calendar_events_user_id ON calendar_events(user_id);

-- RLS: users can see/manage their own calendar event rows
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own calendar events"
  ON calendar_events
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

- [ ] **Step 8: Apply the migration**

```bash
pnpm exec supabase db push
```

Expected: Migration applied successfully, no errors.

- [ ] **Step 9: Run full test suite to confirm no regressions**

```bash
pnpm test
```

Expected: All existing tests pass.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/004_calendar_sync.sql lib/engine/types.ts actions/schedule.ts __tests__/lib/calendar-types.test.ts
git commit -m "feat: calendar sync DB migration and EngineTask type update"
```

---

## Task 2: Calendar Types + Pure Utilities

**Files:**
- Create: `lib/calendar/types.ts`
- Create: `lib/calendar/utils.ts`
- Create: `__tests__/lib/calendar-utils.test.ts`

### Context

`buildCalendarEvent` converts an `EngineTask` to a `CalendarEvent`. `autoMatchResource` compares the user's name/email against org resources — case-insensitive substring match, returns a resource ID only when exactly one resource matches. Both are pure functions with no DB or API calls.

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/lib/calendar-utils.test.ts
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm test __tests__/lib/calendar-utils.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Create `lib/calendar/types.ts`**

```ts
// lib/calendar/types.ts

export interface CalendarEvent {
  title: string
  startDate: string  // YYYY-MM-DD (inclusive start)
  endDate: string    // YYYY-MM-DD (inclusive end — providers handle exclusivity internally)
  description: string
}

export type CalendarProvider = 'google_calendar' | 'outlook'
```

- [ ] **Step 4: Create `lib/calendar/utils.ts`**

```ts
// lib/calendar/utils.ts

import type { EngineTask } from '@/lib/engine/types'
import type { CalendarEvent } from './types'

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function buildCalendarEvent(task: EngineTask): CalendarEvent {
  const label = task.type === 'fixed' ? 'Fixed task' : 'Fluid task'
  return {
    title: task.name,
    startDate: formatDate(task.start_date),
    endDate: formatDate(task.end_date),
    description: `${task.duration_hours} working hours · ${label}`,
  }
}

export function autoMatchResource(
  userName: string,
  userEmail: string,
  resources: Array<{ id: string; name: string; icon_type: string }>
): string | null {
  const personResources = resources.filter((r) => r.icon_type === 'person')
  const nameLower = userName.toLowerCase()
  const emailPrefix = userEmail.split('@')[0].toLowerCase()

  const matches = personResources.filter((r) => {
    const rName = r.name.toLowerCase()
    return (
      nameLower.includes(rName) ||
      rName.includes(nameLower) ||
      emailPrefix.includes(rName) ||
      rName.includes(emailPrefix)
    )
  })

  return matches.length === 1 ? matches[0].id : null
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
pnpm test __tests__/lib/calendar-utils.test.ts
```

Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/calendar/types.ts lib/calendar/utils.ts __tests__/lib/calendar-utils.test.ts
git commit -m "feat: calendar types and pure utilities"
```

---

## Task 3: Google Calendar REST Client

**Files:**
- Create: `lib/calendar/google.ts`
- Create: `__tests__/lib/google-calendar.test.ts`

### Context

Uses Google Calendar REST API directly via `fetch` — no `googleapis` SDK needed. Google all-day events use an **exclusive** end date (last day + 1). Token refresh calls `https://oauth2.googleapis.com/token`. `deleteEvent` ignores 404 (event already gone). Reads `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from env.

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/lib/google-calendar.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createEvent, updateEvent, deleteEvent, refreshGoogleToken } from '@/lib/calendar/google'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('Google Calendar client', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    process.env.GOOGLE_CLIENT_ID = 'test-id'
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret'
  })

  describe('createEvent', () => {
    it('POSTs to primary calendar and returns the event ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'google-evt-123' }),
      })
      const id = await createEvent('tok', {
        title: 'Sprint Review',
        startDate: '2026-05-19',
        endDate: '2026-05-21',
        description: '16 working hours · Fixed task',
      })
      expect(id).toBe('google-evt-123')
      const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toContain('/calendars/primary/events')
      // Google requires exclusive end: 2026-05-22
      expect(JSON.parse(opts.body as string).end.date).toBe('2026-05-22')
    })

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })
      await expect(
        createEvent('bad', { title: '', startDate: '', endDate: '', description: '' })
      ).rejects.toThrow('401')
    })
  })

  describe('deleteEvent', () => {
    it('resolves without throwing for 404 (already deleted)', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })
      await expect(deleteEvent('tok', 'missing')).resolves.toBeUndefined()
    })

    it('throws for non-404 error status', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })
      await expect(deleteEvent('tok', 'evt-id')).rejects.toThrow('500')
    })
  })

  describe('refreshGoogleToken', () => {
    it('exchanges refresh token and returns new access token + expiry', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'new-tok', expires_in: 3600 }),
      })
      const result = await refreshGoogleToken('refresh-tok')
      expect(result.accessToken).toBe('new-tok')
      expect(result.expiresAt).toBeInstanceOf(Date)
    })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm test __tests__/lib/google-calendar.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/calendar/google.ts`**

```ts
// lib/calendar/google.ts

import type { CalendarEvent } from './types'

const EVENTS_API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
const TOKEN_API = 'https://oauth2.googleapis.com/token'

// Google all-day events need exclusive end date (last day + 1)
function exclusiveEnd(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + 1))
  return next.toISOString().slice(0, 10)
}

export async function refreshGoogleToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: Date }> {
  const res = await fetch(TOKEN_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Google token refresh failed: ${res.status}`)
  const data = (await res.json()) as { access_token: string; expires_in: number }
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  }
}

export async function createEvent(
  accessToken: string,
  event: CalendarEvent
): Promise<string> {
  const res = await fetch(EVENTS_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: event.title,
      description: event.description,
      start: { date: event.startDate },
      end: { date: exclusiveEnd(event.endDate) },
    }),
  })
  if (!res.ok) throw new Error(`Google createEvent failed: ${res.status}`)
  const data = (await res.json()) as { id: string }
  return data.id
}

export async function updateEvent(
  accessToken: string,
  eventId: string,
  event: CalendarEvent
): Promise<void> {
  const res = await fetch(`${EVENTS_API}/${eventId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: event.title,
      description: event.description,
      start: { date: event.startDate },
      end: { date: exclusiveEnd(event.endDate) },
    }),
  })
  if (!res.ok) throw new Error(`Google updateEvent failed: ${res.status}`)
}

export async function deleteEvent(
  accessToken: string,
  eventId: string
): Promise<void> {
  const res = await fetch(`${EVENTS_API}/${eventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok && res.status !== 404)
    throw new Error(`Google deleteEvent failed: ${res.status}`)
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm test __tests__/lib/google-calendar.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/calendar/google.ts __tests__/lib/google-calendar.test.ts
git commit -m "feat: Google Calendar REST client"
```

---

## Task 4: Microsoft Graph REST Client

**Files:**
- Create: `lib/calendar/microsoft.ts`
- Create: `__tests__/lib/microsoft-calendar.test.ts`

### Context

Uses Microsoft Graph REST API via `fetch`. Microsoft all-day events use `isAllDay: true` with inclusive start/end dates set to `T00:00:00` and `T23:59:59` UTC. Token refresh calls `https://login.microsoftonline.com/{MICROSOFT_TENANT_ID}/oauth2/v2.0/token`. `deleteEvent` ignores 404. Reads `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` from env.

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/lib/microsoft-calendar.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createEvent, updateEvent, deleteEvent, refreshMicrosoftToken } from '@/lib/calendar/microsoft'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('Microsoft Graph calendar client', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    process.env.MICROSOFT_CLIENT_ID = 'ms-id'
    process.env.MICROSOFT_CLIENT_SECRET = 'ms-secret'
    process.env.MICROSOFT_TENANT_ID = 'common'
  })

  describe('createEvent', () => {
    it('POSTs to Graph /me/events and returns the event ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'ms-evt-456' }),
      })
      const id = await createEvent('tok', {
        title: 'Sprint Review',
        startDate: '2026-05-19',
        endDate: '2026-05-21',
        description: '16 working hours · Fixed task',
      })
      expect(id).toBe('ms-evt-456')
      const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toContain('graph.microsoft.com')
      const body = JSON.parse(opts.body as string)
      expect(body.isAllDay).toBe(true)
      // Microsoft uses inclusive end (same date, T23:59:59)
      expect(body.end.dateTime).toBe('2026-05-21T23:59:59')
    })

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403 })
      await expect(
        createEvent('bad', { title: '', startDate: '', endDate: '', description: '' })
      ).rejects.toThrow('403')
    })
  })

  describe('deleteEvent', () => {
    it('resolves without throwing for 404', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })
      await expect(deleteEvent('tok', 'missing')).resolves.toBeUndefined()
    })

    it('throws for non-404 error status', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })
      await expect(deleteEvent('tok', 'evt-id')).rejects.toThrow('500')
    })
  })

  describe('refreshMicrosoftToken', () => {
    it('exchanges refresh token and returns new access token + expiry', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'new-ms-tok', expires_in: 3600 }),
      })
      const result = await refreshMicrosoftToken('refresh-tok')
      expect(result.accessToken).toBe('new-ms-tok')
      expect(result.expiresAt).toBeInstanceOf(Date)
    })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm test __tests__/lib/microsoft-calendar.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/calendar/microsoft.ts`**

```ts
// lib/calendar/microsoft.ts

import type { CalendarEvent } from './types'

const EVENTS_API = 'https://graph.microsoft.com/v1.0/me/events'

function tokenUrl(): string {
  const tenant = process.env.MICROSOFT_TENANT_ID ?? 'common'
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`
}

export async function refreshMicrosoftToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: Date }> {
  const res = await fetch(tokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: 'Calendars.ReadWrite offline_access',
    }),
  })
  if (!res.ok) throw new Error(`Microsoft token refresh failed: ${res.status}`)
  const data = (await res.json()) as { access_token: string; expires_in: number }
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  }
}

function graphBody(event: CalendarEvent) {
  return {
    subject: event.title,
    body: { contentType: 'Text', content: event.description },
    start: { dateTime: `${event.startDate}T00:00:00`, timeZone: 'UTC' },
    end: { dateTime: `${event.endDate}T23:59:59`, timeZone: 'UTC' },
    isAllDay: true,
  }
}

export async function createEvent(
  accessToken: string,
  event: CalendarEvent
): Promise<string> {
  const res = await fetch(EVENTS_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(graphBody(event)),
  })
  if (!res.ok) throw new Error(`Microsoft createEvent failed: ${res.status}`)
  const data = (await res.json()) as { id: string }
  return data.id
}

export async function updateEvent(
  accessToken: string,
  eventId: string,
  event: CalendarEvent
): Promise<void> {
  const res = await fetch(`${EVENTS_API}/${eventId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(graphBody(event)),
  })
  if (!res.ok) throw new Error(`Microsoft updateEvent failed: ${res.status}`)
}

export async function deleteEvent(
  accessToken: string,
  eventId: string
): Promise<void> {
  const res = await fetch(`${EVENTS_API}/${eventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok && res.status !== 404)
    throw new Error(`Microsoft deleteEvent failed: ${res.status}`)
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm test __tests__/lib/microsoft-calendar.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/calendar/microsoft.ts __tests__/lib/microsoft-calendar.test.ts
git commit -m "feat: Microsoft Graph calendar client"
```

---

## Task 5: Core Sync Function

**Files:**
- Create: `lib/calendar/sync.ts`
- Create: `__tests__/lib/sync-task.test.ts`

### Context

`syncTaskToCalendar` is the single function called by all server actions. It must never throw — failures are stored in `calendar_events.sync_error`. The `integration_tokens` table uses `member_id` (FK to `org_members`), not `user_id` directly, so the lookup path is: `task.org_id + resource.user_id → org_members.id → integration_tokens`.

Token refresh: if `expires_at` is within 60 seconds of now (or already past), refresh first and update `integration_tokens`. Token refresh failure sets `sync_error = true` without throwing.

For the `delete` operation, fetch the `calendar_events` row **before** the task is deleted from the DB (the caller handles this — they call this function before `persistAndBroadcast`).

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/lib/sync-task.test.ts
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
    const tokensQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: undefined,
    }
    const futureExpiry = new Date(Date.now() + 3_600_000).toISOString()
    Object.assign(tokensQuery, {
      // Return tokens array
      then: undefined,
    })
    // Simulate tokens fetch returning data directly
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm test __tests__/lib/sync-task.test.ts
```

Expected: FAIL — `@/lib/calendar/sync` not found.

- [ ] **Step 3: Create `lib/calendar/sync.ts`**

```ts
// lib/calendar/sync.ts

import { createServiceClient } from '@/lib/supabase/server'
import { buildCalendarEvent } from './utils'
import * as google from './google'
import * as microsoft from './microsoft'
import type { EngineTask } from '@/lib/engine/types'

interface TokenRow {
  provider: string
  access_token: string
  refresh_token: string | null
  expires_at: string | null
  member_id: string
  org_id: string
}

async function getValidToken(
  admin: ReturnType<typeof createServiceClient>,
  token: TokenRow
): Promise<string> {
  const isExpired =
    !token.expires_at ||
    new Date(token.expires_at).getTime() < Date.now() + 60_000

  if (!isExpired) return token.access_token
  if (!token.refresh_token) throw new Error('No refresh token — cannot refresh')

  const refreshed =
    token.provider === 'google_calendar'
      ? await google.refreshGoogleToken(token.refresh_token)
      : await microsoft.refreshMicrosoftToken(token.refresh_token)

  await admin
    .from('integration_tokens')
    .update({
      access_token: refreshed.accessToken,
      expires_at: refreshed.expiresAt.toISOString(),
    })
    .eq('member_id', token.member_id)
    .eq('provider', token.provider)

  return refreshed.accessToken
}

export async function syncTaskToCalendar(
  task: EngineTask & { calendar_sync_enabled?: boolean },
  operation: 'create' | 'update' | 'delete'
): Promise<void> {
  if (!task.calendar_sync_enabled) return

  const admin = createServiceClient()

  // 1. Get resource's linked user
  const { data: resource } = await admin
    .from('resources')
    .select('user_id')
    .eq('id', task.resource_id)
    .single()

  if (!resource?.user_id) return
  const userId = resource.user_id as string

  // 2. Find org_member record (integration_tokens is keyed by member_id)
  const { data: member } = await admin
    .from('org_members')
    .select('id')
    .eq('org_id', task.org_id)
    .eq('user_id', userId)
    .not('joined_at', 'is', null)
    .single()

  if (!member) return

  // 3. Get all connected calendar tokens for this member
  const { data: tokens } = await admin
    .from('integration_tokens')
    .select('provider, access_token, refresh_token, expires_at, member_id, org_id')
    .eq('member_id', (member as { id: string }).id)

  if (!tokens || tokens.length === 0) return

  const calendarEvent = buildCalendarEvent(task)

  for (const token of tokens as TokenRow[]) {
    if (token.provider !== 'google_calendar' && token.provider !== 'outlook') continue

    // Fetch existing calendar_events row before try/catch so we can reference it in catch
    let existingEventId: string | null = null
    try {
      const { data: existing } = await admin
        .from('calendar_events')
        .select('event_id')
        .eq('task_id', task.id)
        .eq('provider', token.provider)
        .maybeSingle()
      existingEventId = (existing as { event_id: string } | null)?.event_id ?? null

      const accessToken = await getValidToken(admin, token)

      if (operation === 'create' || (operation === 'update' && !existingEventId)) {
        const eventId =
          token.provider === 'google_calendar'
            ? await google.createEvent(accessToken, calendarEvent)
            : await microsoft.createEvent(accessToken, calendarEvent)

        await admin.from('calendar_events').upsert({
          task_id: task.id,
          user_id: userId,
          provider: token.provider,
          event_id: eventId,
          sync_error: false,
        })
      } else if (operation === 'update' && existingEventId) {
        if (token.provider === 'google_calendar') {
          await google.updateEvent(accessToken, existingEventId, calendarEvent)
        } else {
          await microsoft.updateEvent(accessToken, existingEventId, calendarEvent)
        }
        await admin
          .from('calendar_events')
          .update({ sync_error: false })
          .eq('task_id', task.id)
          .eq('provider', token.provider)
      } else if (operation === 'delete' && existingEventId) {
        if (token.provider === 'google_calendar') {
          await google.deleteEvent(accessToken, existingEventId)
        } else {
          await microsoft.deleteEvent(accessToken, existingEventId)
        }
        await admin
          .from('calendar_events')
          .delete()
          .eq('task_id', task.id)
          .eq('provider', token.provider)
      }
    } catch (err) {
      console.error(`[calendar-sync] ${operation} failed for ${token.provider}:`, err)
      // Best-effort: mark sync_error without blocking the task mutation
      await admin
        .from('calendar_events')
        .upsert({
          task_id: task.id,
          user_id: userId,
          provider: token.provider,
          event_id: existingEventId ?? '',
          sync_error: true,
        })
        .catch(() => {})
    }
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm test __tests__/lib/sync-task.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Run full test suite**

```bash
pnpm test
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/calendar/sync.ts __tests__/lib/sync-task.test.ts
git commit -m "feat: syncTaskToCalendar core sync function"
```

---

## Task 6: OAuth Callbacks + Integration Server Actions

**Files:**
- Create: `app/api/integrations/google/callback/route.ts`
- Create: `app/api/integrations/microsoft/callback/route.ts`
- Create: `actions/integrations.ts`

### Context

The OAuth flow starts from `/{orgSlug}/settings` where the user clicks a connect button. The server action `initiateCalendarConnect` builds the authorization URL and returns it (no redirect from server action — the client does `window.location.href = url`). The `state` parameter encodes the `orgSlug` so the callback knows where to redirect afterward.

After token exchange, the callback:
1. Gets the authed user from Supabase
2. Looks up the org by slug (from state) and the user's org_member record
3. Upserts into `integration_tokens` (keyed by `org_id, member_id, provider`)
4. Calls `autoMatchResource` and sets `resources.user_id` if exactly one match

`NEXT_PUBLIC_APP_URL` must be set in `.env.local` (e.g. `http://localhost:3000`). This is the base URL used to build the redirect_uri for OAuth.

`disconnectCalendar` deletes provider-side events first (best-effort), then removes DB rows. `toggleCalendarSync` enables/disables sync for a single task and triggers the sync function. `retryCalendarSync` sets `calendar_sync_enabled = true` and triggers `syncTaskToCalendar` with `'create'` (to re-create the failed event). `matchResource` lets users manually override their resource assignment.

- [ ] **Step 1: Add required env vars to `.env.local`**

Add these variables to your `.env.local` file:

```
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
MICROSOFT_CLIENT_ID=your-microsoft-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret
MICROSOFT_TENANT_ID=common
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

For Google: create credentials at https://console.cloud.google.com — OAuth 2.0 Client ID, Web application type. Add `http://localhost:3000/api/integrations/google/callback` as an authorized redirect URI.

For Microsoft: register an app at https://portal.azure.com → App registrations. Add `http://localhost:3000/api/integrations/microsoft/callback` as a redirect URI. Under API permissions, add `Calendars.ReadWrite` (delegated).

- [ ] **Step 2: Create `actions/integrations.ts`**

```ts
// actions/integrations.ts
'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { autoMatchResource } from '@/lib/calendar/utils'
import { syncTaskToCalendar } from '@/lib/calendar/sync'

type Provider = 'google_calendar' | 'outlook'

// ---------------------------------------------------------------------------
// OAuth initiation
// ---------------------------------------------------------------------------

export async function initiateCalendarConnect(
  provider: Provider,
  orgSlug: string
): Promise<{ url: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL!

  if (provider === 'google_calendar') {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    url.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID!)
    url.searchParams.set('redirect_uri', `${baseUrl}/api/integrations/google/callback`)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar.events')
    url.searchParams.set('access_type', 'offline')
    url.searchParams.set('prompt', 'consent')
    url.searchParams.set('state', orgSlug)
    return { url: url.toString() }
  }

  // Microsoft
  const tenant = process.env.MICROSOFT_TENANT_ID ?? 'common'
  const url = new URL(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`)
  url.searchParams.set('client_id', process.env.MICROSOFT_CLIENT_ID!)
  url.searchParams.set('redirect_uri', `${baseUrl}/api/integrations/microsoft/callback`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'Calendars.ReadWrite offline_access')
  url.searchParams.set('state', orgSlug)
  return { url: url.toString() }
}

// ---------------------------------------------------------------------------
// Disconnect
// ---------------------------------------------------------------------------

export async function disconnectCalendar(
  provider: Provider,
  orgId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createServiceClient()

  // Get the member record
  const { data: member } = await supabase
    .from('org_members')
    .select('id')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .not('joined_at', 'is', null)
    .single()
  if (!member) return { error: 'Not a member of this organisation' }

  const memberId = (member as { id: string }).id

  // Fetch token to use for API calls
  const { data: token } = await admin
    .from('integration_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('member_id', memberId)
    .eq('provider', provider)
    .single()

  // Fetch all calendar_events for this user+provider
  const { data: calEvents } = await admin
    .from('calendar_events')
    .select('event_id, task_id')
    .eq('user_id', user.id)
    .eq('provider', provider)

  // Best-effort: delete all provider-side events
  if (token && calEvents) {
    const { refreshGoogleToken } = await import('@/lib/calendar/google')
    const { refreshMicrosoftToken, deleteEvent: msDelete } = await import('@/lib/calendar/microsoft')
    const { deleteEvent: gDelete } = await import('@/lib/calendar/google')

    let accessToken = (token as { access_token: string }).access_token
    const tokenRow = token as { access_token: string; refresh_token: string | null; expires_at: string | null }
    const isExpired = tokenRow.expires_at && new Date(tokenRow.expires_at).getTime() < Date.now() + 60_000
    if (isExpired && tokenRow.refresh_token) {
      try {
        const refreshed = provider === 'google_calendar'
          ? await refreshGoogleToken(tokenRow.refresh_token)
          : await refreshMicrosoftToken(tokenRow.refresh_token)
        accessToken = refreshed.accessToken
      } catch { /* ignore — proceed with potentially stale token */ }
    }

    for (const ev of calEvents as { event_id: string; task_id: string }[]) {
      try {
        if (provider === 'google_calendar') {
          await gDelete(accessToken, ev.event_id)
        } else {
          await msDelete(accessToken, ev.event_id)
        }
      } catch { /* ignore individual failures */ }
    }
  }

  // Delete calendar_events rows
  await admin
    .from('calendar_events')
    .delete()
    .eq('user_id', user.id)
    .eq('provider', provider)

  // Delete the token
  await admin
    .from('integration_tokens')
    .delete()
    .eq('member_id', memberId)
    .eq('provider', provider)

  return {}
}

// ---------------------------------------------------------------------------
// Manual resource assignment override
// ---------------------------------------------------------------------------

export async function matchResource(
  resourceId: string,
  orgId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createServiceClient()

  // Verify resource belongs to this org and is person type
  const { data: resource } = await supabase
    .from('resources')
    .select('id, org_id, icon_type')
    .eq('id', resourceId)
    .eq('org_id', orgId)
    .single()

  if (!resource) return { error: 'Resource not found' }
  if ((resource as { icon_type: string }).icon_type !== 'person') {
    return { error: 'Only person-type resources can be linked to a user' }
  }

  // Clear any existing claim on this resource, then set the new one
  await admin.from('resources').update({ user_id: null }).eq('user_id', user.id).eq('org_id', orgId)
  await admin.from('resources').update({ user_id: user.id }).eq('id', resourceId)

  return {}
}

// ---------------------------------------------------------------------------
// Per-task calendar toggle
// ---------------------------------------------------------------------------

export async function toggleCalendarSync(
  taskId: string,
  enabled: boolean
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createServiceClient()

  const { data: taskRow } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single()

  if (!taskRow) return { error: 'Task not found' }

  if (!enabled) {
    // Disable: delete calendar events first, then clear flag
    const { syncTaskToCalendar: sync } = await import('@/lib/calendar/sync')
    const { toTask } = await import('./schedule-helpers')
    // Build minimal EngineTask for sync (calendar_sync_enabled must be true for sync to fire)
    const task = toTask({ ...taskRow, calendar_sync_enabled: true })
    await sync(task, 'delete')
    await admin.from('tasks').update({ calendar_sync_enabled: false }).eq('id', taskId)
    return {}
  }

  // Enable: set flag, then create event
  await admin.from('tasks').update({ calendar_sync_enabled: true }).eq('id', taskId)
  const { data: updatedRow } = await admin.from('tasks').select('*').eq('id', taskId).single()
  if (!updatedRow) return { error: 'Task not found after update' }

  const { syncTaskToCalendar: sync } = await import('@/lib/calendar/sync')
  const { toTask } = await import('./schedule-helpers')
  const task = toTask(updatedRow as Record<string, unknown>)
  await sync(task, 'create')

  return {}
}

export async function retryCalendarSync(taskId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createServiceClient()

  // Clear sync_error flags before retry
  await admin
    .from('calendar_events')
    .update({ sync_error: false })
    .eq('task_id', taskId)

  const { data: taskRow } = await admin.from('tasks').select('*').eq('id', taskId).single()
  if (!taskRow) return { error: 'Task not found' }

  const { syncTaskToCalendar: sync } = await import('@/lib/calendar/sync')
  const { toTask } = await import('./schedule-helpers')
  const task = toTask({ ...(taskRow as Record<string, unknown>), calendar_sync_enabled: true })
  await sync(task, 'update')  // 'update' creates if no event_id exists

  return {}
}
```

**Note on `schedule-helpers`:** `toggleCalendarSync` and `retryCalendarSync` need `toTask` (same logic as `toEngineTask` in `actions/schedule.ts`). Extract `toEngineTask` and `parseDateStr` into a shared file `actions/schedule-helpers.ts` so both files can import them. In Task 9 you'll also see `actions/schedule.ts` importing from there.

- [ ] **Step 3: Create `actions/schedule-helpers.ts`**

Extract these two functions from `actions/schedule.ts` into a new file:

```ts
// actions/schedule-helpers.ts

import type { EngineTask } from '@/lib/engine/types'
import type { WorkingWeek, TaskConstraint, ExternalRef } from '@/lib/types'

export function parseDateStr(str: string): Date {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function toTask(row: Record<string, unknown>): EngineTask {
  return {
    id: row.id as string,
    org_id: row.org_id as string,
    resource_id: row.resource_id as string,
    project_id: (row.project_id as string | null) ?? null,
    name: row.name as string,
    type: row.type as 'fixed' | 'fluid',
    status: row.status as 'pending' | 'in_progress' | 'completed',
    start_date: parseDateStr(row.start_date as string),
    end_date: parseDateStr(row.end_date as string),
    duration_hours: Number(row.duration_hours),
    actual_duration_hours:
      row.actual_duration_hours != null ? Number(row.actual_duration_hours) : null,
    position: (row.position as number | null) ?? null,
    task_group_id: (row.task_group_id as string | null) ?? null,
    segment_index: (row.segment_index as number | null) ?? null,
    constraints: Array.isArray(row.constraints)
      ? (row.constraints as TaskConstraint[])
      : [],
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    external_ref: (row.external_ref as ExternalRef | null) ?? null,
    calendar_sync_enabled: Boolean(row.calendar_sync_enabled ?? false),
  }
}
```

Then in `actions/schedule.ts`, replace the inline `parseDateStr` and `toEngineTask` with imports:

```ts
import { parseDateStr, toTask as toEngineTask } from './schedule-helpers'
```

(Keep `toDateStr` and `toDbRow` in `schedule.ts` since they're not shared.)

- [ ] **Step 4: Create `app/api/integrations/google/callback/route.ts`**

```ts
// app/api/integrations/google/callback/route.ts

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { autoMatchResource } from '@/lib/calendar/utils'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const orgSlug = searchParams.get('state')
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL!

  if (!code || !orgSlug) {
    return Response.redirect(`${baseUrl}/`)
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      code,
      redirect_uri: `${baseUrl}/api/integrations/google/callback`,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    return Response.redirect(`${baseUrl}/${orgSlug}/settings?error=oauth_failed`)
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.redirect(`${baseUrl}/sign-in`)
  }

  const { data: org } = await supabase
    .from('orgs')
    .select('id')
    .eq('slug', orgSlug)
    .single()

  if (!org) {
    return Response.redirect(`${baseUrl}/${orgSlug}/settings?error=org_not_found`)
  }
  const orgId = (org as { id: string }).id

  const { data: member } = await supabase
    .from('org_members')
    .select('id')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .not('joined_at', 'is', null)
    .single()

  if (!member) {
    return Response.redirect(`${baseUrl}/${orgSlug}/settings?error=not_member`)
  }
  const memberId = (member as { id: string }).id

  const admin = createServiceClient()

  await admin.from('integration_tokens').upsert(
    {
      org_id: orgId,
      member_id: memberId,
      provider: 'google_calendar',
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token ?? null,
      expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
    },
    { onConflict: 'org_id,member_id,provider' }
  )

  // Auto-match resource by name/email
  const { data: resources } = await admin
    .from('resources')
    .select('id, name, icon_type')
    .eq('org_id', orgId)
    .is('user_id', null)

  const userName: string =
    (user.user_metadata?.full_name as string | undefined) ?? user.email ?? ''
  const userEmail = user.email ?? ''
  const matchedId = autoMatchResource(userName, userEmail, (resources ?? []) as Array<{ id: string; name: string; icon_type: string }>)

  if (matchedId) {
    await admin.from('resources').update({ user_id: user.id }).eq('id', matchedId)
  }

  return Response.redirect(`${baseUrl}/${orgSlug}/settings`)
}
```

- [ ] **Step 5: Create `app/api/integrations/microsoft/callback/route.ts`**

```ts
// app/api/integrations/microsoft/callback/route.ts

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { autoMatchResource } from '@/lib/calendar/utils'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const orgSlug = searchParams.get('state')
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL!

  if (!code || !orgSlug) {
    return Response.redirect(`${baseUrl}/`)
  }

  const tenant = process.env.MICROSOFT_TENANT_ID ?? 'common'
  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        code,
        redirect_uri: `${baseUrl}/api/integrations/microsoft/callback`,
        grant_type: 'authorization_code',
        scope: 'Calendars.ReadWrite offline_access',
      }),
    }
  )

  if (!tokenRes.ok) {
    return Response.redirect(`${baseUrl}/${orgSlug}/settings?error=oauth_failed`)
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.redirect(`${baseUrl}/sign-in`)
  }

  const { data: org } = await supabase
    .from('orgs')
    .select('id')
    .eq('slug', orgSlug)
    .single()

  if (!org) {
    return Response.redirect(`${baseUrl}/${orgSlug}/settings?error=org_not_found`)
  }
  const orgId = (org as { id: string }).id

  const { data: member } = await supabase
    .from('org_members')
    .select('id')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .not('joined_at', 'is', null)
    .single()

  if (!member) {
    return Response.redirect(`${baseUrl}/${orgSlug}/settings?error=not_member`)
  }
  const memberId = (member as { id: string }).id

  const admin = createServiceClient()

  await admin.from('integration_tokens').upsert(
    {
      org_id: orgId,
      member_id: memberId,
      provider: 'outlook',
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token ?? null,
      expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
    },
    { onConflict: 'org_id,member_id,provider' }
  )

  const { data: resources } = await admin
    .from('resources')
    .select('id, name, icon_type')
    .eq('org_id', orgId)
    .is('user_id', null)

  const userName: string =
    (user.user_metadata?.full_name as string | undefined) ?? user.email ?? ''
  const userEmail = user.email ?? ''
  const matchedId = autoMatchResource(userName, userEmail, (resources ?? []) as Array<{ id: string; name: string; icon_type: string }>)

  if (matchedId) {
    await admin.from('resources').update({ user_id: user.id }).eq('id', matchedId)
  }

  return Response.redirect(`${baseUrl}/${orgSlug}/settings`)
}
```

- [ ] **Step 6: Run full test suite**

```bash
pnpm test
```

Expected: All existing tests pass.

- [ ] **Step 7: Commit**

```bash
git add actions/integrations.ts actions/schedule-helpers.ts actions/schedule.ts app/api/integrations/
git commit -m "feat: calendar OAuth callbacks and integration server actions"
```

---

## Task 7: Timeline Store + Settings Page UI

**Files:**
- Modify: `lib/store/timeline.ts`
- Modify: `app/(app)/[orgSlug]/timeline/page.tsx`
- Create: `components/integrations/calendar-settings.tsx`
- Modify: `app/(app)/[orgSlug]/settings/page.tsx`

### Context

The timeline store needs two new slices: `connectedUserIds` (user IDs with at least one calendar token in this org) and `taskSyncErrors` (task IDs where `calendar_events.sync_error = true`). These are fetched server-side in the timeline page and passed as initial store values. This data flows down to `ResourceRow` → `TaskBlock` without extra client-side fetching.

The settings page replaces the placeholder. It fetches everything server-side and passes to a client component `CalendarSettings` for the interactive connect/disconnect buttons.

- [ ] **Step 1: Add `connectedUserIds` and `taskSyncErrors` to the timeline store**

In `lib/store/timeline.ts`, add to `TimelineState`:

```ts
interface TimelineState {
  viewportStart: Date
  zoomLevel: ZoomLevel
  tasks: Record<string, EngineTask[]>
  violations: ConstraintViolation[]
  selectedTaskId: string | null
  draggingTaskId: string | null
  preOptimisticTasks: Record<string, EngineTask[]> | null
  connectedUserIds: Set<string>    // ← ADD: user IDs with calendar connected
  taskSyncErrors: Set<string>      // ← ADD: task IDs with sync_error=true
}
```

Add to `TimelineActions`:

```ts
interface TimelineActions {
  // ... existing actions ...
  setConnectedUserIds: (ids: Set<string>) => void   // ← ADD
  setTaskSyncErrors: (ids: Set<string>) => void      // ← ADD
}
```

Add defaults in `createTimelineStore`:

```ts
// inside createStore((set, get) => ({ ... }))
connectedUserIds: initial?.connectedUserIds ?? new Set<string>(),
taskSyncErrors: initial?.taskSyncErrors ?? new Set<string>(),

setConnectedUserIds: (ids) => set({ connectedUserIds: ids }),
setTaskSyncErrors: (ids) => set({ taskSyncErrors: ids }),
```

Also add `connectedUserIds` and `taskSyncErrors` to the `Partial<TimelineState>` initial parameter so the page can seed them.

- [ ] **Step 2: Update `app/(app)/[orgSlug]/timeline/page.tsx` to fetch calendar metadata**

Add two parallel fetches alongside the existing ones:

```ts
const [
  { data: resources },
  { data: taskRows },
  { data: projects },
  { data: tokenMembers },    // ← ADD
  { data: syncErrorRows },   // ← ADD
] = await Promise.all([
  supabase.from('resources').select('id, name, icon_type, working_week, user_id').eq('org_id', org.id),
  supabase.from('tasks').select('*').eq('org_id', org.id),
  supabase.from('projects').select('id, name, color').eq('org_id', org.id),
  // Members who have at least one calendar token
  supabase
    .from('integration_tokens')
    .select('org_members!inner(user_id, org_id)')
    .eq('org_members.org_id', org.id),
  // Tasks with a sync error
  supabase
    .from('calendar_events')
    .select('task_id')
    .eq('sync_error', true),
])
```

Then compute and pass the Sets to `TimelineView`:

```ts
// Collect user IDs who have at least one calendar token in this org
const connectedUserIds = new Set<string>(
  (tokenMembers ?? [])
    .map((row: { org_members: { user_id: string } | null }) => row.org_members?.user_id)
    .filter(Boolean) as string[]
)

// Collect task IDs with any sync error
const taskSyncErrors = new Set<string>(
  (syncErrorRows ?? []).map((row: { task_id: string }) => row.task_id)
)
```

Pass to `TimelineView`:

```tsx
<TimelineView
  initialTasks={tasksByResource}
  resources={typedResources}
  org={org}
  projects={projects ?? []}
  connectedUserIds={connectedUserIds}
  taskSyncErrors={taskSyncErrors}
/>
```

Also update the resource type to include `user_id`:

```ts
const typedResources = (resources ?? []) as unknown as Array<{
  id: string
  name: string
  icon_type: 'person' | 'room' | 'equipment'
  working_week: WorkingWeek
  user_id: string | null   // ← ADD
}>
```

- [ ] **Step 3: Update `TimelineView` to accept and seed new store state**

In `components/timeline/timeline-view.tsx`, add `connectedUserIds` and `taskSyncErrors` to `TimelineViewProps` and seed the store:

```ts
interface TimelineViewProps {
  initialTasks: Record<string, EngineTask[]>
  resources: Array<{ id: string; name: string; icon_type: 'person' | 'room' | 'equipment'; working_week: WorkingWeek; user_id: string | null }>
  org: { id: string; name: string; slug: string }
  projects: Array<{ id: string; name: string; color: string }>
  connectedUserIds: Set<string>   // ← ADD
  taskSyncErrors: Set<string>     // ← ADD
}
```

In `useMemo`:

```ts
const store = useMemo(
  () => createTimelineStore({ tasks: initialTasks, connectedUserIds, taskSyncErrors }),
  []
)
```

Add a `useEffect` to sync updates (parallel to the existing `setAllTasks` effect):

```ts
useEffect(() => {
  store.getState().setConnectedUserIds(connectedUserIds)
}, [connectedUserIds, store])

useEffect(() => {
  store.getState().setTaskSyncErrors(taskSyncErrors)
}, [taskSyncErrors, store])
```

- [ ] **Step 4: Create `components/integrations/calendar-settings.tsx`**

```tsx
// components/integrations/calendar-settings.tsx
'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { initiateCalendarConnect, disconnectCalendar, matchResource } from '@/actions/integrations'

interface Props {
  orgId: string
  orgSlug: string
  googleConnected: boolean
  outlookConnected: boolean
  myResourceId: string | null
  resources: Array<{ id: string; name: string }>
  resourceUserId: string | null  // current linked user for each resource (null if none)
  // Admin view: all resources with their linked user
  allResourceLinks?: Array<{ resourceId: string; resourceName: string; userEmail: string | null }>
  isAdmin: boolean
}

export function CalendarSettings({
  orgId,
  orgSlug,
  googleConnected,
  outlookConnected,
  myResourceId,
  resources,
  isAdmin,
  allResourceLinks = [],
}: Props) {
  const [, startTransition] = useTransition()
  const [selectedResourceId, setSelectedResourceId] = useState(myResourceId ?? '')

  function connect(provider: 'google_calendar' | 'outlook') {
    startTransition(async () => {
      const result = await initiateCalendarConnect(provider, orgSlug)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      window.location.href = result.url
    })
  }

  function disconnect(provider: 'google_calendar' | 'outlook') {
    startTransition(async () => {
      const result = await disconnectCalendar(provider, orgId)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(`${provider === 'google_calendar' ? 'Google Calendar' : 'Outlook'} disconnected`)
      window.location.reload()
    })
  }

  function saveResourceMatch() {
    if (!selectedResourceId) return
    startTransition(async () => {
      const result = await matchResource(selectedResourceId, orgId)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Resource updated')
    })
  }

  return (
    <div className="space-y-8">
      {/* Calendar connections */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold">Calendar connections</h2>
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">Google Calendar</p>
            <p className="text-xs text-muted-foreground">Sync tasks to your Google Calendar</p>
          </div>
          {googleConnected ? (
            <div className="flex items-center gap-3">
              <span className="text-xs text-green-600 font-medium">Connected</span>
              <Button variant="outline" size="sm" onClick={() => disconnect('google_calendar')}>
                Disconnect
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={() => connect('google_calendar')}>
              Connect Google Calendar
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">Microsoft Outlook</p>
            <p className="text-xs text-muted-foreground">Sync tasks to your Outlook calendar</p>
          </div>
          {outlookConnected ? (
            <div className="flex items-center gap-3">
              <span className="text-xs text-green-600 font-medium">Connected</span>
              <Button variant="outline" size="sm" onClick={() => disconnect('outlook')}>
                Disconnect
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={() => connect('outlook')}>
              Connect Outlook
            </Button>
          )}
        </div>
      </section>

      {/* Resource linking */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold">Your resource</h2>
        <p className="text-sm text-muted-foreground">
          Calendar events sync to the calendar of the user linked to a resource.
          Select which resource represents you.
        </p>
        <div className="flex items-center gap-3">
          <select
            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
            value={selectedResourceId}
            onChange={(e) => setSelectedResourceId(e.target.value)}
          >
            <option value="">— No resource selected —</option>
            {resources.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <Button size="sm" onClick={saveResourceMatch} disabled={!selectedResourceId}>
            Save
          </Button>
        </div>
      </section>

      {/* Admin view */}
      {isAdmin && allResourceLinks.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-base font-semibold">Resource — user mapping (admin)</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="pb-2 text-left font-medium">Resource</th>
                <th className="pb-2 text-left font-medium">Linked user</th>
              </tr>
            </thead>
            <tbody>
              {allResourceLinks.map((link) => (
                <tr key={link.resourceId} className="border-b last:border-0">
                  <td className="py-2">{link.resourceName}</td>
                  <td className="py-2 text-muted-foreground">
                    {link.userEmail ?? <span className="italic">Not linked</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Update `app/(app)/[orgSlug]/settings/page.tsx`**

Replace the placeholder with a real server component:

```tsx
// app/(app)/[orgSlug]/settings/page.tsx

import { notFound } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { CalendarSettings } from '@/components/integrations/calendar-settings'

interface Props {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ error?: string }>
}

export default async function SettingsPage({ params, searchParams }: Props) {
  const { orgSlug } = await params
  const { error } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: org } = await supabase
    .from('orgs')
    .select('id, name')
    .eq('slug', orgSlug)
    .single()
  if (!org) notFound()
  const orgId = (org as { id: string }).id

  const { data: member } = await supabase
    .from('org_members')
    .select('id, role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .not('joined_at', 'is', null)
    .single()
  if (!member) notFound()

  const memberId = (member as { id: string }).id
  const isAdmin = ['owner', 'admin'].includes((member as { role: string }).role)
  const admin = createServiceClient()

  // Connected calendar providers for this member
  const { data: tokens } = await admin
    .from('integration_tokens')
    .select('provider')
    .eq('member_id', memberId)

  const connectedProviders = new Set(
    ((tokens ?? []) as { provider: string }[]).map((t) => t.provider)
  )

  // Person-type resources in this org (for the resource picker)
  const { data: personResources } = await admin
    .from('resources')
    .select('id, name, user_id')
    .eq('org_id', orgId)
    .eq('icon_type', 'person')

  const myResourceId =
    ((personResources ?? []) as { id: string; user_id: string | null }[]).find(
      (r) => r.user_id === user.id
    )?.id ?? null

  const resourceOptions = (personResources ?? []) as { id: string; name: string }[]

  // Admin: all resources with linked user emails
  let allResourceLinks: Array<{ resourceId: string; resourceName: string; userEmail: string | null }> = []
  if (isAdmin) {
    // Fetch all resources with their linked user (via auth.users — use service role)
    // We join resources → auth.users via user_id
    // Supabase doesn't expose auth.users via the JS client directly, so we store email in user_metadata
    // Approach: fetch all resources, then for each user_id fetch their email from org_members join profiles
    const { data: allResources } = await admin
      .from('resources')
      .select('id, name, user_id')
      .eq('org_id', orgId)
      .eq('icon_type', 'person')

    // Get emails for linked user_ids from org_members
    const linkedUserIds = (allResources ?? [])
      .map((r: { user_id: string | null }) => r.user_id)
      .filter(Boolean) as string[]

    const { data: linkedMembers } = linkedUserIds.length > 0
      ? await admin
          .from('org_members')
          .select('user_id, users:user_id(email)')
          .eq('org_id', orgId)
          .in('user_id', linkedUserIds)
      : { data: [] }

    const userEmailMap = new Map(
      ((linkedMembers ?? []) as { user_id: string; users: { email: string } | null }[]).map(
        (m) => [m.user_id, m.users?.email ?? null]
      )
    )

    allResourceLinks = (allResources ?? []).map(
      (r: { id: string; name: string; user_id: string | null }) => ({
        resourceId: r.id,
        resourceName: r.name,
        userEmail: r.user_id ? (userEmailMap.get(r.user_id) ?? null) : null,
      })
    )
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-1">Settings</h1>
      <p className="text-sm text-muted-foreground mb-8">{(org as { name: string }).name}</p>

      {error === 'oauth_failed' && (
        <div className="mb-6 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          Calendar connection failed. Please try again.
        </div>
      )}

      <CalendarSettings
        orgId={orgId}
        orgSlug={orgSlug}
        googleConnected={connectedProviders.has('google_calendar')}
        outlookConnected={connectedProviders.has('outlook')}
        myResourceId={myResourceId}
        resources={resourceOptions}
        resourceUserId={user.id}
        isAdmin={isAdmin}
        allResourceLinks={allResourceLinks}
      />
    </div>
  )
}
```

- [ ] **Step 6: Run full test suite**

```bash
pnpm test
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add lib/store/timeline.ts app/\(app\)/\[orgSlug\]/timeline/page.tsx components/integrations/calendar-settings.tsx app/\(app\)/\[orgSlug\]/settings/page.tsx
git commit -m "feat: timeline store calendar state + settings page with calendar integration UI"
```

---

## Task 8: Task Context Menu + TaskBlock Updates

**Files:**
- Create: `components/timeline/task-context-menu.tsx`
- Modify: `components/timeline/resource-row.tsx`
- Modify: `components/timeline/task-block.tsx`

### Context

The context menu uses shadcn `DropdownMenu`. If not already installed, run `pnpm dlx shadcn@latest add dropdown-menu`. The `⋮` button appears on hover over a task block (top-right corner). `ResourceRow` computes `calendarAvailable` by checking if its resource's `user_id` is in the store's `connectedUserIds`. `TaskBlock` reads `hasSyncError` from the store's `taskSyncErrors`. The delete action currently doesn't exist as a standalone action — add `deleteTask` call from the context menu (it already exists in `actions/schedule.ts`).

- [ ] **Step 1: Install DropdownMenu if needed**

```bash
# Check if dropdown-menu is already available
ls components/ui/dropdown-menu.tsx 2>/dev/null || pnpm dlx shadcn@latest add dropdown-menu
```

- [ ] **Step 2: Create `components/timeline/task-context-menu.tsx`**

```tsx
// components/timeline/task-context-menu.tsx
'use client'

import { useTransition } from 'react'
import { CalendarPlus, CalendarX, RefreshCw, Trash2, MoreHorizontal } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { toggleCalendarSync, retryCalendarSync } from '@/actions/integrations'
import { deleteTask } from '@/actions/schedule'
import { useTimelineStore } from '@/lib/store/timeline'

interface TaskContextMenuProps {
  taskId: string
  resourceId: string
  calendarSyncEnabled: boolean
  calendarAvailable: boolean  // resource has linked user with calendar connected
  hasSyncError: boolean
}

export function TaskContextMenu({
  taskId,
  resourceId,
  calendarSyncEnabled,
  calendarAvailable,
  hasSyncError,
}: TaskContextMenuProps) {
  const [, startTransition] = useTransition()
  const setTasks = useTimelineStore((s) => s.setTasks)
  const setViolations = useTimelineStore((s) => s.setViolations)
  const setTaskSyncErrors = useTimelineStore((s) => s.setTaskSyncErrors)
  const taskSyncErrors = useTimelineStore((s) => s.taskSyncErrors)

  function handleCalendarToggle() {
    startTransition(async () => {
      const result = await toggleCalendarSync(taskId, !calendarSyncEnabled)
      if (result.error) {
        toast.error(result.error)
        return
      }
      if (!calendarSyncEnabled) {
        toast.success('Task added to calendar')
      } else {
        toast.success('Task removed from calendar')
        const next = new Set(taskSyncErrors)
        next.delete(taskId)
        setTaskSyncErrors(next)
      }
    })
  }

  function handleRetry() {
    startTransition(async () => {
      const result = await retryCalendarSync(taskId)
      if (result.error) {
        toast.error(result.error)
        return
      }
      const next = new Set(taskSyncErrors)
      next.delete(taskId)
      setTaskSyncErrors(next)
      toast.success('Calendar sync retried')
    })
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteTask(taskId)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      setTasks(resourceId, result.tasks)
      setViolations(result.violations)
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 absolute top-0.5 right-0.5 z-20 bg-background/80 hover:bg-background"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {hasSyncError ? (
          <DropdownMenuItem onClick={handleRetry}>
            <RefreshCw className="h-3.5 w-3.5 mr-2" />
            Retry sync
          </DropdownMenuItem>
        ) : calendarSyncEnabled ? (
          <DropdownMenuItem onClick={handleCalendarToggle}>
            <CalendarX className="h-3.5 w-3.5 mr-2" />
            Remove from calendar
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onClick={handleCalendarToggle}
            disabled={!calendarAvailable}
            title={!calendarAvailable ? 'Connect a calendar in Settings first' : undefined}
          >
            <CalendarPlus className="h-3.5 w-3.5 mr-2" />
            Add to calendar
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleDelete}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5 mr-2" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 3: Update `components/timeline/resource-row.tsx`**

Add `user_id` to the resource prop and compute `calendarAvailable`. Pass both to `TaskBlock`:

```tsx
'use client'

import { useRef } from 'react'
import { User, Building2, Wrench } from 'lucide-react'
import { useTimelineStore } from '@/lib/store/timeline'
import { TaskBlock } from './task-block'
import type { EngineTask } from '@/lib/engine/types'

const EMPTY_TASKS: EngineTask[] = []

interface ResourceRowProps {
  resource: {
    id: string
    name: string
    icon_type: 'person' | 'room' | 'equipment'
    user_id: string | null   // ← ADD
  }
}

const ICON_MAP = {
  person: User,
  room: Building2,
  equipment: Wrench,
} as const

export function ResourceRow({ resource }: ResourceRowProps) {
  const tasks = useTimelineStore((s) => s.tasks[resource.id] ?? EMPTY_TASKS)
  const connectedUserIds = useTimelineStore((s) => s.connectedUserIds)   // ← ADD
  const taskAreaRef = useRef<HTMLDivElement>(null)

  const Icon = ICON_MAP[resource.icon_type]

  // True when this resource has a linked user who has at least one calendar connected
  const calendarAvailable =                                               // ← ADD
    resource.user_id != null && connectedUserIds.has(resource.user_id)

  return (
    <div className="flex border-b">
      <div className="w-48 shrink-0 sticky left-0 z-20 bg-background flex items-center gap-2 px-3 text-sm font-medium h-16 border-r">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{resource.name}</span>
      </div>

      <div ref={taskAreaRef} className="relative h-16 flex-1 overflow-visible">
        {tasks.map((task) => (
          <TaskBlock
            key={task.id}
            task={task}
            taskAreaRef={taskAreaRef}
            resourceTasks={tasks}
            calendarAvailable={calendarAvailable}   // ← ADD
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Update `components/timeline/task-block.tsx`**

Add three changes:
1. Accept `calendarAvailable` prop
2. Add `group` class and `⋮` button via `TaskContextMenu`
3. Show `📅⚠` badge when `hasSyncError`

At the top, add imports:

```ts
import { CalendarX } from 'lucide-react'
import { TaskContextMenu } from './task-context-menu'
import { useTimelineStore } from '@/lib/store/timeline'
```

Add `calendarAvailable` to `TaskBlockProps`:

```ts
interface TaskBlockProps {
  task: EngineTask
  taskAreaRef: React.RefObject<HTMLDivElement | null>
  resourceTasks: EngineTask[]
  calendarAvailable: boolean   // ← ADD
}
```

Add `hasSyncError` derived from store (inside the component body, after existing store selectors):

```ts
const taskSyncErrors = useTimelineStore((s) => s.taskSyncErrors)
const hasSyncError = taskSyncErrors.has(task.id)
```

In the `taskContent` block, add the sync error badge alongside the existing `AlertTriangle` violation badge, and add the context menu button:

```tsx
const taskContent = (
  <>
    {task.type === 'fixed' && (
      <Lock className="h-3 w-3 shrink-0 mr-0.5 opacity-60" />
    )}
    <span className="overflow-hidden whitespace-nowrap text-ellipsis text-xs px-1 flex-1">
      {task.name}
    </span>
    {hasViolation && (
      <AlertTriangle className="absolute top-0.5 right-5 h-3 w-3 text-timeline-violation" />
    )}
    {hasSyncError && (
      <CalendarX className="absolute top-0.5 right-8 h-3 w-3 text-amber-500" />
    )}
    {/* Context menu trigger — hidden until hover (via group-hover on parent) */}
    <TaskContextMenu
      taskId={task.id}
      resourceId={task.resource_id}
      calendarSyncEnabled={task.calendar_sync_enabled ?? false}
      calendarAvailable={calendarAvailable}
      hasSyncError={hasSyncError}
    />
    {/* Resize handle */}
    <div
      className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize z-10"
      onPointerDown={startResize}
    />
  </>
)
```

Add `group` class to the outer `div` so `group-hover:opacity-100` on the `⋮` button works:

```tsx
return (
  <div
    ref={taskRef}
    style={{ left, width, top: 4, height: 'calc(100% - 8px)', position: 'absolute' }}
    title={task.name}
    className={`group ${baseClasses} ${continuationClasses} ${shaking ? 'animate-shake' : ''} flex items-center px-1 overflow-hidden select-none`}
  >
```

- [ ] **Step 5: Run full test suite**

```bash
pnpm test
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add components/timeline/task-context-menu.tsx components/timeline/resource-row.tsx components/timeline/task-block.tsx
git commit -m "feat: task context menu with calendar toggle and sync error badge"
```

---

## Task 9: Hook Sync into Schedule Actions

**Files:**
- Modify: `actions/schedule.ts`

### Context

Four existing server actions need `syncTaskToCalendar` calls added. The call always happens **after** `persistAndBroadcast` succeeds — except for `deleteTask` which must call sync **before** `persistAndBroadcast` (because `ON DELETE CASCADE` on `calendar_events` would wipe the event IDs before we can call the provider API). `syncTaskToCalendar` never throws, so no try/catch is needed around the call.

For `deleteTask`: the task being deleted is available in the `tasks` array fetched by `fetchResourceAndTasks`. Find it there and pass to sync before calling `persistAndBroadcast`.

- [ ] **Step 1: Import `syncTaskToCalendar` in `actions/schedule.ts`**

Add at the top of `actions/schedule.ts`:

```ts
import { syncTaskToCalendar } from '@/lib/calendar/sync'
```

- [ ] **Step 2: Add sync call to `insertTask`**

After `if (error) return { error }` and before `revalidatePath`, add:

```ts
// New tasks always have calendar_sync_enabled = false — this is a no-op
// but included for future-proofing (e.g. if default changes)
const insertedTask = result.find((t) => t.id === taskInput.id)
if (insertedTask) {
  await syncTaskToCalendar(insertedTask, 'create')
}
```

- [ ] **Step 3: Add sync call to `adjustTask`**

After `if (error) return { error }` and before `revalidatePath`, add:

```ts
const adjustedTask = result.find((t) => t.id === taskId)
if (adjustedTask) {
  await syncTaskToCalendar(adjustedTask, 'update')
}
```

- [ ] **Step 4: Add sync call to `deleteTask`**

In `deleteTask`, after fetching `tasks` from `fetchResourceAndTasks` but **before** calling `persistAndBroadcast`, add:

```ts
// Sync calendar BEFORE persist — ON DELETE CASCADE would wipe event IDs
const taskToDelete = tasks.find((t) => t.id === taskId)
if (taskToDelete) {
  await syncTaskToCalendar(taskToDelete, 'delete')
}
```

Full `deleteTask` with sync in the right place:

```ts
export async function deleteTask(taskId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const admin = createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: taskRow } = await supabase
    .from('tasks')
    .select('resource_id')
    .eq('id', taskId)
    .single()

  if (!taskRow) return { error: 'Task not found' }

  const fetched = await fetchResourceAndTasks(taskRow.resource_id, supabase)
  if (!fetched) return { error: 'Resource not found' }

  const { resource, tasks, orgId } = fetched

  // ↓ Sync calendar BEFORE engine delete — event IDs must be readable
  const taskToDelete = tasks.find((t) => t.id === taskId)
  if (taskToDelete) {
    await syncTaskToCalendar(taskToDelete, 'delete')
  }

  const result = engineDeleteTask(tasks, taskId)
  const violations = validateConstraints(result)

  const { error } = await persistAndBroadcast(admin, supabase, orgId, resource.id, tasks, result)
  if (error) return { error }

  revalidatePath('/[orgSlug]/timeline', 'page')
  return { tasks: result, violations }
}
```

- [ ] **Step 5: Add sync call to `reassignTask`**

After both `persistAndBroadcast` calls succeed and before `revalidatePath`, add:

```ts
// Sync the moved task (it now belongs to the target resource)
const movedTask = newTargetTasks.find((t) => t.id === taskId)
if (movedTask) {
  await syncTaskToCalendar(movedTask, 'update')
}
```

- [ ] **Step 6: Run full test suite**

```bash
pnpm test
```

Expected: All tests pass. Count should be previous total + tests from Tasks 1–5.

- [ ] **Step 7: Build to verify TypeScript**

```bash
pnpm build
```

Expected: Clean build, no type errors.

- [ ] **Step 8: Commit**

```bash
git add actions/schedule.ts
git commit -m "feat: hook calendar sync into schedule server actions"
```

---

## Invariants

1. `syncTaskToCalendar` never throws — all failures logged and stored as `sync_error`
2. `deleteTask` calls `syncTaskToCalendar` before `persistAndBroadcast` — event IDs must be available before CASCADE delete
3. Token refresh fires before every calendar API call if `expires_at < now + 60s`
4. `autoMatchResource` only matches `person`-type resources — rooms and equipment are excluded
5. `integration_tokens` is keyed by `(org_id, member_id, provider)` — all upserts must use this conflict target
6. `calendar_sync_enabled` is optional on `EngineTask` — treat `undefined` as `false` everywhere
7. Google all-day events use exclusive end date (endDate + 1 day); Microsoft uses inclusive (endDate T23:59:59) — each client handles this internally; `CalendarEvent.endDate` is always inclusive

---

## Verification

```bash
pnpm test    # all tests pass
pnpm build   # clean TypeScript

# Manual smoke test (requires real Google/MS OAuth apps configured)
1. Sign in → go to /{slug}/settings
2. Click "Connect Google Calendar" → OAuth consent → returns to settings → "Connected ✓"
3. Confirm auto-match: "You are matched to: Alice" (if name matches)
4. Go to /{slug}/timeline → create a fixed task for Alice
5. Right-click task → "Add to calendar" → event appears in Google Calendar
6. Resize task → confirm Google Calendar event dates update
7. Delete task → confirm Google Calendar event is deleted
8. Connect Outlook from settings → both connectors show "Connected ✓"
9. Right-click another task → "Add to calendar" → event appears in BOTH calendars
10. Disconnect Google → Google events deleted, Outlook events remain
11. Task assigned to a room resource → "Add to calendar" is greyed out (no linked user)
12. Simulate API failure (revoke token manually) → 📅⚠ badge appears → "Retry sync" in menu
```
