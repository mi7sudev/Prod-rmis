# RMIS v4.7 — OTP-outage ops kit + applicant QA pass (2026-10-23)

Applicant QA wave on top of v4.6, plus the operations kit produced while
recovering from the 2026-10-22 OTP email outage. Zero dependency changes;
no schema migration (the ops scripts are stdlib-only and the app changes
are UI/wire-level).

## Completion nudge tour (profile)
- When EVERY profile step shows its green "Completed" check (all 7 sections
  done) but the profile is not yet marked complete, a one-step spotlight
  tour now appears pointing at the **Mark Profile as Complete** button —
  desktop: the wizard-header CTA (top right); mobile: the green ready-banner
  button under the section strip. Auto-scrolls to the target, never stacks
  with the one-time PDS walkthrough, and dismissal is remembered per browser
  SESSION (an applicant who skips it is reminded once on the next visit
  until they actually mark it). The step copy matches the viewport
  ("Tap…" vs "Click…"). Applicants with an all-7-done profile qualify on
  day one after deploy.
- `OnboardingTour` gained opt-in `autoStart` (skip the welcome dialog) and
  `persist="session"` modes — fully backward compatible; the existing
  walkthrough behavior is unchanged by default.

## Education matching encodes the 7-tier level hierarchy (MQR)
- Requirement/applicant education comparisons now rank the full CSC ladder —
  Elementary 1 · Secondary/JHS 2 · Senior High School (Grade 12) 3 ·
  Vocational/Trade 4 · College 5 · Graduate Studies 6 · Doctorate 7 — with
  "higher tier always meets a lower requirement" preserved. Fixes:
  "Not specified" as a requirement no longer evaluates as College (the
  lowest tier, not a mid one), and a Secondary applicant no longer passes a
  Senior High School (Grade 12) requirement. Senior High School is tested
  BEFORE the generic high-school pattern ("senior high school" contains
  "high school").

## "Other — type your own" closes the dropdown (education form)
- Picking the Other row in Course / Degree now CLOSES the suggestion panel
  and leaves the field focused — the closed dropdown is the visible hint to
  start typing the custom course, and typing stays list-free (the panel
  re-opens on click or ArrowDown). An exact listed choice is still cleared
  when switching to Other; already-typed custom text is kept.

## Verification-code form fits thin phones (OTP)
- The 6 OTP slots no longer overflow the auth card on narrow screens: the
  row fills the available width (slots flex equally) and caps at the
  328 px design size. The sign-up card (~240 px interior at 320 px) and the
  sign-in inline verification panel (~204 px interior) both fit now — the
  fluid row also fixes a pre-existing 28 px overhang of the sign-in panel
  on desktop (300 px interior). Typing, paste, SMS autofill, error shake
  and success check behavior unchanged; slot height stays 48–56 px.

## Processing date is staff-only
- The job posting's **Processing date** no longer reaches applicants or the
  public: `/api/jobs` nulls the field for every non-staff viewer, and the
  Processing tile is removed from the applicant/public Timeline (job sheet
  + the shared tabs used by the application modal — Published and Deadline
  remain, grids re-flowed to two columns). Staff surfaces are unchanged:
  the job workspace record keeps its Processing row and the recruitment
  form keeps its Processing date input.

## OTP-outage operations kit (deploy/)
- `activate-otp-outage-accounts.py` — activates the accounts of applicants
  who registered during the OTP email outage (dry-run default; `--apply`
  flips `confirmed` with an audit marker per account; `--notify` sends the
  apology email with the system sign-in link through the MIRDC middleware;
  canary-first flow, idempotent, guarded).
- `remap-account-email.py` — one-transaction account email remap across
  User + Applicant + EmailLog + AuditLog (used to point the canary at a
  monitored inbox).
- `RUNBOOK-otp-outage-activation.md` — the canary-first production
  sequence (sync → remap canary → dry-run CSV → apply → canary notify →
  blast → health check), with rollback notes.

