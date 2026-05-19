# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Plum Planner is a real-time team scheduling SaaS for agencies and small teams (5–20 people). It sits between a full project management suite (too heavy) and a to-do list (too light). The core idea: each resource (person/room) has a timeline of Fixed tasks (anchored in time) and Fluid tasks (a prioritized stack that flows around Fixed tasks automatically).

Full spec: `docs/superpowers/plans/2026-05-18-01-foundation.md` (Plan 1: Foundation)
Product spec: `/Users/maxdennis/.claude/plans/whimsical-drifting-quiche.md`
Plan 3 (Timeline UI) spec: `/Users/maxdennis/.claude/plans/greedy-brewing-shamir.md`
Plan 4 (Real-time + Views) spec: `docs/superpowers/plans/2026-05-19-04-realtime-views.md`

## Status

**Plans 1–4 are complete.** App is scaffolded, database schema + RLS are applied, scheduling engine is fully tested, interactive timeline grid is implemented, and the Resources kanban view, Capacity heatmap view, and Who's Online presence panel are live. Plan 5 (AI + Billing) is next.

## Commands

```bash
# From /Users/maxdennis/Desktop/plumplanner
pnpm dev          # dev server with Turbopack
pnpm build        # production build
pnpm test         # Vitest unit tests (lib/engine/ is the critical path)
pnpm test:watch   # Vitest watch mode
pnpm test:e2e     # Playwright E2E tests
pnpm lint         # ESLint

# Run a single unit test file
pnpm test __tests__/engine/scheduler.test.ts

# Run a single E2E test
pnpm test:e2e e2e/auth.spec.ts

# Supabase
pnpm exec supabase db push        # apply migrations
pnpm exec supabase gen types typescript --linked > lib/types/database.ts
```

## Stack

- **Next.js 16** App Router, TypeScript, `pnpm`
- **Supabase** — Postgres + Auth + Realtime
- **Tailwind CSS** + **shadcn/ui** + **Framer Motion**
- **Zustand** for client UI state (timeline viewport, selection, drag)
- **Claude API** — `claude-haiku-4-5-20251001` for NL quick-add, `claude-sonnet-4-6` for status reports
- **Stripe** — flat-tier subscriptions
- **Vercel** — hosting + Cron

## Architecture

### Route Groups

```
app/
  (marketing)/   # public landing + pricing — no auth required
  (auth)/        # sign-in, sign-up
  (app)/         # authenticated shell → redirects to /{orgSlug}/timeline
    [orgSlug]/   # org-scoped routes
      timeline/  # PRIMARY VIEW
      resources/ # per-resource stack view
      capacity/  # team utilisation heatmap
      settings/  # org settings, integrations, billing
```

Middleware (`middleware.ts`) enforces auth on all `/(app)/` routes and validates org membership on `/{orgSlug}/` routes before the request reaches the page.

### Scheduling Engine (`lib/engine/`)

The heart of the app. Pure TypeScript — no database calls. Server Actions call it, persist the result, then broadcast via Supabase Realtime.

Key files:
- `lib/engine/working-week.ts` — converts `duration_hours` ↔ calendar dates using a resource's working week. Duration is **always stored in working hours**, never calendar days.
- `lib/engine/scheduler.ts` — `insertTask`, `deleteTask`, `adjustTask`
- `lib/engine/compress.ts` — `compress` fills gaps by pulling fluid tasks forward from a date
- `lib/engine/constraints.ts` — `validateConstraints` returns soft violations

**Invariants to never break:**
1. Fluid tasks can never overlap Fixed tasks (engine enforces this)
2. Fixed tasks are never moved by the engine — only by explicit user action
3. Inserting onto an in-progress fluid task splits it (segments share `task_group_id`)
4. A task with `no_split` constraint falls back to push (not split) on interruption
5. `position` is only set on fluid tasks; Fixed tasks have `position = null`

### Timeline UI (`components/timeline/`)

The primary view. DOM-based renderer (not Canvas) with Zustand v5 for client state.

Key files:
- `lib/timeline-utils.ts` — UTC date↔pixel math (`dateToPixel`, `pixelToDate`, `taskWidthPx`, `formatAxisDate`, `startOfCurrentWeekUTC`). All math uses UTC — never local-time getDay/getDate/getMonth.
- `lib/store/timeline.ts` — Zustand v5 vanilla store via `createStore` (not `create`). One instance per component tree via `useMemo`, provided via `TimelineStoreContext`. Fine-grained selectors only — never `s => s`.
- `components/timeline/timeline-view.tsx` — Client root; mounts store + Realtime subscription. Optimistic sync guard: skips `setAllTasks` if `preOptimisticTasks !== null`.
- `components/timeline/timeline-grid.tsx` — Scrollable grid with sticky date axis and today line.
- `components/timeline/task-block.tsx` — Drag (Framer Motion, fluid only) + resize (raw pointer events on document). `inflightRef` prevents concurrent drags; `isInteractingRef` prevents drag/resize race.
- `components/timeline/add-task-dialog.tsx` — Create task form (name, resource, type, duration, start date for fixed, project).
- `components/timeline/create-resource-dialog.tsx` — Create resource form (name + icon type).
- `actions/resources.ts` — `createResource` server action.
- `actions/schedule.ts` — includes `reorderFluidTask` (Plan 3) and `reassignTask` (Plan 4).

### Real-time Collaboration

