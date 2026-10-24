# RMIS — Domain Glossary

Shared vocabulary for the Recruitment Management Information System. Use these
exact names in code, comments, PRs, and architecture discussions — seams get
named after domain concepts, not after implementation shapes ("the Application
intake module", never "the ApplicationService").

## People & access

- **Applicant** — a User with role `APPLICANT` plus an `Applicant` profile row
  (1:1). Owns profile sections, documents, applications.
- **Evaluator** — staff role `EVALUATOR`; scores applications in the Review
  Queue. **Admin** — staff role `ADMIN`; full operations + settings.
- **Staff gate / intranet tier** — the spec §2.2 network classification
  (private/loopback/CGNAT/link-local = intranet; **LAST** XFF entry is
  authoritative) enforced at three chokepoints: login, session, requireRole.

## Recruitment core

- **Job Posting** (`JobPosting`) — one vacancy listing; deadline-gated,
  publish-gated. **Position** — the qualifying record linked to a posting
  (salary grade, MQR requirements, item number).
- **Application** — an Applicant ↔ JobPosting pairing entering the
  **pipeline**: `Applied → Under Review → Shortlisted → Rejected`
  (vocabulary: `lib/status.ts`). **Active application** — still occupies the
  pipeline, blocks a duplicate apply. **Terminal** (Rejected/Declined/
  Withdrawn) — frees the applicant to **re-apply** to the same posting
  (MOM 2026-10-13).
- **MQR** — Minimum Qualification Requirements; server-side gate on apply
  (`lib/mqr.ts`). **Verdict** — per-requirement `MET | NOT_MET | REVIEW`.
- **Snapshot** — frozen profile data attached to an Application at submit
  time (§8.8), so later profile edits never rewrite history.
- **Review Dossier** — everything an Evaluator judges an Applicant by,
  assembled in ONE module (`lib/review-dossier`): the frozen **Snapshot**
  read, the live MQR/requirements recomputation, the **Prior-Rejection
  History**, and the wire shape both staff surfaces serve (detail route +
  review queue). Wire types (client-safe): `lib/review-dossier-types`.
- **Prior-Rejection History** — the MOM 2026-10-13 re-apply doctrine as one
  implementation in `lib/review-dossier` (`reApplyHistoryFrom`): the
  applicant's earlier REJECTED/DECLINED applications for the SAME posting.
  WITHDRAWN never counts (the applicant's own action, not a rejection
  verdict) and the current application never counts (a rejection is never
  its own history).

## Profile & documents

- **PDS** — Personal Data Sheet (the CS form). Uploading one powers
  **extraction** and **auto-apply** (§8.4): sections are **REPLACE**
  (delete-all + recreate) inside one transaction, personal info is an
  OVERRIDE allowlist.
- **PDS intake pipeline** — the client-orchestrated 3-step run behind the
  profile's Auto-fill row: upload (201) → extract (200) → auto-apply (200).
  Its wire contract + runner live in `lib/pds-pipeline.ts` (one-extraction
  lock predicate, upload accept/size mirrors); the extract + auto-apply
  routes type their payloads against it.
- **Profile section** — Education / Work Experience / Training / Eligibility /
  Awards; each has ord-ordered rows. Edit is modeled as **delete + recreate**
  client-side (§6.3, no PUT).
- **Profile completion gate** — computed flag + live re-validation that must
  pass before apply (§8.3).
- **Document** — an uploaded file (12 **categories**, 10 MB cap, extension
  allowlist). **Document status** vocabulary (`lib/document-status.ts`):
  `UPLOADED → PROCESSING → EXTRACTED | PARTIALLY_EXTRACTED | FAILED`.

## Communications

- **Notice** — evaluator-sent status email (MOM templates). **Invitation** —
  interview invitation (mode/venue/details). **Regret** — rejection notice.
- **Notice fan-out** — the bookkeeping every notice-sending route wraps around
  a delivery: the audit row, the best-effort in-app notification, and the
  per-recipient outcome ledger (`sent | skipped | failed`; "skipped is its own
  outcome" — only sent/mock is a delivery). ONE module: `lib/notice-fanout`
  (`deliveryOutcome`, `createInAppNotification`, `auditNotice`,
  `createNoticeBatch`); the sends themselves stay in the frozen
  `lib/notify.ts`, and each route keeps its own §9.3 channel matrix. The
  outcome vocabulary is the server twin of `lib/status-ui`'s
  `deliveryStatusMeta` chips.
- **OTP** — 6-digit signup verification code, stored as sha256(code:pepper),
  10-min TTL, 5 attempts.

## Architecture vocabulary (codebase-design skill)

- **Deep module** — lots of behavior behind a small interface. The repo's:
  `lib/api.ts` (`ok/err/handleApi/parseId/getClientIp` — every route's
  envelope, error mode, IP contract), `lib/client.ts`
  (`apiFetch/apiUpload` — the entire client transport), `lib/auth.ts` (route
  guards), `lib/secrets.ts` (every signing key), `lib/job-meta.ts`
  (deadline semantics), `lib/status.ts` / `lib/document-status.ts`
  (vocabularies), `profile/section-mutations.ts` (§6.3 mutation contract).
- **Staff Role Policy** — the one route→access matrix for every /api route
  (`lib/role-policy.ts`): gates `PUBLIC / OPTIONAL_SESSION / ANY_SESSION /
  APPLICANT / APPLICANT_PROFILE / STAFF / ADMIN`, each mapping onto a
  `lib/auth.ts` chokepoint so 401/403/404 semantics stay single-sourced. The
  spec §6.6 "ADMIN" baseline and the QA 2026-02 evaluator exceptions
  (admin applicants/stats/email:read/contact-requests) are declared rows with
  rationale — divergence documented, not silent.
- **Seam** — where a module's interface lives. **Adapter** — a concrete
  implementation at a seam. **Leverage** — caller capability per interface
  learned; **locality** — change concentrates in one place.
