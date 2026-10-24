# RUNBOOK — Email go-live preflight & outage recovery (mirdc_middleware)

> Companion to `deploy/mirdc_middleware/DEPLOY-NOTES.md` and DEPLOYMENT.md
> §0.4. Written 2026-10-23 after the 2026-10-22 18:11 (UTC+8) SMTP outage
> (139 emails hard-failed for 15+ hours while `/health` stayed green).
> Every check below is one curl or one UI click — run the whole list in
> under 5 minutes on deploy day, and again any time an applicant reports
> "no email arrived".

## 0. What talks to what

```
RMIS (office server)  --POST /sendMail-->  mirdc_middleware VM (10.10.120.43:3232)
      fetch, 15s abort                          nodemailer → smtp.gmail.com:465
      email_logs row per attempt                (systems@mirdc.dost.gov.ph)
                                                fire-and-forget log → 10.10.120.43:1404
```

- RMIS provider selection: `EMAIL_PROVIDER=middleware` + `EMAIL_MIDDLEWARE_URL`
  in the app `.env` (§0.2 of DEPLOYMENT.md). Missing URL = silent mock fallback
  in old builds — `/api/health` now reports it (see step 2).
- Failure semantics: relay down/500 → RMIS still answers the HTTP request
  (fire-and-forget) and records `status='failed'` with the error in
  `email_logs.error`. Registration/password-reset/notice flows NEVER block on
  email.

## 1. Preflight checklist (run top to bottom, in order)

### 1.1 Relay process up
From the RMIS server (or the VM itself):
```bash
curl -s http://10.10.120.43:3232/health
# EXPECT {"status":"ok","uptime":<seconds>}
```
- Timeout / connection refused → the relay process is down or the VM is
  unreachable: go to §3 step A.

### 1.2 SMTP session actually ready  ← the probe that would have caught Oct-22
```bash
curl -s 'http://10.10.120.43:3232/health?smtp=1'
# EXPECT {"status":"ok","uptime":…,"smtp":"ready"}
```
- `"smtp":"down (...)"` — the reason in parentheses is the SMTP server's own
  response (e.g. `535 · Username and Password not accepted`) or a
  connect/DNS error. Match it against the recovery table in §3 step B.
- `"down (probe timed out after 4s)"` — the socket connects but Gmail never
  completes the handshake (firewall/blackhole): §3 step B, row "timeout".

### 1.3 RMIS side is wired to the relay
```bash
curl -s https://<rmis-host>/api/health
# EXPECT checks.email == "ok"
#  "misconfigured (no EMAIL_MIDDLEWARE_URL …)" → .env missing the block (§3 step C)
#  "degraded (mock provider in production)"   → EMAIL_PROVIDER not "middleware"
```
And as admin (or EVALUATOR, read-only) in the UI:
**Settings ▸ Email Notices** — provider pill must read
**"Middleware — Configured"** (`GET /api/admin/email` →
`provider:"middleware", configured:true`).

### 1.4 Real delivery — staff test email
UI: **Settings ▸ Email Notices → Send test email** to a monitored staff inbox
(POST `/api/admin/email`; failure answers 502 with the SMTP reason inline).
Then verify the received mail:
- From: `DOST-MIRDC Recruitment <systems@mirdc.dost.gov.ph>` (relay pins From
  to the SMTP account — SPF/DKIM alignment)
- **Reply-To: `MIRDC HR Office <recruitment@mirdc.dost.gov.ph>`** (Task 14 —
  applicant replies must land in the recruitment mailbox)

### 1.5 Real delivery — applicant-door OTP
Register a REAL address through the applicant sign-up door. The code email
must arrive within seconds. Then:
```bash
# on the RMIS server
sqlite3 via app: email_logs latest row → provider=middleware, status=sent
```
(Applicants completing sign-up is the definitive end-to-end proof.)

## 2. Reading `email_logs.error` (what each string means)