Server Actions are the single source of truth — they run the engine, persist the result, then broadcast. Clients never push raw task mutations directly to Supabase.

- `org:{org_id}:schedule` — schedule delta broadcasts after each server action
- `org:{org_id}:presence` — who's online + current page (Supabase presence API via `hooks/use-presence.ts`; mounted in `SidebarNav`)
- Clients apply optimistic updates immediately, reconcile on server broadcast. Rejection → shake animation + revert.

### Data Model Key Points

- `tasks.duration_hours` — working hours, not calendar time. `end_date` is derived and stored for query perf.
- `tasks.position` — integer sort order for fluid tasks within a resource. Recomputed by engine on every mutation.
- `tasks.task_group_id` + `tasks.segment_index` — link split task segments. Compress can re-merge adjacent segments.
- `tasks.constraints` — JSONB array of `{ type, value? }`. Violations are soft (highlighted, not blocked).
- `orgs.plan_tier` — `starter` (≤5), `team` (≤15), `agency` (≤25). Checked in `actions/orgs.ts` on invite.
- All tables use RLS. Helper functions: `is_org_member(org_id)` and `is_org_admin(org_id)`.

### Resources View (`components/resources/`)

Kanban view at `/{orgSlug}/resources`. One column per resource; fluid tasks are draggable within and between columns.

Key files:
- `lib/store/resources.ts` — Zustand v5 store (same `createStore` pattern as timeline). State: `tasks`, `draggingTaskId`, `draggingFromResourceId`, `preOptimisticTasks`. `beginOptimistic()` takes no args (snapshots all tasks).
- `components/resources/resources-view.tsx` — Client root; mounts store, guards `setAllTasks` behind optimistic lock.
- `components/resources/resource-column.tsx` — One column per resource; `data-resource-id` attribute used for drop detection.
- `components/resources/resource-task-card.tsx` — Framer Motion drag; `findDrop` queries `[data-resource-id]` DOM elements. Same-column reorder → `reorderFluidTask`; cross-column → `reassignTask`. Fine-grained store selectors only.
- `actions/schedule.ts#reassignTask` — Atomically moves a fluid task between resources. Guards: auth, org membership, fluid-only, same-resource no-op, split-task blocked, cross-org blocked. Sequential persist (source first, then target).

### Capacity View (`components/capacity/`)

Heatmap view at `/{orgSlug}/capacity?week=YYYY-WNN`. All math is server-rendered; client only handles week navigation.

Key files:
- `lib/capacity-utils.ts` — Pure utils: `taskDayContributionHours` (pro-rata per calendar day), `computeWeekCells`, `computeKPIs`, `parseWeekParam`/`formatWeekParam` (ISO 8601 week, year-boundary safe). All UTC.
- `app/(app)/[orgSlug]/capacity/page.tsx` — Server component; fetches overlapping tasks, computes cells + KPIs, passes to children.
- `components/capacity/capacity-view.tsx` — Client wrapper; prev/next week nav via `router.push`. Accepts `weekStart` as `Date | string` (RSC serializes Date → string).
- `components/capacity/kpi-cards.tsx` + `capacity-heatmap.tsx` — Pure presentational; no client state.

### Presence (`hooks/use-presence.ts`)

- Supabase Realtime presence API on channel `org:{orgId}:presence`.
- `usePresence(orgId, userId, userName)` — Two effects: first subscribes (cleans up on unmount), second re-tracks current page on `pathname` change without re-subscribing.
- `userColor(userId)` — deterministic hash → 6-color palette. Same color every session.
- Mounted in `SidebarNav` (already `'use client'`); `WhoIsOnline` panel renders between nav links and sign-out.
- Layout (`app/(app)/[orgSlug]/layout.tsx`) fetches org + user in parallel and passes `orgId`, `userId`, `userName` to `SidebarNav`.

### AI Features

Two features only — no others:

1. **NL quick-add** (`lib/ai/quick-add.ts`) — Haiku parses natural language from `⌘K` into task creation params. Pre-fills the form; user confirms. Never creates tasks unilaterally.
2. **Status report** (`lib/ai/status-report.ts`) — Sonnet generates a structured team status summary on demand. Cache the long system prompt with `cache_control: { type: 'ephemeral' }`. Stream the response.

### Pricing / Billing

No free trial. Stripe flat tiers: Starter $99/mo, Team $249/mo, Agency $499/mo. Member count enforcement is in `actions/orgs.ts#inviteMember` (not middleware — avoids a DB count on every request). Stripe webhooks update `orgs.plan_tier` on subscription changes.

## Implementation Plans

Plans are in `docs/superpowers/plans/`. Work through them in order:

| Plan | File | Status |
|------|------|--------|
| 1: Foundation | `2026-05-18-01-foundation.md` | ✅ Complete |
| 2: Scheduling Engine | `2026-05-18-02-scheduling-engine.md` | ✅ Complete |
| 3: Timeline UI | `/Users/maxdennis/.claude/plans/greedy-brewing-shamir.md` | ✅ Complete |
| 4: Real-time + Views | `2026-05-19-04-realtime-views.md` | ✅ Complete |
| 5: AI + Billing | *(not yet written)* | After Plan 4 |
| 6: Integrations | *(not yet written)* | After Plan 5 |
| 7: Design/UI Rebuild | *(not yet written)* | After Plan 6 |

When starting a plan, use the `superpowers:executing-plans` or `superpowers:subagent-driven-development` skill.
