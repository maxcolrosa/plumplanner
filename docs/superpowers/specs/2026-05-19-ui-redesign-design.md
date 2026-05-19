# Plum Planner — Design/UI Rebuild Spec

## Goal

Rebuild the full authenticated app shell (timeline, resources, capacity, settings) and auth pages (sign in, sign up) to top-tier SaaS quality: calm, professional, restrained, polished. Equal priority for light and dark modes. Marketing page is out of scope.

---

## Design Decisions

All decisions locked through visual brainstorming.

| Decision | Choice |
|---|---|
| Direction | Warm & Branded — plum purple as real brand identity |
| Mode support | Both light and dark, equal design priority |
| Typography | Plus Jakarta Sans (all weights) |
| Border radius | 9px everywhere (6px task blocks/badges, 12px modals/cards) |
| Density | Compact — 26px task rows, tight gaps |
| Sidebar | Collapsible — full labels default, icon rail on toggle |
| Polish philosophy | Depth through restraint — no glow, no blur, no glass |

---

## 1. Design Token System

### Color Tokens

All values are hex, mapped to CSS custom properties. Tailwind consumes these via `@theme inline`.

**Light mode (`:root`)**

| Token | Value | Usage |
|---|---|---|
| `--background` | `#FAFAF9` | Page background |
| `--surface` | `#FFFFFF` | Cards, dialogs, inputs |
| `--surface-raised` | `#F4F1FA` | Hover states, sidebar bg tint |
| `--border` | `#EEE9F8` | Default borders |
| `--border-strong` | `#D4C8F0` | Input borders, dividers |
| `--text-primary` | `#18181b` | Body text, headings |
| `--text-secondary` | `#52525b` | Labels, descriptions |
| `--text-muted` | `#a1a1aa` | Placeholders, disabled |
| `--accent` | `#7434DB` | Active nav, links, focus ring |
| `--accent-subtle` | `#EEE9F8` | Active nav bg, badge bg |
| `--cta` | `#6530BA` | Primary button bg |
| `--task-fixed` | `#7434DB` | Fixed task text |
| `--task-fixed-border` | `#A379E7` | Fixed task border |
| `--task-fluid` | `#10b981` | Fluid task text |
| `--task-fluid-border` | `#34d399` | Fluid task border |
| `--today` | `#7434DB` | Today line + axis highlight |
| `--sidebar-bg` | `#F0EBF8` | Sidebar (one step darker than background) |

**Dark mode (`.dark`)**

| Token | Value | Usage |
|---|---|---|
| `--background` | `#0f0f10` | Page background |
| `--surface` | `#111113` | Cards, dialogs, inputs |
| `--surface-raised` | `#18181b` | Hover states |
| `--border` | `#1f1f23` | Default borders |
| `--border-strong` | `#27272a` | Input borders, dividers |
| `--text-primary` | `#f4f4f5` | Body text, headings |
| `--text-secondary` | `#71717a` | Labels, descriptions |
| `--text-muted` | `#3f3f46` | Placeholders, disabled |
| `--accent` | `#9070CC` | Active nav, links, focus ring |
| `--accent-subtle` | `rgba(144,112,204,.12)` | Active nav bg, badge bg |
| `--cta` | `#6530BA` | Primary button bg (same both modes) |
| `--task-fixed` | `rgba(101,48,186,.18)` | Fixed task bg (dark uses rgba) |
| `--task-fixed-border` | `rgba(144,112,204,.28)` | Fixed task border |
| `--task-fluid` | `rgba(52,211,153,.10)` | Fluid task bg |
| `--task-fluid-border` | `rgba(52,211,153,.22)` | Fluid task border |
| `--today` | `#9070CC` | Today line + axis highlight |
| `--sidebar-bg` | `#0d0d0f` | Sidebar (one step darker than background) |

### Typography Scale

Font: **Plus Jakarta Sans** — replace Geist Sans entirely. Load via `next/font/google`.

| Token | Size | Weight | Usage |
|---|---|---|---|
| `text-xs` | 10px | 400 | Axis dates, badge labels, captions |
| `text-sm` | 12px | 500 | Body, task text, descriptions |
| `text-base` | 13px | 500–600 | Nav items, toolbar labels, form labels |
| `text-lg` | 16px | 600 | Dialog titles, section headers |
| `text-xl` | 20px | 700 | Page titles |

### Spacing & Radius

```
--radius:     9px    (buttons, inputs, nav items, dropdowns)
--radius-sm:  6px    (task blocks, badges, chips)
--radius-lg:  12px   (modals, cards, shell container)

Task row height: 26px (compact density)
Sidebar expanded: 224px
Sidebar collapsed: 52px
Resource name col: 192px (w-48)
```

### Shadow

One shadow per mode. Applied to the app shell container, dialogs, and elevated cards.

```css
/* Light */
box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.05);

/* Dark */
box-shadow: 0 2px 8px rgba(0,0,0,.35), 0 1px 2px rgba(0,0,0,.20);
```

No glow, no blur, no frosted glass, no gradient backgrounds.

---

## 2. Component Patterns

