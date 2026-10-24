# RMIS — project memory

## Design system rules (established 2026-10-20, UI review + implementation)

**Brand role split — one hue, two jobs.**
- `--brand-500 #1591dc` = GRAPHICS ONLY (focus rings, rail indicator, stage dots,
  chart series 1, illustration, display type ≥24px). Never text.
- `--brand-600 #0b6fa8` = anything read: CTA fills, links, inline emphasis, icon inks
  (5.45:1 on white). `--primary` maps here in light mode.
- `--brand-700 #0a6295` = hover/pressed under brand-600.
- Dark mode inverts the INK, not the fill: `--primary` = brand-500, `--primary-foreground`
  = `#08222f` (5.04:1), brand-600/700 lighten to `#63b4ea`/`#8ccbf2` for the text role.
- Never re-introduce `#1591dc` as a text colour or a fill behind white text.

**Type ladder — 8 steps, one role each** (`@theme` in `globals.css`):
11 label (caps only) · 12 caption · 13 meta · 15 ui · 16 body · 18 card-heading ·
24 display (page title) · 32 view-display · 44 hero-display.
No size below 12px unless uppercase label; max 3 sizes per surface. `PageHeader` title is
`text-display` (24) at every width — do not add a `sm:` bump.

**Radius contract:** surface 16 (cards/dialogs) · control 10 (`--radius-control`: inputs,
CTAs, ghosts) · capsule 9999 (pills/chips/avatars) · editorial 24 (imagery).
`--radius-md/lg/xl/2xl` all resolve to 16 by design — they are aliases, not steps. Do not
lower `--radius-md`: `rounded-md` is used on 20px checkboxes.

**Buttons:** one anatomy only — `ui/buttons.ts` presets (44px, 10px radius, flat, no drop
shadow, no hover lift). `ui/button.tsx`'s `buttonVariants` is a compatibility shim for two
vendored blocks and must stay on the same recipe. Touch targets: 44px minimum on
`pointer: coarse`; `.tap-44` expands the hit area of compact controls.

**Action hierarchy:** one solid brand fill per view — the consequential action owns it.
Filters/selection are neutral (selected chip = `bg-foreground text-background`), never brand.

**Mobile navigation:** four tabs maximum, every role. Applicant: Home · Jobs · Profile ·
Settings. Staff: three destinations from the module const `STAFF_PRIMARY` in
`mobile-tab-bar.tsx` (ADMIN: Dashboard/Jobs/Review; EVALUATOR: Review/Candidates/Jobs) plus
a More tab that holds the remaining rail destinations, Find (⌘K), the identity card and
Sign out. A view living in the More sheet inks the More tab. Never add a fifth tab — add a
row to the More panel instead.

**One green:** `#2f9e57` for `--viz-2` / `--chart-2` / `--color-recovery-green` /
`--color-emerald-accent` (3.42:1 on white). Do not reintroduce `#31ce01` (2.11) or
`#34c771` (2.20) — neither can carry a label or a chart mark.

**Touch:** 44px minimum on `pointer: coarse`. `.tap-44` expands the hit area of compact
controls without changing their visual size — apply it to any control under 44px.

## Environment gotchas
- `.env` `DATABASE_URL` is a Linux sandbox path (`file:/home/z/...`). For local runs pass
  `DATABASE_URL=file:<abs path>` as a process env var — do NOT edit `.env`.
- `npm ci` fails (lock out of sync); use `npm install`. Run `npx prisma generate` before
  `next build`, or page-data collection fails on `/api/admin/stats`.
- A killed `next build` leaves `.next/lock`; `rm -f .next/lock` before retrying.

## Protected (see AGENTS.md)
`src/lib/notify.ts`, `deploy/mirdc_middleware/*`, email callers, and the `.env` email block
are FROZEN. UI work must never touch them.
