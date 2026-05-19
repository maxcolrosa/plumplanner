# Plan 6: Calendar Sync — Design Spec

**Date:** 2026-05-19  
**Status:** Approved

---

## Overview

Plan 6 adds one-way calendar sync from Plum Planner to Google Calendar and Microsoft Outlook. Users connect their calendar accounts in Settings, are auto-matched to their resource, and can toggle individual tasks to appear as calendar events. Sync fires inline in existing server actions — no background queue needed.

**Scope:** Google Calendar + Outlook. One-way: Plum → Calendar only. Per-task toggle. Events sync to the calendar of the user linked to the task's resource.

---

## Data Model

### `resources` table — new column

```sql
ALTER TABLE resources ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
```

Nullable. Links a person-type resource to their Plum user account. Set by auto-match or manual override on the settings page. Rooms and equipment resources leave this null.

### `tasks` table — new column

```sql
ALTER TABLE tasks ADD COLUMN calendar_sync_enabled boolean NOT NULL DEFAULT false;
```

Per-task opt-in. Only meaningful when the task's resource has a linked user with at least one calendar connected.

### New `calendar_events` table

```sql
CREATE TABLE calendar_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider   text NOT NULL CHECK (provider IN ('google_calendar', 'outlook')),
  event_id   text NOT NULL,
  sync_error boolean NOT NULL DEFAULT false,
  UNIQUE (task_id, provider)
);
```

One row per `(task, provider)`. A task whose resource's user has both Google and Outlook connected gets two rows. `ON DELETE CASCADE` on `task_id` means deleting a task automatically cleans up its calendar rows.

The existing `integration_tokens` table (already in schema) stores OAuth tokens per `(user_id, provider)` — no changes needed.

### RLS

`calendar_events`: users can read/write rows where `user_id = auth.uid()`. Service role used for sync writes inside server actions.

---

## OAuth & Token Flow

### Scopes

| Provider | Scope |
|----------|-------|
| Google | `https://www.googleapis.com/auth/calendar.events` |
| Microsoft | `Calendars.ReadWrite` |

Minimal scopes — create/update/delete events only. No access to the user's existing calendar data.

### Connect flow

1. User clicks "Connect Google Calendar" or "Connect Outlook" in `/{orgSlug}/settings`
2. Server action `initiateCalendarConnect(provider, orgSlug)` builds the OAuth authorization URL and returns it; client redirects
3. After user grants access, provider redirects to `/api/integrations/google/callback` or `/api/integrations/microsoft/callback`
4. Callback route exchanges auth code for tokens, upserts into `integration_tokens`:
   - `provider`: `'google_calendar'` or `'outlook'`
   - `user_id`: from session
   - `access_token`, `refresh_token`, `expires_at`
5. Auto-match runs (see Resource-User Linking)
6. Redirect to `/{orgSlug}/settings`

### Token refresh

Before every calendar API call, `lib/calendar/sync.ts` checks `expires_at`. If expired (or within 60 seconds of expiry), it calls the provider's token refresh endpoint, updates `integration_tokens`, and proceeds. Refresh failure → set `sync_error = true` on affected `calendar_events` rows, log error, do not throw.

### Disconnect flow

Server action `disconnectCalendar(provider)`:
1. Fetch all `calendar_events` rows for `(user_id, provider)`
2. For each row: call provider API to delete the calendar event (best-effort — ignore 404s)
3. Delete `calendar_events` rows for `(user_id, provider)`
4. Delete `integration_tokens` row for `(user_id, provider)`

---

## Resource-User Linking

### Auto-match

Runs immediately after OAuth callback, server-side:

1. Fetch all `person`-type resources for the org where `user_id IS NULL`
2. Compare user's display name and email against resource names — case-insensitive substring match (e.g. user "Alice Johnson" → resource "Alice")
3. Exactly one match → set `resources.user_id = user.id`
4. Zero or multiple matches → leave `user_id` null, surface prompt on settings page

### Settings UI

The integrations section of `/{orgSlug}/settings` shows per-user:

**Calendar connections:**
- "Google Calendar: connected ✓ [Disconnect]" or "[Connect Google Calendar]"
- "Outlook: connected ✓ [Disconnect]" or "[Connect Outlook]"

**Your resource:**
- "You are matched to: Alice [change]" — dropdown to override with any person-type resource in the org
- "No resource matched — select yours:" — dropdown picker if auto-match failed

**Admin view** (org owner/admin only): a table of all resources showing their linked user (if any), so admins can identify and fix mismatches across the team.

---

## Calendar Toggle UI

### Context menu on task blocks

Hovering a task block reveals a `⋮` button (top-right corner, alongside the existing violation badge). Right-clicking the block or clicking `⋮` opens a popover menu:

```
┌─────────────────────────┐
│ 📅 Add to calendar      │  ← calendar_sync_enabled = false
│ 📅 Remove from calendar │  ← calendar_sync_enabled = true (with ✓)
│ 🗑️  Delete              │
└─────────────────────────┘
```

**Availability rules:**
- "Add to calendar" is shown only when the task's resource has a linked user with at least one calendar provider connected
- If the resource has no linked user: option is greyed out with tooltip "Connect a calendar in Settings first"
- If the linked user has no calendar connected: same greyed-out treatment

**Sync error state:**
- If `calendar_events.sync_error = true` for any provider, the task block shows a `📅⚠` badge
- The context menu shows "Retry sync" instead of the normal add/remove toggle
- Clicking "Retry sync" calls `retryCalendarSync(taskId)` server action

### Toggle action

`toggleCalendarSync(taskId, enabled: boolean)` server action:
- Enabling: sets `tasks.calendar_sync_enabled = true`, then calls `syncTaskToCalendar(task, 'create')`
- Disabling: calls `syncTaskToCalendar(task, 'delete')`, then sets `tasks.calendar_sync_enabled = false` and deletes `calendar_events` rows

---

## Sync Logic

### `lib/calendar/sync.ts`

Core function called by all server actions that mutate tasks:

```ts
export async function syncTaskToCalendar(
  task: EngineTask,
  operation: 'create' | 'update' | 'delete'
): Promise<void>
```

1. If `!task.calendar_sync_enabled` → return (no-op)
2. Look up `resources.user_id` for `task.resource_id` — if null → return
3. Fetch all `integration_tokens` for that user (both providers)
4. For each connected provider:
   a. Refresh token if `expires_at < now + 60s`
   b. Look up `calendar_events` row for `(task.id, provider)`
   c. `create`: call provider API → upsert `calendar_events` with returned `event_id`, `sync_error = false`
   d. `update`: call provider API to patch existing event (title, dates) → update `sync_error = false`
   e. `delete`: call provider API to delete event → delete `calendar_events` row
5. On any API failure: set `calendar_events.sync_error = true`, `console.error` — **do not throw** (task mutation already succeeded)

### Event mapping

| Plum field | Calendar event field |
|---|---|
| `task.name` | Event title |
| `task.start_date` | Start (all-day date) |
| `task.end_date` | End (all-day date, exclusive +1 day for Google) |
| `task.duration_hours` working hrs | Description: "X working hours" |
| `task.type` | Description: "Fixed" or "Fluid" |

All events are **all-day** — no time-of-day component. Plum schedules in working hours, not clock hours.

### Hooks into `actions/schedule.ts`

| Action | Sync call |
|--------|-----------|
| `insertTask` | `syncTaskToCalendar(result.task, 'create')` after persist |
| `adjustTask` | `syncTaskToCalendar(result.task, 'update')` after persist |
| `deleteTask` | `syncTaskToCalendar(task, 'delete')` before DB delete (needs event_id lookup) |
| `reassignTask` | `syncTaskToCalendar(result.task, 'update')` after persist (resource may change) |

### `lib/calendar/google.ts`

Thin Google Calendar API client using `googleapis` npm package:

```ts
export async function createEvent(accessToken: string, event: CalendarEvent): Promise<string> // returns event ID
export async function updateEvent(accessToken: string, eventId: string, event: CalendarEvent): Promise<void>
export async function deleteEvent(accessToken: string, eventId: string): Promise<void>
```

### `lib/calendar/microsoft.ts`