## Email relay production-readiness (mirdc_middleware, Task 92)
- Parity confirmed against the production-proven RMISv4.2 repo: the relay
  `index.js` was byte-identical before this change; the outage evidence
  (production `email_logs`: 139 hard `Middleware 500` failures from
  2026-10-22 18:11 UTC+8 for 15+ hours, zero diagnostic detail) drove three
  ADDITIVE hardening changes, all legacy-contract safe:
  1. `GET /health?smtp=1` — live SMTP readiness probe (real connect+auth,
     4s-guarded): `{"status":"ok","uptime":…,"smtp":"ready"|"down (<reason>)"}`.
     Plain `GET /health` is byte-identical to before.
  2. Enriched 500 body — `Internal server error (SMTP: <reason>)` (same key,
     same status, original text preserved as prefix) so the SMTP server's own
     response (e.g. `535 … Username and Password not accepted`) lands in the
     app's `email_logs.error` instead of requiring VM console access.
  3. SMTP connect/greeting/socket timeouts (10s/10s/20s) — a stalled socket
     now fails inside RMIS's 15s fetch abort instead of hanging.
- `deploy/RUNBOOK-email-preflight.md` — the 5-minute go-live email checklist
  (relay `/health` → `/health?smtp=1` → RMIS `/api/health` → staff test email
  → real-address OTP), an `email_logs.error` decoding table, and the outage
  recovery playbook (app-password revocation / quota block / network).
- Verified against a local capturing SMTP sink: legacy contract, RMIS contract
  (From + Reply-To + text part), template path, probe ready/down/timeout
  paths, enriched failure body, legacy 400s — all pass; `node --check` clean.

# RMIS v4.6 — Education MQR doctrine + "Other" course option (2026-10-22)

Applicant QA (2026-10-22): an applicant with Education Level = "College" and
a custom-typed Course / Degree ("BS Business Management", not in the
reference list) was blocked at the apply gate — "Requirements Not Met" on
Education — even though College level satisfies the position's "Bachelor's
degree" standard. Two user-visible changes, one engine doctrine fix, zero
schema/route/dependency changes.

## The MQR education doctrine (`lib/requirements.ts`)
- **The explicit Education Level choice is authoritative.** A "College" row
  evaluates as College regardless of what is typed in Course / Degree; the
  degree/course/specifyOthers text is only a FALLBACK for rows without a
  usable level (PDS imports, legacy data). A side effect of the old
  concatenated-text inference — a "Master in…" course text silently
  elevating a "College" row — is gone too.
- **CSC vocabulary standards are level-only.** The standards staff pick from
  the controlled dropdown (`CSC_EDUCATION_*`, constants.ts) are
  minimum-level statements, not field-of-study requirements — they now
  match on level alone. This also fixes a latent landmine: vocabulary
  entries like "Two years of college education (prior to 2018)" or
  "Grade 12 / Senior High School graduate (starting 2016)" used to
  tokenize into words ("education", "prior", "2016") that NO applicant row
  can contain — every applicant failed Education for such positions.
- **Free-typed standards keep their field-of-study tokens** —
  "Bachelor's degree in Engineering" still requires an engineering course;
  a College row with an unrelated course correctly stays NOT_MET for it.
- **Tokenizer honesty:** the apostrophe split ("Bachelor's" → "bachelor s")
  used to leak a standalone `s` token that matched almost any row — an
  accidental pass. Single-letter artifacts are dropped and the generic
  degree-family abbreviations (bs/ba/ab/ms/ma/mba) are stopwords, so a bare
  "Bachelor's degree" standard correctly reduces to a level check for ANY
  course — typed, imported, or custom.
- **Fallback inference expands degree abbreviations** (BS/BSBA/AB/BA/MS/MA/
  MBA/PhD…): a "BS Business Management" row whose Education Level was left
  "Not specified" now ranks as College instead of failing every
  bachelor-level standard. No signal at all stays conservative (fails,
  reviewer verifies).
- **One doctrine for the card tag too** (`lib/credential-tag.ts`): the
  kanban credential tag now delegates to the engine's `eduLevelOf`, so the
  staff board and the apply gate can never disagree about how advanced an
  applicant's education is.

## The "Other — type your own" course option (Combobox)
- The Course / Degree field on the education form now shows a persistent
  **"Other — type your own"** row at the foot of the suggestion panel —
  visible in every state, so the free-typing affordance is discoverable
  instead of implied by the "No matches — your typed text is kept." copy.
