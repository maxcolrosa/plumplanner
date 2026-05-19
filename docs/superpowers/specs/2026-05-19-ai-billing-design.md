# Plan 5: AI + Billing — Design Spec

**Date:** 2026-05-19  
**Status:** Approved

---

## Overview

Plan 5 adds two independent systems to Plum Planner in sequence:

1. **Billing** — Stripe-based subscription gate. No free trial. New orgs are redirected to checkout before accessing the app. Stripe Customer Portal handles all subscription management.
2. **AI** — Two features: NL quick-add via ⌘K (Haiku parses natural language into task params, pre-fills the existing form) and a streaming status report drawer (Sonnet generates a team summary on demand).

Build order: billing first (prerequisite for launch), then AI.

---

## Part 1: Billing

### Subscription Gate

`app/(app)/[orgSlug]/layout.tsx` already fetches the org row on every request. After fetching, check `stripe_subscription_id`. If null → redirect to `/{orgSlug}/subscribe`. This catches both new orgs (never subscribed) and lapsed subscriptions (webhook cleared the ID).

The middleware is not used for this check — middleware runs at the edge and can't do DB queries efficiently. The layout server component handles it.

**Redirect loop guard:** The layout must skip the subscription redirect when the current path is already `/{orgSlug}/subscribe`. Check `(await headers()).get('x-pathname')` or pass the `pathname` via a search param — the cleanest approach is to read the incoming URL from Next.js `headers()`: `const url = new URL((await headers()).get('x-url') ?? '/')` and skip redirect if `url.pathname.endsWith('/subscribe')`.

### Subscribe Page

Route: `app/(app)/[orgSlug]/subscribe/page.tsx` (server component — no auth redirect loop because middleware allows it).

Shows the three plan cards matching the marketing pricing page:

| Plan | Price | Members |
|------|-------|---------|
| Starter | $99/mo | Up to 5 |
| Team | $249/mo | Up to 15 |
| Agency | $499/mo | Up to 25 |

Each card has a "Subscribe" button. On click, a server action `createCheckoutSession(orgId, priceId)` is called. It creates a Stripe Checkout Session with:
- `mode: 'subscription'`
- `success_url: /{orgSlug}/timeline`
- `cancel_url: /{orgSlug}/subscribe`
- `client_reference_id: orgId` (used by webhook to identify the org)
- `customer_email` pre-filled from the authenticated user

Returns the Checkout URL; client redirects immediately.

### Webhook Handler

Route: `app/api/stripe/webhook/route.ts` (POST, no auth — verified by Stripe signature).

Verification: `stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)` — return 400 on failure.

Handles three events:

**`checkout.session.completed`**
- Extract `client_reference_id` (= orgId) and `customer` + `subscription` IDs
- Update `orgs` row: `stripe_customer_id`, `stripe_subscription_id`
- Determine `plan_tier` from `subscription.items.data[0].price.id` (map price ID → tier)

**`customer.subscription.updated`**
- Look up org by `stripe_customer_id`
- Re-map `price.id` → `plan_tier` and update `orgs.plan_tier`

**`customer.subscription.deleted`**
- Look up org by `stripe_customer_id`
- Clear `stripe_subscription_id` (set to null), reset `plan_tier = 'starter'`
- Next layout render will redirect the org's users to `/{slug}/subscribe`

Use `SUPABASE_SERVICE_ROLE_KEY` for webhook DB writes (no user session available in webhook context).

### Billing Management

`SidebarNav` gains a "Manage billing" link (below the nav links, above sign-out). On click → server action `createPortalSession(orgId)` → Stripe Customer Portal URL → `window.location.href` redirect.

`createPortalSession` must guard against a missing `stripe_customer_id` — if null, return `{ error: 'No billing account found. Please contact support.' }` and show a toast rather than throwing.

The Stripe Customer Portal handles: plan upgrades/downgrades, payment method changes, invoice history, cancellation. No custom UI needed.

### New Files

| File | Purpose |
|------|---------|
| `lib/stripe.ts` | Stripe client singleton (`new Stripe(STRIPE_SECRET_KEY)`) |
| `actions/billing.ts` | `createCheckoutSession`, `createPortalSession` server actions |
| `app/api/stripe/webhook/route.ts` | Webhook POST handler |
| `app/(app)/[orgSlug]/subscribe/page.tsx` | Plan selection page |

### Modified Files

| File | Change |
|------|--------|
| `app/(app)/[orgSlug]/layout.tsx` | Add subscription check + redirect |
| `components/sidebar-nav.tsx` | Add "Manage billing" link |

### Environment Variables

```
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_STARTER=price_...
STRIPE_PRICE_ID_TEAM=price_...
STRIPE_PRICE_ID_AGENCY=price_...
```