Thin Microsoft Graph API client using `@microsoft/microsoft-graph-client`:

```ts
export async function createEvent(accessToken: string, event: CalendarEvent): Promise<string>
export async function updateEvent(accessToken: string, eventId: string, event: CalendarEvent): Promise<void>
export async function deleteEvent(accessToken: string, eventId: string): Promise<void>
```

Both clients share a `CalendarEvent` interface defined in `lib/calendar/types.ts`:

```ts
interface CalendarEvent {
  title: string
  startDate: string  // YYYY-MM-DD
  endDate: string    // YYYY-MM-DD (Google needs +1 day for all-day; clients handle this internally)
  description: string
}
```

---

## New Files

| File | Purpose |
|------|---------|
| `lib/calendar/types.ts` | `CalendarEvent` interface, shared types |
| `lib/calendar/google.ts` | Google Calendar API client |
| `lib/calendar/microsoft.ts` | Microsoft Graph API client |
| `lib/calendar/sync.ts` | `syncTaskToCalendar` — dispatch to providers |
| `actions/integrations.ts` | `initiateCalendarConnect`, `disconnectCalendar`, `matchResource`, `toggleCalendarSync`, `retryCalendarSync` |
| `app/api/integrations/google/callback/route.ts` | OAuth callback — exchange code, store tokens, auto-match |
| `app/api/integrations/microsoft/callback/route.ts` | OAuth callback — exchange code, store tokens, auto-match |
| `components/integrations/calendar-settings.tsx` | Connect/disconnect UI + resource picker |
| `components/timeline/task-context-menu.tsx` | ⋮ popover: add/remove calendar, delete, retry sync |
| `supabase/migrations/YYYYMMDD_calendar_sync.sql` | `resources.user_id`, `tasks.calendar_sync_enabled`, `calendar_events` table |

## Modified Files

| File | Change |
|------|--------|
| `actions/schedule.ts` | Add `syncTaskToCalendar` calls after insertTask, adjustTask, deleteTask, reassignTask |
| `app/(app)/[orgSlug]/settings/page.tsx` | Replace placeholder with real settings page including `CalendarSettings` component |
| `components/timeline/task-block.tsx` | Add hover `⋮` button, render `TaskContextMenu`, show `📅⚠` badge on sync error |

## Environment Variables

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
MICROSOFT_TENANT_ID=common   # multi-tenant
```

---

## Invariants

1. `syncTaskToCalendar` never throws — calendar failures are logged and stored as `sync_error`, never surfaced to the user as a blocking error
2. Token refresh always runs before any API call — never use an expired token
3. `deleteTask` fetches the `calendar_events` row *before* the DB delete — `ON DELETE CASCADE` would wipe the event ID before we can call the provider API
4. Only `person`-type resources are eligible for resource-user linking — rooms and equipment are excluded
5. The `⋮` menu only shows "Add to calendar" when the resource has a linked user with a connected calendar — no silent no-ops
6. Disconnect always attempts to delete provider-side events before removing DB rows — no orphaned calendar events
7. All-day event end dates: Google Calendar requires end date = last day + 1 (exclusive); Microsoft uses inclusive end date. Each client handles this difference internally — `CalendarEvent.endDate` is always the inclusive last day.

---

## Verification

```bash
# Unit tests
pnpm test __tests__/lib/calendar-sync.test.ts   # syncTaskToCalendar logic
pnpm test __tests__/lib/google-calendar.test.ts  # event mapping
pnpm test __tests__/lib/microsoft-calendar.test.ts

# Manual smoke test
1. Connect Google Calendar in /{slug}/settings
2. Confirm auto-match to your resource (or pick manually)
3. Create a fixed task → right-click → "Add to calendar"
4. Confirm event appears in Google Calendar
5. Adjust task dates → confirm calendar event updates
6. Delete task → confirm calendar event deleted
7. Connect Outlook → confirm same task syncs to both calendars
8. Disconnect Google → confirm Google events deleted, Outlook events remain
9. Task with no linked resource → "Add to calendar" greyed out
10. Simulate API failure → confirm 📅⚠ badge + "Retry sync" in context menu
```