- Picking it hands the field back for typing: an exact listed choice is
  cleared (the user is switching from the list to their own entry),
  already-typed custom text is KEPT (the row just refocuses), and the panel
  stays open so the next keystrokes land in the field. The typed text is
  saved verbatim into `Education.course`; nothing is added to the reference
  vocabulary. Arrow keys + Enter reach the row as the last panel index.
- Generic Combobox capability (`otherOption` prop → `allowOther` field
  config): only the education form opts in today; the staff recruitment
  form's "Add … to the choices" behavior is byte-identical (verified).

## Verification
- 24/24 zero-DB unit checks against the real engine: the reported scenario
  (College + "BS Business Management" vs "Bachelor's degree") is MET on
  level; HS rows still fail bachelor standards; ongoing rows still fail;
  all CSC vocabulary entries evaluate level-only with correct minima;
  free-typed field standards still discriminate.
- Live wire check (real applicant session, no DB writes):
  `POST /api/jobs/verify-mqr` for the exact screenshot position
  (Administrative Officer V (Cashier III), standard "Bachelor's degree")
  returns Education = "Meets the minimum requirements".
- Browser (agent-browser, minted sessions, zero DB writes): the Other row
  renders desktop + mobile; keep/clear/type behaviors verified in the real
  dialog; the education row is byte-unchanged afterwards. Staff Create Job
  combobox re-verified (options + Add-row intact, no Other row).
- `bun run lint` clean; `tsc --noEmit` = the 17 documented pre-existing
  errors in non-app files, none in touched files.

# RMIS v4.5 — Architecture deepening (2026-10-22)

The seven deepening candidates from the 2026-10-22 architecture review,
operator-approved as a set ("fix everything"). All are behavior-preserving
extractions verified byte-identical against the pre-refactor build — with
ONE deliberate, documented fix (below). No schema changes, no new routes,
no dependency changes; the wire, the pixels, and the emails are unchanged.

## One domain module per seam (server)
- **The Review Dossier** (`lib/review-dossier.ts` + client-safe
  `lib/review-dossier-types.ts`): the frozen-snapshot deserialization +
  live MQR recomputation that every staff surface judges an applicant by
  existed twice (detail route vs queue route), and the client re-declared
  the payload a third time. ONE module now; `review-workspace.tsx` imports
  the shared type.
- **The Prior-Rejection History — the release's one behavior fix**: the
  re-apply doctrine existed twice with divergent rules. Unified on the MOM
  2026-10-13 semantics: prior REJECTED/DECLINED applications for the same
  posting count, WITHDRAWN never counts, the current application never
  counts. This fixes a real queue-row bug: `lastDate`/`lastReason` used to
  report a DECLINED application's OWN date/reason as its "prior rejection"
  (self-as-history); they now report the newest OTHER rejection.
- **The Notice fan-out** (`lib/notice-fanout.ts`): the pipeline→channel
  bookkeeping (outcome classification, best-effort in-app notification,
  canonical audit rows, per-recipient batch ledger) was hand-rolled with
  drift across 6 routes. Extracted; email composition, recipients and
  skip matrices stay byte-in-place in each route (Tier-2 discipline;
  `lib/notify.ts` untouched). 18/18 live probes byte-identical.
- **The Staff Role Policy** (`lib/role-policy.ts`): the route→access matrix
  is now data — a 55-route bijection consumed by the guards, fail-closed on
  undeclared pairs (500, never a silent allow). 120-probe sweep (30 GET
  routes × 4 sessions) matches the declared gates exactly.

## One client seam per vocabulary
- **The Pipeline Board** (`lib/pipeline-board.ts`): one `QueueRow` wire type
  + one bucket factory replacing four hand-redeclared copies across the
  staff boards; presentation vocabulary stays in `lib/status`/`status-ui`.
- **The PDS Intake contract** (`lib/pds-pipeline.ts`): the 3-step
  upload→extract→auto-apply pipeline got one typed module with
  schema-derived types (`z.infer`), the one-extraction lock as one
  expression, and compile-time conformance on the server routes (server
  drift from the contract is now a tsc error). The old hand-copy even
  declared a field the server never sends — gone.
- **The Application Journey vocabulary**: `applicant-home.tsx` (1,839
  lines) decomposed into 10 focused modules under `components/views/
  applicant/` (journey vocabulary/stepper/card, applications rail, detail
  modal, history drawer, mini profile, home hero, skeleton, bookmarks),
  reusing the single-source stage/glyph vocabulary from Task 78.