### Price ID → Plan Tier Map

Defined in `lib/stripe.ts` as a constant:

```ts
export const PRICE_TIER_MAP: Record<string, 'starter' | 'team' | 'agency'> = {
  [process.env.STRIPE_PRICE_ID_STARTER!]: 'starter',
  [process.env.STRIPE_PRICE_ID_TEAM!]: 'team',
  [process.env.STRIPE_PRICE_ID_AGENCY!]: 'agency',
}
```

---

## Part 2: AI Features

### 2a. NL Quick-Add (⌘K)

#### Architecture

A `QuickAddProvider` client component wraps children in `app/(app)/[orgSlug]/layout.tsx`. It:
- Attaches a `keydown` listener on `document` for `metaKey + k` (Mac) / `ctrlKey + k` (Windows)
- Manages `open: boolean` state for the `QuickAddDialog`
- Receives `orgId` and `orgSlug` as props from the layout (both already fetched)

The `parseQuickAdd` server action handles resource fetching internally — no need to pass resources through the provider. The layout has no extra DB queries.

This ensures ⌘K works on every page in the org shell.

#### Dialog Flow

`components/ai/quick-add-dialog.tsx` — a `CommandDialog` wrapping a single `<input>`:

1. User types: `"3h design review for Alice next Monday"`
2. On submit (Enter) → shows a loading spinner, calls the `parseQuickAdd(text, orgId)` server action from `actions/ai.ts`
3. If parsing succeeds → navigate to `/{slug}/timeline?qa_name=Design+review&qa_resource=alice-id&qa_duration=3&qa_type=fluid` and close dialog
4. If parsing fails → show inline error `"Couldn't understand that — try: '2h meeting for Alice tomorrow'"` and let user retry or dismiss

The server action (not the client component) calls `lib/ai/quick-add.ts` — this keeps `ANTHROPIC_API_KEY` server-side only. The action fetches the org's resources internally (by `orgId`) so the client doesn't need to pass them.

#### `actions/ai.ts` — `parseQuickAdd` server action

Server action: `parseQuickAdd(text: string, orgId: string): Promise<ParsedTask | { error: string }>`.

1. Verify user is authenticated + org member
2. Fetch `resources` for `orgId` (id + name)
3. Call `lib/ai/quick-add.ts` with text + resources + today's date
4. Return result

#### `lib/ai/quick-add.ts`

Pure function called only from `actions/ai.ts` — never imported by client code.

Calls `claude-haiku-4-5-20251001` via `@anthropic-ai/sdk`.

System prompt (cached with `cache_control: { type: 'ephemeral' }`):
```
You are a scheduling assistant. Parse the user's task description into JSON.
Available resources: {resources as JSON}
Today's date: {today as YYYY-MM-DD}
Return ONLY valid JSON matching this shape:
{ "name": string, "resource_id": string, "duration_hours": number, "type": "fluid" | "fixed", "start_date": "YYYY-MM-DD" | null }
start_date is required only when type is "fixed".
If you cannot parse the input, return { "error": "reason" }.
```

Returns `ParsedTask | { error: string }`. No fallback to the form — error shown inline in the dialog.

#### Timeline Prefill

`components/timeline/timeline-toolbar.tsx` adds a `useEffect` that reads `useSearchParams()`. When `qa_name` is present:
1. Reads all `qa_*` params and constructs a `PrefillData` object
2. Calls the existing `openAddTaskDialog(prefill)` (extend the dialog to accept initial values)
3. Replaces URL without the `qa_*` params via `router.replace` (clean up)

The add-task dialog (`components/timeline/add-task-dialog.tsx`) accepts an optional `initialValues?: Partial<TaskFormState>` prop and seeds form state from it.

#### New Files

| File | Purpose |
|------|---------|
| `lib/ai/quick-add.ts` | Haiku call + response parsing (server-only) |
| `actions/ai.ts` | `parseQuickAdd` server action (auth guard + calls lib) |
| `components/ai/quick-add-dialog.tsx` | ⌘K CommandDialog UI |
| `components/ai/quick-add-provider.tsx` | Global keyboard listener + dialog mount |

#### Modified Files

| File | Change |
|------|--------|
| `app/(app)/[orgSlug]/layout.tsx` | Wrap children with `QuickAddProvider`, pass `orgId` prop |
| `components/timeline/timeline-toolbar.tsx` | Read `qa_*` search params, auto-open dialog |
| `components/timeline/add-task-dialog.tsx` | Accept `initialValues` prop |

---

### 2b. Status Report Drawer

#### Entry Point

