# RUNBOOK — OTP-outage account activation & apology notice (2026-10-22 incident)

## Incident summary

On 2026-10-22 (≈18:11 Manila → 09:40 Manila next day) the mail middleware on the
office VM returned `500 Internal server error` for every send. Applicants who
registered during the window had their signup verification codes silently fail
(fire-and-forget design — registration itself succeeded), so their accounts sit
at `confirmed = 0` and the login gate answers
`403 "Please verify your email first"`.

Production data (verified 2026-10-23): **46 APPLICANT accounts** are unconfirmed,
and **every one of them has only FAILED otp_signup emails and zero successful
sends** — a perfect 1:1 match with the outage. No unconfirmed account exists
outside the outage signature.

Remediation (user-approved plan): activate those accounts so they can sign in
with the password they chose (no code needed), then email each of them an
apology + sign-in link + forgot-password pointer.

## Artifacts

1. `deploy/activate-otp-outage-accounts.py` — Python 3 stdlib only (no pip), reads
   the app `.env` itself for middleware credentials (no secrets on the CLI).

- Default (no flags) = **dry run**: prints the cohort, changes nothing.
- `--apply`  → online SQLite backup to `backups/manual/<ts>-pre-otp-activation.db`,
  then one transaction: `User.confirmed = 0→1` for the cohort + one
  `AuditLog(action='ACCOUNT_ACTIVATED_OTP_OUTAGE')` row per account.
- `--notify` → apology email via the middleware `POST /sendMail` driver
  (identical contract to `src/lib/notify.ts`), one `EmailLog(relatedType=
  'OTP_OUTAGE_NOTICE')` row per attempt, 1.5 s between sends, one retry.
  Targets **only** accounts activated by `--apply` (audit-marker based), and
  skips addresses that already have a sent/mock notice → idempotent.
- Filters: `--include a@x,c@y` · `--exclude a@x` · `--limit N` · `--csv FILE`.
- `--all-unconfirmed` widens the cohort (NOT needed for this incident).
- Guards: never touches staff accounts or blocked accounts; refuses localhost
  app URLs unless `--allow-localhost`; refuses non-interactive mutating runs
  without `--yes`.

2. `deploy/remap-account-email.py` — one-transaction email remap across
   `User.email` + `Applicant.emailAddress` + `EmailLog."to"` +
   `AuditLog.userLabel`, with uniqueness guards. Used in Step 0 to point the
   owner's self-test account at their real inbox so it doubles as the
   deliverability canary. (Remapping the EmailLog rows is REQUIRED — the
   activation cohort is matched on current `User.email` vs EmailLog history;
   changing only the account would silently drop it.)

## Execution (server)

App root: `/home/rmis-mirdc/Desktop/rmis-latestversion` · DB:
`db/production-data.db` · PM2 process: `rmis`.

```bash
# 0. Sync BOTH scripts (tarball -> server .tmp/, md5 check, extract, copy to
#    deploy/). Expected md5s are recorded in worklog.md Task 86 / 87.

cd /home/rmis-mirdc/Desktop/rmis-latestversion

# 1. Point the owner's self-test account at the real inbox (deliverability
#    canary). Idempotent; refuses if the target address already exists.
python3 deploy/remap-account-email.py sample@gmail.com semajram01@gmail.com --yes

# 2. DRY RUN — expect 46 rows with semajram01@gmail.com last; keep a CSV
python3 deploy/activate-otp-outage-accounts.py --csv /tmp/otp-outage-cohort.csv

# 3. ACTIVATE (writes its own online backup first)
python3 deploy/activate-otp-outage-accounts.py --apply --yes

# 4. CANARY — send ONLY to the owner first; verify it lands in the inbox
#    (and check spam) before continuing
python3 deploy/activate-otp-outage-accounts.py --notify \
    --include semajram01@gmail.com --app-url "https://<PUBLIC-RMIS-URL>" --yes

# 5. FULL notice run — the canary is auto-skipped (already sent); ~70 s for
#    the remaining 45; failed sends retry on re-run
python3 deploy/activate-otp-outage-accounts.py --notify \
    --app-url "https://<PUBLIC-RMIS-URL>" --yes

# 6. Post-checks
curl --fail http://127.0.0.1:3000/api/health
sqlite3 not installed — use: python3 -c "import sqlite3;con=sqlite3.connect('db/production-data.db');print(con.execute(\"SELECT confirmed,COUNT(*) FROM User WHERE role='APPLICANT' GROUP BY confirmed\").fetchall())"
#    expect [(1, 94)] (or [(1, <94+n>)] after any new registrations)
```

No `pm2 restart` is required — this is a pure data change; the running app
picks it up on the next request.

## Review before activating (for awareness)

- The owner's canary account `semajram01@gmail.com` (username `sample`,
  remapped in Step 0) is part of the cohort by design — it validates real
  delivery.
- Duplicate-person pairs (both accounts belong to the same applicant):
  castrojhuliavictoria / castrojhulivictoria, angelsabordo19 / anglsabordo,
  janderbarandapro / jander.baranda.pro, jmlanon / lanonjohndave06,
  maddatuv / ismaddatu, ricarte.jovielynns / ravenkozumeyt,
  cristina.abanto12 / cnorioste8. Activating both is harmless — the person
  signs in to whichever they registered. No action needed, listed for awareness.

## Rollback

```bash
cp backups/manual/<ts>-pre-otp-activation.db db/production-data.db
pm2 restart rmis   # only if the app was restarted in between
```

(The audit rows / notice EmailLog rows from the script would remain — cosmetic
only; or restore from the same nightly `backups/` chain instead.)

## Audit trail produced

- `AuditLog.action = 'ACCOUNT_ACTIVATED_OTP_OUTAGE'` — one row per activated
  account (visible in the admin audit view, actor SYSTEM).
- `EmailLog.relatedType = 'OTP_OUTAGE_NOTICE'` — one row per notice attempt.
- Backup: `backups/manual/<ts>-pre-otp-activation.db`.

## Explicitly out of scope (unchanged)

- `src/lib/notify.ts` and `deploy/mirdc_middleware/*` remain Tier-1 frozen.
- No application-code change: register-creates-account-before-verification is
  the intended Task 30-b design; the outage was a delivery failure, and the
  resend affordance already exists in the sign-in view for future cases.
- The 5 failed password-reset emails in the log are all inside the cohort —
  covered by the notice's forgot-password pointer; no separate action.