## Verification
- Byte-stability: queue + 4 detail dossiers byte-identical before/after
  (except the documented `lastDate`/`lastReason` doctrine fix); DOM
  snapshots identical on 4 staff surfaces + applicant home (empty and
  data-bearing), detail modal, history drawer, at desktop and mobile
  widths; zero console errors.
- Sandbox DB held at the exact pristine census throughout (probe
  applications created for the data-bearing checks were removed and
  proven by ID-diff against the pre-work backup).

# RMIS v4.4 — System-audit fixes (2026-10-22)

Full-system two-axis audit (standards + spec, 8 sub-agents) → 71 findings;
this bundle ships the remediation. Headlines:

## Applicant-facing fixes
- **Unverified-account dead end closed**: the sign-in 403 gate now renders an
  inline 6-digit code panel (BEUI OTPInput) with resend — closing the tab
  before verifying no longer locks an applicant out. Verify/resend accept a
  USERNAME identifier too (address resolved server-side; enumeration-safe).
- **Blocked-account truth**: `blocked` is checked before the verification
  gate — a blocked account can no longer masquerade as "please verify".
- forgot-password fire-and-forget (no more hung dialog on relay latency).
- **Apply-gate integrity**: blank profile rows are rejected at every section
  API and no longer satisfy the profile-completion gate; the MQR gate and the
  reviewer requirements report are ONE engine now (clause/level semantics),
  and the journey modal carries the applicant's own live MQR ledger again.
- PDS extraction runs a bounded pool (4) and never targets non-extractable
  categories; saved-jobs bookmarks sync across tabs/surfaces live.

## Staff-side fixes
- **PATCH status transition law**: decisions are irreversible
  (rejected/withdrawn cannot be resurrected), same-stage writes are idempotent
  no-ops (no re-emails), and concurrent evaluators get a 409 instead of
  last-write-wins.
- Bulk regret/invitation delivery reports the truth: only sent/mock counts as
  delivered — "skipped" is its own outcome; regret letters never target final
  states; in-app notification rows are best-effort (no 500 after delivery).
- Review queue/staff surfaces fetch the FULL dataset (pageSize cap 1000) —
  applications beyond the first 100 were invisible and every KPI undercounted.

## Platform & security
- Staff intranet gate fails CLOSED: `INTRANET_ENFORCEMENT` defaults `on` in
  production, unknown host/IP is untrusted, forwarded-host parsing is
  spoof-resistant; the two-door host envs are documented as real.
- `/api/health` gains an `email` check — a misconfigured relay degrades the
  response so deployment verification catches it.
- package.json: `db:push` loses `--accept-data-loss`; `start` uses Node (the
  PM2 runtime) instead of bun; seed refuses to target the production database
  file even in dev.
- Error boundaries (`error.tsx` / `global-error.tsx` / `not-found.tsx`) — no
  more white screens; `db-schema.txt` regenerated (20 tables, no drift);
  backup/docs contracts aligned; rotted `reset-production.mjs` deleted.
- Hygiene: one job-wire module, one dates module, shared audit-label helper,
  single status normalizer, one delivery-status chip vocabulary, media-query
  hook dedup, dead constants removed.

# RMIS v4.1 — Deploy Bundle r5 (2026-10-12)

**CODE-ONLY bundle — contains NO `db/` and NO `upload/`.** Same safety rule
as r4: extracting over a live deployment never touches the production
database or uploaded documents.

r4 → r5 is a wide consolidation release: the client tree was restructured
onto the BEUI design system, the status/badge vocabulary became
single-source, and the auth/public/applicant surfaces gained new flows.
Headlines:

## Status system: one badge language, BEUI motion
- New `src/components/motion/*` BEUI library (AnimatedBadge, Alert, button
  family, card, checkbox/radio/switch/select, date-range-picker, file/OTP
  inputs, morphing popover/modal, editable table, tooltips, tabs, toasts)
  and `src/components/ui/shell.tsx` as the single-source shell primitives
  (PageHeader, StatusPill, KpiCard, EmptyState, SectionCard, pagination,
  skeletons, RichSection…).
- Every status chip in the system — applicant journey, review queue, staff
  tables, pipeline dots, verdict and document pills — speaks ONE mapping:
  `src/lib/status-ui.ts`. Status changes roll with spring motion instead of
  popping.