| error string | meaning | action |
|---|---|---|
| `Middleware 500: {"error":"Internal server error (SMTP: 535 … Username and Password not accepted …)"}` | Gmail rejected the credentials — app password revoked (happens when the Google account password or 2FA changes) | §3 step B, row "auth" |
| `Middleware 500: … (SMTP: 550 5.4.5 … daily … quota …)` | mailbox sending quota exceeded (~24h Google block) | §3 step B, row "quota" |
| `Middleware 500: … (SMTP: …)` any other 4xx/5xx text | relay reachable, SMTP refused mid-session | read the code; §3 step B |
| `Middleware 500: {"error":"Internal server error"}` (bare, no SMTP reason) | relay is running the OLD index.js (pre-2026-10-23) — deploy the drop-in from `deploy/mirdc_middleware/` so future failures self-identify | §3 step D |
| `fetch failed` / timeout | RMIS cannot reach the relay VM at all (network/process) | §3 step A |
| `skipped — No valid recipient address` | data problem, not an outage | fix the recipient |

## 3. Recovery playbook

### Step A — relay process / network
```bash
# on the Windows VM (Remote-SSH / console)
pm2 list              # or however the process is supervised (§11 DEPLOYMENT.md)
pm2 logs <name> --lines 100     # the REAL SMTP stack traces land here
curl -s http://127.0.0.1:3232/health?smtp=1
```
- Process dead → start it; if it crash-loops, the console log names the cause
  (missing send-mail.html next to index.js, port busy, bad JSON in env…).

### Step B — SMTP credential / quota (the Oct-22 failure class)
The relay's console log (`pm2 logs`) shows the full nodemailer error. The
app password lives in the relay's env/hardcoded `SMTP_PASS` — it is a Google
**App Password** for `systems@mirdc.dost.gov.ph` and Google silently revokes
it when the account's password or 2FA settings change, and temporarily blocks
the account on quota/security triggers:

| symptom | fix |
|---|---|
| `535 … Username and Password not accepted` | Regenerate the app password in the Google account (Security ▸ 2-Step Verification ▸ App passwords), update `SMTP_PASS` (env override preferred over editing the file), restart the relay, re-probe `health?smtp=1` |
| `550 5.4.5` daily quota | Wait out the 24h block; meanwhile use the activation script for OTP cohorts (see RUNBOOK-otp-outage-activation.md) so applicants aren't stranded |
| `5xx … suspicious sign-in / blocked` | Google security review — sign in to the account from the VM's browser, confirm the activity |
| timeout / no route to host | VM egress firewall / DNS — escalate to IT |

After ANY fix: `curl -s 'http://127.0.0.1:3232/health?smtp=1'` until
`"smtp":"ready"`, then one real test email (§1.4) before announcing recovery.

### Step C — RMIS `.env` misconfiguration
`.env` must carry (§0.2 DEPLOYMENT.md):
```
EMAIL_PROVIDER=middleware
EMAIL_MIDDLEWARE_URL=http://10.10.120.43:3232
EMAIL_MIDDLEWARE_API_KEY=<shared relay token>
EMAIL_MIDDLEWARE_SYSTEM=DOST-MIRDC Recruitment
```
Restart the app after any `.env` change, re-run §1.3.

### Step D — relay runs the old index.js
The pre-2026-10-23 relay hides SMTP reasons. Copy the current drop-in to the
VM (`deploy/mirdc_middleware/index.js` — zero new dependencies, reads
`./send-mail.html` from its own directory exactly like the original), restart,
and confirm `GET /health` unchanged + `GET /health?smtp=1` answers. Detailed
behavior table: `deploy/mirdc_middleware/DEPLOY-NOTES.md`.

## 4. After a partial outage — clearing the backlog

- OTP sign-up cohort: `deploy/RUNBOOK-otp-outage-activation.md` (activate +
  apology notice; idempotent).
- Password resets: users simply retry "Forgot password" — no backlog tool
  needed (each attempt sends a fresh, valid token).
- Staff notices (shortlist/interview/regret/status): re-send from the reviewer
  UI per application (the notice form re-fires sendEmail; a fresh ledger row
  is written). There is no bulk resend by design — notices carry per-
  applicant detail and staff should confirm each before re-firing.

## 5. Verification log

| date | check | result |
|---|---|---|
| 2026-09-29 | relay updated + smoke-tested on VM (`GET /health` → ok) | PASS (DEPLOYMENT.md §0.4) |
| 2026-10-23 | hardened drop-in (probe + enriched 500 + timeouts) verified against a local SMTP sink: legacy contract, RMIS contract (From/Reply-To/text part), `health?smtp=1` ready/down paths, enriched failure body, legacy 400 untouched | PASS (worklog Task 92) |