### Buttons

**Primary (CTA)**
```
bg-[--cta] text-white rounded-[--radius] px-3 py-1.5 text-[13px] font-semibold
box-shadow: inset 0 1px 0 rgba(255,255,255,.10)
hover: brightness-110 — 150ms ease
```

**Ghost**
```
bg-transparent border border-[--border-strong] text-[--text-secondary]
rounded-[--radius] px-3 py-1.5 text-[13px] font-medium
hover: bg-[--surface-raised] — 150ms ease
```

**Destructive**
```
bg-transparent text-red-500 border border-red-500/30 rounded-[--radius]
hover: bg-red-500/10 — 150ms ease
```

### Inputs / Selects

```
bg-[--surface] border border-[--border-strong] rounded-[--radius]
text-[--text-primary] placeholder:text-[--text-muted]
px-2.5 py-1.5 text-[13px] font-sans
focus: outline-none ring-1 ring-[--accent] border-[--accent] — 150ms ease
```

### Task Blocks (26px, compact)

**Fixed**
```
bg-[--task-fixed]/20 border border-[--task-fixed-border]
text-[--task-fixed] rounded-[--radius-sm] h-[26px] px-2
text-[10px] font-medium overflow-hidden text-ellipsis whitespace-nowrap
Lock icon (10px) right of label text
```

**Fluid**
```
bg-[--task-fluid]/20 border border-[--task-fluid-border]
text-[--task-fluid] rounded-[--radius-sm] h-[26px] px-2
text-[10px] font-medium cursor-grab
Resize handle: 6px strip on right edge, cursor-col-resize
```

**Continuation segment** (`segment_index > 0`)
```
border-l-2 border-l-dashed border-l-[--task-fluid-border]
```

**Violation badge**
```
absolute top-0.5 right-0.5 text-[10px] text-amber-400 — ⚠ character
```

### Sidebar Nav Item

```
Default:  text-[--text-muted] py-1.5 px-2.5 rounded-[--radius-sm]
          text-[13px] font-medium flex items-center gap-2.5
          transition-colors duration-150

Hover:    bg-[--surface-raised] text-[--text-secondary]

Active:   bg-[--accent-subtle] text-[--accent] font-semibold
          border-l-2 border-[--accent] pl-[calc(0.625rem_-_2px)]
```

### Dialogs / Modals

```
bg-[--surface] border border-[--border] rounded-[--radius-lg]
dark: box-shadow: 0 8px 32px rgba(0,0,0,.4)
Header: border-b border-[--border] px-4 py-3 text-[16px] font-semibold
Footer: border-t border-[--border] px-4 py-3 flex justify-end gap-2
```

Animate: `opacity 0→1 + translateY 8px→0` over 150ms ease-out on open. `opacity 1→0` over 100ms ease-in on close.

### Badges / Chips

```
Fixed badge:     bg-[--accent-subtle] text-[--accent]
                 rounded-[--radius-sm] px-1.5 py-0.5
                 text-[10px] font-bold uppercase tracking-wide

Fluid badge:     bg-emerald-500/10 text-emerald-400 — same sizing

Violation:       bg-amber-500/10 text-amber-400 text-[10px]
```

---

## 3. View-by-View Treatment

### App Shell

Sidebar is one step darker than main background in both modes (`--sidebar-bg`).

```
Layout: flex flex-row h-screen overflow-hidden
  Sidebar (224px expanded / 52px collapsed) — flex-shrink-0
  Main area (flex-1) — flex flex-col overflow-hidden
    [Toolbar — border-b]
    [Content — flex-1 overflow-auto]
```

### Sidebar

```
Header row: [◆ logo dot] [Plum / org name] [‹ collapse toggle]
  border-b border-[--border], h-14, px-4
  Logo dot: w-6 h-6 rounded-[6px] bg-[--cta]
  Toggle: ghost icon button, 200ms collapse animation

Nav section: flex-1, p-2, space-y-0.5
  NavItem × 4 (Timeline, Resources, Capacity, Settings)
  Status Report button (same style)

Bottom section: border-t border-[--border]
  ⌘K Quick Add — text-[--text-muted] text-[11px] px-3 py-1.5
  WhoIsOnline panel
  Manage billing / Sign out
```

**Collapsed state (52px)**
- Icons only, no text labels
- Logo dot remains
- Tooltips on hover (native `title` attribute)
- Collapse toggle becomes expand toggle

**Collapse animation:** `width: 224px → 52px` over 200ms `cubic-bezier(0.4, 0, 0.2, 1)`. Labels fade `opacity 1→0` over the first 100ms.

### Timeline

- Toolbar: three groups separated by `flex-1` spacers
  - Left: `← Today →` ghost nav
  - Center: zoom pills `Day | Week | Month` — active pill `bg-[--surface-raised] text-[--text-primary]`
  - Right: `+ Add Resource` (ghost) · `+ Add Task` (primary)
- Date axis: sticky `top-0 z-10 bg-[--background]`, border-b, h-10
  - Today column: `text-[--today] font-semibold bg-[--accent-subtle]/40`
