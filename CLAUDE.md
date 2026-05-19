# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Plum Planner is a real-time team scheduling SaaS for agencies and small teams (5–20 people). It sits between a full project management suite (too heavy) and a to-do list (too light). The core idea: each resource (person/room) has a timeline of Fixed tasks (anchored in time) and Fluid tasks (a prioritized stack that flows around Fixed tasks automatically).

Full spec: `docs/superpowers/plans/2026-05-18-01-foundation.md` (Plan 1: Foundation)
Product spec: `/Users/maxdennis/.claude/plans/whimsical-drifting-quiche.md`
Plan 3 (Timeline UI) spec: `/Users/maxdennis/.claude/plans/greedy-brewing-shamir.md`

## Status

**Plans 1 (Foundation), 2 (Scheduling Engine), and 3 (Timeline UI) are complete.** App is scaffolded, database schema + RLS are applied, scheduling engine is fully tested, and the interactive timeline grid (drag, resize, realtime, optimistic updates, add-task/add-resource dialogs) is implemented. Plan 4 (Real-time + Views) is next.

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
- `actions/schedule.ts` — includes `reorderFluidTask` added in Plan 3.

### Real-time Collaboration

Server Actions are the single source of truth — they run the engine, persist the result, then broadcast. Clients never push raw task mutations directly to Supabase.

- `org:{org_id}:schedule` — schedule delta broadcasts after each server action
- `org:{org_id}:presence` — cursor positions (broadcast every 200ms while active)
- Clients apply optimistic updates immediately, reconcile on server broadcast. Rejection → shake animation + revert.

### Data Model Key Points

- `tasks.duration_hours` — working hours, not calendar time. `end_date` is derived and stored for query perf.
- `tasks.position` — integer sort order for fluid tasks within a resource. Recomputed by engine on every mutation.
- `tasks.task_group_id` + `tasks.segment_index` — link split task segments. Compress can re-merge adjacent segments.
- `tasks.constraints` — JSONB array of `{ type, value? }`. Violations are soft (highlighted, not blocked).
- `orgs.plan_tier` — `starter` (≤5), `team` (≤15), `agency` (≤25). Checked in `actions/orgs.ts` on invite.
- All tables use RLS. Helper functions: `is_org_member(org_id)` and `is_org_admin(org_id)`.

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
| 4: Real-time + Views | *(not yet written)* | After Plan 3 |
| 5: AI + Billing | *(not yet written)* | After Plan 4 |
| 6: Integrations | *(not yet written)* | After Plan 5 |
| 7: Design/UI Rebuild | *(not yet written)* | After Plan 6 |

When starting a plan, use the `superpowers:executing-plans` or `superpowers:subagent-driven-development` skill.