`SidebarNav` gains a "Status Report" button (in the nav links section, with a `FileText` icon). Clicking it sets `reportOpen: boolean` state (local `useState` in `SidebarNav`) and renders `<StatusReportDrawer open={reportOpen} onClose={() => setReportOpen(false)} orgId={orgId} />`.

#### `components/ai/status-report-drawer.tsx`

A shadcn `Sheet` opening from the right (`side="right"`, `className="w-[480px]"`).

States:
- **Idle** — "Generate report" button centered in the sheet
- **Loading** — spinner + streaming text appears as chunks arrive
- **Done** — full report text, "Regenerate" button at bottom
- **Error** — error message + "Try again" button

On "Generate report" click:
1. Sets `loading = true`, clears previous text
2. `fetch('/api/ai/status-report', { method: 'POST', body: JSON.stringify({ orgId }) })`
3. Reads `response.body` as a `ReadableStream<Uint8Array>`, decodes with `TextDecoder`
4. Appends each chunk to `reportText` state → text appears progressively
5. On stream end → `loading = false`
6. On error → show error state

Report text renders in a `<div className="whitespace-pre-wrap text-sm font-mono">` — no markdown library needed.

#### `app/api/ai/status-report/route.ts`

POST route handler. No `'use client'`.

1. Authenticate request: verify user session via Supabase server client
2. Verify org membership: `is_org_member(orgId)` 
3. Fetch all tasks for org from `tasks` table (all columns)
4. Group tasks by resource, build a compact JSON summary
5. Call `lib/ai/status-report.ts` to get the Anthropic stream
6. Return `new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })`

If no tasks exist → return a static `"No tasks scheduled yet."` response without calling the API.

#### `lib/ai/status-report.ts`

Calls `claude-sonnet-4-6` via `@anthropic-ai/sdk` with streaming.

System prompt (long, cached with `cache_control: { type: 'ephemeral' }`):
```
You are a project management assistant for a team scheduling app called Plum Planner.
Generate a concise status report in plain text with these sections:
## Overview
## Per-Resource Summary  
## Risks
## Recommendations

Be specific and actionable. Use bullet points within sections. Keep the total under 400 words.
```

User prompt: JSON of tasks grouped by resource name (not IDs — resolve names server-side).

Returns an `AsyncIterable<string>` of text chunks. The route handler pipes this to the response stream.

#### New Files

| File | Purpose |
|------|---------|
| `lib/ai/status-report.ts` | Sonnet streaming call |
| `app/api/ai/status-report/route.ts` | POST route, auth + fetch + stream |
| `components/ai/status-report-drawer.tsx` | Sheet UI with streaming text |

#### Modified Files

| File | Change |
|------|--------|
| `components/sidebar-nav.tsx` | Add Status Report button |

#### Environment Variables

```
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Invariants

1. Webhook handler always verifies Stripe signature before processing — return 400 on failure
2. `createCheckoutSession` and `createPortalSession` always verify org membership before calling Stripe
3. Quick-add never creates tasks unilaterally — always pre-fills the form for user confirmation
4. Status report never reveals task data from other orgs — route handler always filters by `org_id` with membership check
5. Haiku system prompt is always prompt-cached — never re-sent as a non-cached block
6. Sonnet system prompt is always prompt-cached — never re-sent as a non-cached block
7. Stripe webhook DB writes use `SUPABASE_SERVICE_ROLE_KEY` — not the user session client
8. The subscribe page (`/{slug}/subscribe`) must NOT be caught by the subscription gate redirect — otherwise new orgs get redirect-looped

---

## Verification

### Billing

```bash
# Stripe CLI for local webhook testing
stripe listen --forward-to localhost:3000/api/stripe/webhook

# Test checkout flow
1. Create a new org
2. Confirm redirect to /{slug}/subscribe
3. Click "Subscribe" on Starter plan
4. Complete Stripe test checkout (card: 4242 4242 4242 4242)
5. Confirm redirect back to /{slug}/timeline
6. Check orgs table: stripe_subscription_id populated, plan_tier = 'starter'
7. Click "Manage billing" in sidebar → Stripe portal opens

# Test lapse
stripe subscriptions cancel <sub_id>
# Confirm next page load redirects to /{slug}/subscribe
```

### AI Quick-Add

```bash
1. Press ⌘K from any page
2. Type "2h standup for Alice tomorrow"
3. Confirm dialog shows loading, then navigates to timeline
4. Confirm add-task dialog opens pre-filled
5. Submit → task appears on timeline
6. Type gibberish → confirm error message appears, no navigation
```

### Status Report

```bash
1. Click "Status Report" in sidebar
2. Click "Generate report"
3. Confirm text streams in progressively
4. Confirm report has Overview / Per-Resource / Risks / Recommendations sections
5. Test with no tasks → confirm "No tasks scheduled yet." appears without API call
```