- The in-review family (Under Review / Screening / Evaluation / Interview)
  renders as the brand-blue info chip everywhere; the amber warning
  triangle (orange danger sign) is gone from every surface.
- Application Progress card: the "In Review" badge now wears the BEUI
  syncing badge — spinning loader + breathing blue tint, label stays "In
  Review". The looping motion is CSS-compositor owned (`animate-spin` +
  `badge-pulse` keyframes in globals.css), so it cannot freeze mid-flight.

## Applicant portal
- Mini profile card wears the same sky gradient as the frontpage "Job
  Opportunities" block.
- Journey cards carry the checkpoint timeline, next-step hint and the full
  detail modal (§7.7) with MQR ledger; saved-jobs bookmarks are shared with
  the public board.
- Sticky footer pinned across every view at every scroll depth (mobile
  safe-area aware); new mobile tab bar, notifications panel and ⌘K command
  menu.

## Auth & account
- Unified brand panel on sign-in AND create-account; CAPTCHA gate
  (`/api/auth/captcha` + turnstile); forgot-password → OTP verify →
  reset-password flow (`/api/auth/forgot-password`, `/verify-otp`,
  `/reset-password`, `/resend-otp`) plus `/api/auth/change-password`.
- First-visit onboarding tour reworked onto the new shell
  (`src/components/onboarding-tour.tsx`).

## Public site, contact & PDS pipeline
- Contact/inquiry pipeline: `/api/contact` → admin Contact Requests view →
  `/api/admin/sms` notify route.
- PDS auto-fill: xlsx extraction + validation (`src/lib/pds-extract.ts`,
  `src/lib/pds-validate.ts`, `/api/applicant/documents/extract`).

## Restructure & hygiene
- `workspaces/*`, `dash/*` and the legacy shadcn primitive pile were
  replaced by the `views/*` + `motion/*` + `ui/shell.tsx` layout; ~200 dead
  files removed.
- `db-schema.txt` regenerated from the current 20-table Prisma schema.
- `prisma/seed.ts` added to the bundle.

## Deploy (server rmis-mirdc, live root /home/rmis-mirdc/Desktop/RMISv4.1)

```bash
cd /home/rmis-mirdc/Desktop/RMISv4.1          # confirm with: pm2 describe rmis | grep -i cwd
tar -xzf rmis-deploy-2026-10-12.tar.gz -C .   # code-only — no db/upload risk
npm install
npx prisma generate        # generate ONLY — never db push
npm run build
cp .env .next/standalone/.env
pm2 restart rmis
```

Then hard-refresh the browser (Ctrl+Shift+R).

## Carried from r4 (unchanged)

Onboarding tour, job-form Item No. + Plantilla single-vacancy rule, light
mode by default. r4 = r3 + tour + item-no + light-default; r3 = r2 + auth
brand panel + header scroll-pulse fix; r2 = r1 + standalone-path ENOENT fix
+ Fast-Track removal + DEPLOYMENT.md §0.

# RMIS v4.1 — Deploy Bundle r4 (2026-09-30)

**CODE-ONLY bundle — contains NO `db/` and NO `upload/`.** Safe to extract
over a live deployment: your production database and uploaded documents are
never touched. (r1–r3 shipped a seed `db/custom.db` and upload fixtures;
extracting those over a live root overwrites real data — this revision
removes that footgun entirely.)

## New feature: first-visit onboarding tour (all roles)

Once per user, auto-opens ~1s after they land on their home view after
sign-in; any dismissal (X, Esc, or Finish) permanently marks it as seen for
that user on that browser. New: `src/components/ui/tour.tsx` (spotlight
tour — follows scroll, keyboard Esc/←/→, reduced-motion aware, viewport-
clamped card) and `src/components/onboarding/onboarding-tour.tsx`
(per-user/per-surface gating, waits for targets to mount).

- Applicant (`applicant-home.tsx`): welcome → Complete Your Profile (only
  while the profile is incomplete) → Open Positions → Your Applications.
- Admin (`admin/dashboard.tsx`): welcome → Needs Attention → Active
  Recruitment → Latest Applications.
- Evaluator (`dash/views/queue.tsx`): welcome (+ Qualified-only switch) →
  Pipeline/List view tabs → Evaluate Applications. The legacy
  `workspaces/evaluator/review-queue.tsx` is dead code (imported nowhere)
  and was left untouched.
