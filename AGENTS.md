# AGENTS.md — Working Rules for AI Agents & Automation

> This file governs ANY AI agent, coding assistant, or automated tool that
> edits this repository (RMIS v4.2 — DOST-MIRDC Recruitment Management
> Information System). Read it BEFORE making changes. Rules in this file
> override general best-practice instincts: if a task seems to require
> violating a rule here, STOP and ask the human operator instead.

---

## 🔴 PROTECTED SUBSYSTEM — THE EMAIL SENDER (DO NOT MODIFY)

The email sender is **PRODUCTION-VERIFIED and FROZEN**. It was payload-proofed
against the live office relay (see `DEPLOYMENT.md` §0.4 and §0.4c — verified
2026-09-29 and 2026-10-15) and is currently working end-to-end:

- Applicant signup verification codes (OTP gate) are delivered through it.
- Shortlist / interview / exam / regret notices are delivered through it.
- Admin + evaluator email notices and the email ledger depend on it.

**Breaking it silently breaks applicant onboarding and all HR notices.**

### Tier 1 — FROZEN FILES (never modify, never refactor, never "clean up")

| File | Role |
|---|---|
| `src/lib/notify.ts` | The sender: `sendEmail` / `sendSms`, provider dispatch (middleware / resend / gateway / mock), all email + SMS templates, From/Reply-To identity, timeouts, email_logs / sms_logs persistence |
| `deploy/mirdc_middleware/index.js` | The office VM relay (Express + nodemailer) that owns the SMTP session — the `/sendMail` contract lives here |
| `deploy/mirdc_middleware/DEPLOY-NOTES.md` | Relay deployment notes |

**Absolute rules for Tier 1:**

1. Do NOT edit, rename, move, delete, reformat, or regenerate these files —
   not even whitespace, comment, import-order, or lint-autofix changes.
2. Do NOT bypass them: never call fetch/axios/nodemailer/resend SDKs directly
   from routes or components to send email. Every send MUST go through
   `sendEmail()` / `sendSms()` from `src/lib/notify.ts`.
3. Do NOT change the payload contract sent to the middleware relay. The
   working contract is exactly:
   `POST {EMAIL_MIDDLEWARE_URL}/sendMail` with
   `{ api: <shared token>, system: "DOST-MIRDC Recruitment", from, replyTo, to, subject, message: <RAW HTML>, text? }`
   — the HTML goes in the `message` field (never an `html` field; that flips
   the relay into its escaping EJS template), and `replyTo` must be passed
   through to nodemailer.
4. Do NOT change identity headers: From / Reply-To are
   `"MIRDC HR Office" <recruitment@mirdc.dost.gov.ph>` (overridable only via
   `EMAIL_FROM` / `EMAIL_REPLY_TO` env vars, not in code).
5. Do NOT alter the HARD CONTRACT that `sendEmail` / `sendSms` NEVER throw —
   callers fire them post-success, fire-and-forget. Adding throw behavior or
   awaiting them mid-transaction breaks the flow they support.
6. Do NOT switch providers in `.env` on a working deployment
   (`EMAIL_PROVIDER=middleware` is REQUIRED in production — see DEPLOYMENT.md).

### Tier 2 — EMAIL CALLERS (do not touch the email-related paths)

These routes legitimately call the sender. Modifying their email logic
(recipient resolution, template selection, payload assembly, timing) is
FORBIDDEN without explicit human approval. Unrelated changes inside them must
not restructure the `sendEmail(...)` call sites.

- `src/app/api/auth/register/route.ts` (signup OTP email)
- `src/app/api/auth/resend-otp/route.ts`
- `src/app/api/auth/forgot-password/route.ts`
- `src/lib/otp.ts` (issues the verification code handed to the sender)
- `src/app/api/evaluator/applications/[id]/notice/route.ts`
- `src/app/api/evaluator/applications/[id]/email/route.ts`
- `src/app/api/evaluator/applications/[id]/route.ts` (status-change notices)
- `src/app/api/evaluator/applications/invitations/route.ts`
- `src/app/api/evaluator/applications/regrets/route.ts`
- `src/app/api/admin/email/route.ts`

### Tier 3 — CONFIG (do not touch values)

`.env` / `.env.example` email block:
`EMAIL_PROVIDER`, `EMAIL_MIDDLEWARE_URL`, `EMAIL_MIDDLEWARE_API_KEY`,
`EMAIL_MIDDLEWARE_SYSTEM`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `RESEND_API_KEY`,
`SMS_PROVIDER`.
Also protected: any `*.db` file under `db/` (live data — never commit, never
overwrite).

---

## ✅ What you MAY do without asking

- READ any of the protected files to understand behavior.
- Add NEW files that import from `notify.ts` (e.g., a new notice template in a
  separate module is fine as long as delivery still goes through `sendEmail`).
- Add a NEW provider behind a NEW `EMAIL_PROVIDER` value in a NEW file —
  never by editing the existing dispatch in `notify.ts`.
- Fix a caller's non-email bug (validation, auth) while leaving every
  `sendEmail` call site byte-identical.

## 🛑 What you MUST NOT do (no approval will be assumed)

- Any write to Tier 1 files, including via scripts, codemods, AI batch edits,
  or "modernization" passes.
- Renames/moves of exported symbols from `notify.ts`
  (`sendEmail`, `sendSms`, `getEmailProviderId`, `RECRUITMENT_EMAIL_ADDRESS`,
  `RECRUITMENT_SENDER_NAME`, `RECRUITMENT_REPLY_TO`, template builders).
- Deleting or "temporarily disabling" OTP email verification.
- Committing secrets (`.env`, middleware API keys) or DB files.

## ⚠️ If a change to the email sender is genuinely required

1. STOP. Do not edit anything.
2. Explain to the human operator exactly what needs to change and why.
3. Proceed ONLY after explicit approval in the conversation.
4. After an approved change: smoke-test the full path before reporting done —
   trigger a real send (e.g., a signup OTP with `EMAIL_PROVIDER=middleware`,
   or mock mode + verify a `email_logs` row with the expected payload),
   confirm From/Reply-To headers, and confirm the ledger entry.
5. Append a dated entry to `worklog.md` describing what changed and the
   approval that authorized it.

---

## Other standing rules

- Never run destructive DB commands (`prisma migrate reset`, `db:push --accept-data-loss`
  against `db/production-data.db`) without asking.
- `INTRANET_ENFORCEMENT` must stay `on` in real deployments; `off` is only for
  local sandbox/preview runs.
- Record multi-step work in `worklog.md` (append-only) as per existing entries.