- Today line: `1px bg-[--today] opacity-30 pointer-events-none`
- Resource name column: `w-48 sticky left-0 z-20 bg-[--background]` border-r
- Grid rows: `border-b border-[--border] h-16` (row), task blocks positioned inside

### Resources (Kanban)

- Column cards: `bg-[--surface] border border-[--border] rounded-[--radius-lg]`
- Column header: resource name + icon, task count chip (`bg-[--accent-subtle] text-[--accent]`)
- Task cards: `bg-[--surface] border border-[--border] rounded-[--radius]` with drag handle (visible on hover only)
- Empty column: `border border-dashed border-[--border-strong]` centered hint text

### Capacity (Heatmap)

- KPI row: 3 stat cards `bg-[--surface] border border-[--border] rounded-[--radius-lg] p-4`
- Heatmap grid: cells colored by utilisation
  - 0%: `bg-[--surface]`
  - 1–79%: green scale `rgba(52,211,153, 0.08→0.45)`
  - 80–99%: `rgba(52,211,153,.60)`
  - 100%+: amber `rgba(245,158,11,.40)` → `rgba(239,68,68,.40)`
- Week nav: `← Week →` ghost buttons, ISO week label center, `text-[--text-secondary]`

### Settings

- Horizontal tab nav inside page (not sidebar): `border-b border-[--border]` tabs
- Section cards: `bg-[--surface] border border-[--border] rounded-[--radius-lg]`
- Within card: `border-b border-[--border]` section dividers
- Danger zone: `border border-red-500/30 rounded-[--radius-lg]`

### Sign In / Sign Up

- Split layout: left panel + right panel
- Left (40%): `bg-[--cta]` solid — logo mark (white), tagline text (white/70), no decoration
- Right (60%): `bg-[--background]` — form centered in column
- Form: `bg-[--surface] border border-[--border] rounded-[--radius-lg] p-8 w-full max-w-sm`
- No decorative elements, no illustrations, no gradients

---

## 4. Motion Spec

All motion is information, not decoration. Default is instant.

| Interaction | Duration | Easing | Notes |
|---|---|---|---|
| Button / nav hover | 150ms | ease-out | Color only, no transform |
| Sidebar collapse | 200ms | cubic-bezier(0.4,0,0.2,1) | Width + label opacity |
| Dialog open | 150ms | ease-out | opacity + translateY 8px→0 |
| Dialog close | 100ms | ease-in | opacity only |
| Drag pickup | spring | stiffness 400, damping 30 | scale(1.02) |
| Drag drop | spring | stiffness 500, damping 35 | position settle |
| Drag reject | 400ms | ease-in-out | shake ±6px ×3, then revert |
| Everything else | instant | — | zoom, nav, realtime, creation |

---

## 5. Implementation Approach

**Strategy: Token-first.** Rebuild `globals.css` and font loading first. All downstream components then just use the new tokens — no per-component color overrides.

Order:
1. CSS token system + font — `globals.css`, `app/layout.tsx`
2. Sidebar rebuild — `components/sidebar-nav.tsx`
3. Auth pages rebuild — `app/(auth)/sign-in/page.tsx`, `sign-up/page.tsx`, `layout.tsx`
4. Timeline view polish — toolbar, date axis, task blocks, dialogs
5. Resources view polish — columns, task cards
6. Capacity view polish — KPI cards, heatmap cells
7. Settings page polish

---

## Files Modified

| File | Change |
|---|---|
| `app/globals.css` | Full CSS token rewrite (light + dark) |
| `app/layout.tsx` | Replace Geist with Plus Jakarta Sans |
| `components/sidebar-nav.tsx` | Full rebuild (collapsible, new tokens) |
| `app/(auth)/layout.tsx` | Split layout wrapper |
| `app/(auth)/sign-in/page.tsx` | New split-panel design |
| `app/(auth)/sign-up/page.tsx` | New split-panel design |
| `components/timeline/timeline-toolbar.tsx` | Token updates, zoom pill style |
| `components/timeline/timeline-grid.tsx` | Today line, row tokens |
| `components/timeline/date-axis.tsx` | Today highlight, token updates |
| `components/timeline/resource-row.tsx` | Sticky col tokens |
| `components/timeline/task-block.tsx` | New block styles (light + dark) |
| `components/timeline/add-task-dialog.tsx` | Dialog token updates |
| `components/timeline/create-resource-dialog.tsx` | Dialog token updates |
| `components/resources/resource-column.tsx` | Card tokens, header |
| `components/resources/resource-task-card.tsx` | Card tokens, drag handle |
| `components/capacity/capacity-view.tsx` | Week nav tokens |
| `components/capacity/kpi-cards.tsx` | Card tokens |
| `components/capacity/capacity-heatmap.tsx` | Cell color scale |
| `app/(app)/[orgSlug]/settings/page.tsx` | Tab nav, section cards |
| `components/ui/button.tsx` | Primary/ghost/destructive variants |
| `components/ui/input.tsx` | Token-aligned input styles |
| `components/ui/dialog.tsx` | Radius, shadow, animation tokens |