- `dash/kit.tsx`: `Panel` now accepts an optional `id` (backwards-compatible).
- Profile page (applicant, `views/profile-view.tsx`): a 4th tour surface —
  Your Applicant Record → Profile completeness (three-state copy: complete /
  ready-to-mark-complete / which sections are still required) → Auto-Fill
  upload → section navigation. Picks the right nav anchor for desktop vs
  mobile viewports; the spotlight treats hidden responsive twins as missing
  targets (no corner-hole artifacts).

## Job form: Item No. field + Plantilla single-vacancy rule

The create/edit job dialogs had no way to enter the CSC **Item No.** —
every web-created position had `item_number` NULL, even though the job
detail header already printed "Item No. {…}". And vacancy counts were a
free field regardless of employment type.

- Both dialogs (recruitment list `JobFormDialog` + job workspace
  `JobEditDialog`): new **Item No.** input paired with Number of Vacancies.
- **Plantilla / Permanent** (CSC registry synonym): vacancies locked at
  **1** (input disabled, snapped on type change) and Item No. required —
  "each CSC item authorizes one position". Create is blocked until the
  item number is filled; the edit dialog lets you backfill an old
  plantilla job on save.
- **COS / Job Order / Contractual / Temporary** (needs-based): vacancies
  freely editable (default 1), Item No. optional — "usually none".
- Wire-through: `lib/validation.ts` (+`itemNumber`), `POST /api/jobs` +
  `PATCH /api/jobs/[id]` persist it to the position master row
  (create AND edit-backfill). No schema migration — the column existed.
- Public job board and applicant detail views already read
  `position.itemNumber`, so posted plantilla jobs now show their item no.
  everywhere with zero extra work.

## Light mode by default

The app opened on the obsidian (dark) sheet for every browser with no
saved choice (`defaultTheme="dark"`). Now the light sheet is the default:
- `providers/theme-provider.tsx`: `defaultTheme="light"` — OS preference
  stays deliberately ignored (`enableSystem` off) so the default is
  deterministic; the nav toggle remains the single source of truth and a
  user's saved "dark" survives the update (by design).
- `app/layout.tsx`: mobile browser-chrome `themeColor` pinned to the light
  canvas (#F7F8FA) to match what first-open visitors actually see.
- `ui/sonner.tsx`: pre-hydration toast fallback dark → light (cosmetic).

## Carried from r3 (unchanged)

r3 = r2 + two UI fixes: unified auth-page brand hero ("Molding the future
of metal industries" in BOTH sign-in and create-account) and the header
scroll-pulse fix (hysteresis thresholds 64/24). r2 = r1 + Task 40
(standalone-path ENOENT fix) + Task 42 (Fast-Track removal) + DEPLOYMENT.md §0.

## Deploy (server rmis-mirdc, live root /home/rmis-mirdc/Desktop/RMISv4.1)

```bash
cd /home/rmis-mirdc/Desktop/RMISv4.1          # confirm with: pm2 describe rmis | grep -i cwd
tar -xzf rmis-deploy-2026-09-29.tar.gz -C .   # code-only — no db/upload risk
npm install
npx prisma generate        # generate ONLY — never db push
npm run build
cp .env .next/standalone/.env
pm2 restart rmis
```

Then hard-refresh the browser (Ctrl+Shift+R). Sign in with an account that
has not seen the tour yet (or clear the `rmis-onboarding-*` localStorage
keys to replay it).

---

# RMIS v4.1 — Deploy Bundle r3 (2026-09-29)

Update to r2. Seed database, upload fixtures and backend code UNCHANGED —
this revision ships two UI fixes on top of r2:

## 1. Auth page — unified brand panel (sign-in AND create-account)
- `src/components/views/signin-view.tsx` — the desktop right-side brand
  column now shows the SAME "Molding the future of metal industries" hero
  in both modes. The create-account variant ("RMIS — Applicant
  registration / Join MIRDC. …") was removed per user feedback.

## 2. Header scroll "pulse" fix (hysteresis)
- `src/components/site-header.tsx` — the condense-on-scroll header used a
  single 40px threshold; on short pages (auth) scroll clamping near the
  page bottom re-crossed it, oscillating condense/expand = the reported
  "pulsing". Now: condense at scrollY > 64px, expand only below 24px —
  the 40px hysteresis gap exceeds the ~20px condense height delta, so the
  feedback loop is impossible; plus mount-time sync for pre-scrolled
  reloads.

---

# RMIS v4.1 — Deploy Bundle r2 (2026-09-29)

Update to `rmis-deploy-2026-09-29.tar.gz` (r1). The tested seed database
(`db/custom.db`) and `upload/` fixtures are UNCHANGED from r1 — only source
code and documentation moved.

## Changes included (r1 → r2)

### 1. Standalone-path fix (production ENOENT on uploads/extraction)
Under pm2 the standalone server runs with CWD = `.next/standalone`, so every
path built from `process.cwd()` pointed inside the build output and broke
after rebuild. All document/secondary-DB paths are now resolved from stable
anchors:

- `src/lib/env.ts` — new helpers: `appRoot()` (cwd-independent anchor via the
  absolute DATABASE_URL), `resolveStoredDocPath()` (resolves stored
  `upload/...` metas against `UPLOAD_DIR`), plus `sqliteFilePath()`.
- `src/app/api/applicant/documents/[id]/route.ts` — document delete unlink
  now uses `resolveStoredDocPath()`.
- `src/app/api/applicant/documents/extract/route.ts` — extraction file read
  now uses `resolveStoredDocPath()`.
- `src/lib/documents.ts` — cleanup unlink now uses `resolveStoredDocPath()`.
- `src/lib/audit-db.ts`, `src/lib/notification-db.ts` — audit.db /
  notifications.db now anchored to `appRoot()/db/` instead of CWD.

### 2. Removed "Fast-Track Apply · PDS Auto-Fill"
- DELETED `src/components/views/fast-track-apply-dialog.tsx` (entire
  upload→extract→auto-apply→MQR in-dialog flow).
- `src/components/apply/apply-flow.tsx`, `src/components/views/jobs-view.tsx`
  — incomplete applicants now get a standard "Finish Your Profile First"
  dialog (government profile-completeness rule) with "Go to My Profile".
- `src/components/views/upload-pds-card.tsx` — profile upload card now
  recommends the Excel (.xlsx) PDS (CS Form 212) — it extracts best.
- Comment hygiene: `src/app/api/jobs/apply/route.ts`,
  `src/app/api/applicant/profile/complete/route.ts`,
  `src/lib/profile-completeness.ts`,
  `src/components/workspaces/applicant/applicant-home.tsx`.
- Backend routes `/api/applicant/profile/auto-apply` and
  `/api/applicant/profile/complete` remain (still used / dormant-valid).

### 3. Documentation
- `DEPLOYMENT.md` — new §0 "AS-EXECUTED PRODUCTION CONFIGURATION" recording
  the live deployment (host, pm2, .env keys, hard-learned rules).

## Deploy steps (server rmis-mirdc, app root /home/rmis-mirdc/Desktop/RMISv4.1)

```bash
# 1. Back up current state, then extract this bundle over the app root
tar -xzf rmis-deploy-2026-09-29.tar.gz -C /home/rmis-mirdc/Desktop/RMISv4.1

# 2. Install + build (Node 22 + npm; NO bun on this box)
cd /home/rmis-mirdc/Desktop/RMISv4.1
npm install
npx prisma generate        # generate ONLY — db push is FORBIDDEN against production-data.db
npm run build
cp .env .next/standalone/.env
pm2 restart rmis

# 3. Smoke test
# - applicant upload (.xlsx PDS) → extract → delete document: no ENOENT
# - incomplete applicant clicks Apply → "Finish Your Profile First" dialog
# - audit log + notifications still populate (appRoot-anchored DBs)
```

Do NOT overwrite the server's `db/production-data.db` or `upload/` with
bundle contents — this bundle's `db/custom.db` is the tested SEED for fresh
installs only.

## Known issue NOT addressed by code (edge-side, not app-side)

External-device uploads returning "You do not have permission to perform
this action." are caused by Cloudflare edge security (IP-reputation bot
blocking) returning 403 HTML pages before requests reach this app — proven
by direct probing on 2026-09-29. Fix lives in the registrar/Cloudflare
panel (disable the blocking security feature) — see chat worklog Task 43.
