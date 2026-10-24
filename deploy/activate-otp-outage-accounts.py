#!/usr/bin/env python3
# ============================================================================
# RMIS — OTP-outage account activation & apology mailer (ops script).
#
# WHY THIS EXISTS
#   On 2026-10-22 the MIRDC mail middleware went down for several hours while
#   a high volume of applicants registered. Register (Task 30-b) creates the
#   User row immediately with confirmed=false and emails a 6-digit code
#   fire-and-forget; with the middleware down every signup code email failed,
#   so those applicants are stuck at the login gate ("Please verify your
#   email first"). This script remediation:
#     1. finds APPLICANT accounts that are still unconfirmed AND whose signup
#        verification emails ALL failed (never one successful send),
#     2. (--apply)   flips them to confirmed=true — they can then sign in
#        with the password they chose, no code needed — and writes an
#        AuditLog row per account,
#     3. (--notify)  emails each activated account an apology with the
#        sign-in link and the forgot-password pointer, logging every attempt
#        into EmailLog (relatedType 'OTP_OUTAGE_NOTICE').
#
# SAFETY MODEL
#   - Default (no flags) is a pure DRY RUN: prints the cohort, writes nothing.
#   - Only APPLICANT role is ever touched. Staff accounts are unreachable.
#   - Blocked accounts are never activated.
#   - --apply takes an online SQLite backup first (backups/manual/…).
#   - Idempotent: re-running --apply finds nothing; re-running --notify
#     re-sends only to addresses without a sent/mock notice.
#   - Email sending mirrors src/lib/notify.ts "middleware" driver exactly:
#     POST {EMAIL_MIDDLEWARE_URL}/sendMail {api, system, from, replyTo, to,
#     subject, message(html), text}. Config is read from the app .env —
#     no secrets on the command line. If EMAIL_PROVIDER is not "middleware"
#     (or the URL is unset) the script logs mock rows instead of sending —
#     safe for rehearsals.
#
# Python 3.6+ stdlib only (server has no sqlite3 CLI; python3 is present).
# Never modifies application code — notify.ts / middleware remain untouched.
# ============================================================================

import argparse
import csv
import json
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

DEFAULT_APP_ROOT = "/home/rmis-mirdc/Desktop/rmis-latestversion"
AUDIT_ACTION = "ACCOUNT_ACTIVATED_OTP_OUTAGE"
NOTICE_RELATED = "OTP_OUTAGE_NOTICE"
SENDER_NAME = "MIRDC HR Office"  # mirrors notify.ts RECRUITMENT_SENDER_NAME


# ────────────────────────────────────────────────────────────── small helpers

def now_ms():
    return int(time.time() * 1000)


def iso(ms):
    return datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def parse_env(path):
    """Minimal .env parser: KEY=VALUE lines, strips surrounding quotes."""
    env = {}
    if not os.path.isfile(path):
        return env
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key:
                env[key] = val
    return env


# ───────────────────────────────────────────────────────────────── cohort SQL

# Cohort = unconfirmed, unblocked APPLICANT accounts whose signup OTP emails
# ALL failed (>=1 failed otp_signup send, zero sent). The three-part
# partition (failed-only / sent-at-least-once / no-log) was verified against
# production data on 2026-10-23: 46 / 0 / 0 — zero ambiguity.
COHORT_SQL = """
SELECT u.id, u.username, u.email, u.firstName, u.lastName,
       u.createdAt AS registered_at,
       (SELECT COUNT(*) FROM EmailLog f
         WHERE LOWER(f."to") = LOWER(u.email)
           AND f.relatedType = 'otp_signup' AND f.status = 'failed'
       ) AS failed_sends,
       (SELECT MAX(e2.createdAt) FROM EmailLog e2
         WHERE LOWER(e2."to") = LOWER(u.email)
           AND e2.relatedType = 'otp_signup' AND e2.status = 'failed'
       ) AS last_failure_at
FROM User u
WHERE u.role = 'APPLICANT' AND u.confirmed = 0 AND u.blocked = 0
  AND EXISTS (SELECT 1 FROM EmailLog e1
               WHERE LOWER(e1."to") = LOWER(u.email)
                 AND e1.relatedType = 'otp_signup' AND e1.status = 'failed')
  AND NOT EXISTS (SELECT 1 FROM EmailLog e6
               WHERE LOWER(e6."to") = LOWER(u.email)
                 AND e6.relatedType = 'otp_signup' AND e6.status = 'sent')
ORDER BY u.createdAt
"""

# Wider variant (--all-unconfirmed): every unconfirmed unblocked APPLICANT,
# regardless of email evidence.
ALL_UNCONFIRMED_SQL = """
SELECT u.id, u.username, u.email, u.firstName, u.lastName,
       u.createdAt AS registered_at,
       (SELECT COUNT(*) FROM EmailLog f
         WHERE LOWER(f."to") = LOWER(u.email)
           AND f.relatedType = 'otp_signup' AND f.status = 'failed'
       ) AS failed_sends,
       (SELECT MAX(e2.createdAt) FROM EmailLog e2
         WHERE LOWER(e2."to") = LOWER(u.email)
           AND e2.relatedType = 'otp_signup' AND e2.status = 'failed'
       ) AS last_failure_at
FROM User u
WHERE u.role = 'APPLICANT' AND u.confirmed = 0 AND u.blocked = 0
ORDER BY u.createdAt
"""

# --notify pass: accounts already activated by this script (audit marker),
# excluding addresses that already received a sent/mock notice.
NOTIFY_TARGETS_SQL = """
SELECT u.id, u.username, u.email, u.firstName, u.lastName
FROM User u
WHERE u.role = 'APPLICANT'
  AND EXISTS (SELECT 1 FROM AuditLog a
               WHERE a.action = :audit_action
                 AND a.entityType = 'User' AND a.entityId = u.id)
  AND NOT EXISTS (SELECT 1 FROM EmailLog n
               WHERE LOWER(n."to") = LOWER(u.email)
                 AND n.relatedType = :notice
                 AND n.status IN ('sent', 'mock'))
ORDER BY u.username
"""


def connect(db_path):
    if not os.path.isfile(db_path):
        sys.exit(f"ERROR: database not found: {db_path}")
    con = sqlite3.connect(db_path, timeout=30.0)
    con.row_factory = sqlite3.Row
    return con


def stats(con):
    row = con.execute(
        "SELECT COUNT(*) total, "
        "SUM(CASE WHEN confirmed=1 THEN 1 ELSE 0 END) confirmed, "
        "SUM(CASE WHEN confirmed=0 THEN 1 ELSE 0 END) unconfirmed "
        "FROM User WHERE role='APPLICANT'"
    ).fetchone()
    return row


def print_cohort(rows):
    print(f"  {'#':>3}  {'username':<26} {'email':<34} {'registered':<20} fails")
    for i, r in enumerate(rows, 1):
        print(f"  {i:>3}  {r['username']:<26} {r['email']:<34} "
              f"{iso(r['registered_at']):<20} {r['failed_sends']}")


def filter_rows(rows, include, exclude, limit):
    out = []
    for r in rows:
        if include and r["email"].lower() not in include:
            continue
        if exclude and r["email"].lower() in exclude:
            continue
        out.append(r)
    if limit is not None:
        out = out[:limit]
    return out


def split_list(val):
    if not val:
        return set()
    return {x.strip().lower() for x in val.split(",") if x.strip()}


# ─────────────────────────────────────────────────────────────────── apply

def do_apply(args, con, rows):
    ts = now_ms()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    backup_dir = os.path.join(args.app_root, "backups", "manual")
    os.makedirs(backup_dir, exist_ok=True)
    backup_path = os.path.join(backup_dir, f"{stamp}-pre-otp-activation.db")
    print(f"\nOnline backup -> {backup_path}")
    src = sqlite3.connect(args.db, timeout=30.0)
    dst = sqlite3.connect(backup_path)
    with dst:
        src.backup(dst)
    dst.close()
    src.close()
    print("Backup done.")

    print(f"\nActivating {len(rows)} account(s) …")
    cur = con.cursor()
    con.execute("BEGIN IMMEDIATE")
    try:
        for r in rows:
            cur.execute(
                "UPDATE User SET confirmed = 1, updatedAt = ? WHERE id = ? "
                "AND role='APPLICANT' AND confirmed = 0",
                (ts, r["id"]),
            )
            if cur.rowcount != 1:
                raise RuntimeError(f"unexpected rowcount {cur.rowcount} for {r['email']}")
            cur.execute(
                "INSERT INTO AuditLog (timestamp, userId, userLabel, userRole, "
                "action, entityType, entityId, description, ipAddress) "
                "VALUES (?,?,?,?,?,?,?,?,NULL)",
                (
                    ts,
                    r["id"],
                    r["email"],
                    "SYSTEM",
                    AUDIT_ACTION,
                    "User",
                    r["id"],
                    "Account activated without OTP verification — the signup "
                    f"verification email failed {r['failed_sends']} time(s) during "
                    "the mail-middleware outage (high application volume); "
                    "remediation via deploy/activate-otp-outage-accounts.py --apply",
                ),
            )
        con.commit()
    except Exception:
        con.rollback()
        raise
    print(f"Done: {len(rows)} account(s) activated, {len(rows)} audit rows written.")


# ────────────────────────────────────────────────────────────────── notify

def build_email(r, signin_url, app_url):
    first = (r["firstName"] or "").strip() or "there"
    subject = "Your RMIS account is now active"

    text = (
        f"Hi {first},\n\n"
        "Recently our recruitment email system experienced a technical issue "
        "because of the very high volume of registration requests, and the "
        "verification code for your RMIS account could not be delivered to "
        "your inbox. We sincerely apologize for the trouble.\n\n"
        "Good news: your account has already been verified and activated — "
        "no verification code is needed anymore.\n\n"
        "You can sign in right away using your email "
        f"({r['email']}) or your username ({r['username']}) together with "
        "the password you created:\n\n"
        f"  {signin_url}\n\n"
        "If you forgot your password, open the sign-in page above and click "
        "\"Forgot password?\" — we will email you a secure reset link.\n\n"
        "Once signed in you can complete your profile and apply for open "
        "positions.\n\n"
        "MIRDC Human Resources"
    )

    link = f"{app_url}/#/signin"
    html = (
        '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;'
        'margin:0 auto;padding:24px;">'
        '<h2 style="color:#1f2025;font-size:18px;margin:0 0 16px;">'
        'Your RMIS account is now active</h2>'
        f'<p style="color:#484758;font-size:14px;line-height:1.6;">Hi {first},</p>'
        '<p style="color:#484758;font-size:14px;line-height:1.6;">Recently our '
        'recruitment email system experienced a technical issue because of the '
        'very high volume of registration requests, and the verification code '
        'for your RMIS account could not be delivered to your inbox. '
        'We sincerely apologize for the trouble.</p>'
        '<p style="color:#484758;font-size:14px;line-height:1.6;">Good news: '
        '<strong>your account has already been verified and activated</strong> '
        '— no verification code is needed anymore.</p>'
        '<p style="color:#484758;font-size:14px;line-height:1.6;">You can sign '
        'in right away using your email or your username together with the '
        'password you created:</p>'
        f'<p style="margin:20px 0;"><a href="{link}" '
        'style="background:#1f2025;color:#ebf0f8;padding:12px 24px;'
        'border-radius:999px;text-decoration:none;font-size:14px;">'
        'Sign in to RMIS</a></p>'
        '<p style="color:#8a8a99;font-size:12px;line-height:1.6;">If the '
        f'button does not work, copy this link into your browser:<br>{link}</p>'
        '<p style="color:#484758;font-size:14px;line-height:1.6;">If you '
        'forgot your password, click <strong>"Forgot password?"</strong> on '
        'the sign-in page and we will email you a secure reset link.</p>'
        '<p style="color:#484758;font-size:14px;line-height:1.6;">Once signed '
        'in you can complete your profile and apply for open positions.</p>'
        '<p style="color:#8a8a99;font-size:12px;">MIRDC Human Resources</p>'
        '</div>'
    )
    return subject, text, html


def send_via_middleware(env, to, subject, text, html, from_email, reply_to):
    url = env.get("EMAIL_MIDDLEWARE_URL", "").rstrip("/")
    payload = {
        "api": env.get("EMAIL_MIDDLEWARE_API_KEY", ""),
        "system": env.get("EMAIL_MIDDLEWARE_SYSTEM", "") or "DOST-MIRDC Recruitment",
        "from": f'"{SENDER_NAME}" <{from_email}>',
        "replyTo": f'"{SENDER_NAME}" <{reply_to}>',
        "to": to,
        "subject": subject,
        "message": html,
        "text": text,
    }
    data = json.dumps(payload).encode("utf-8")
    last_err = None
    for attempt in (1, 2):
        try:
            req = urllib.request.Request(
                f"{url}/sendMail",
                data=data,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=15) as res:
                body = res.read().decode("utf-8", "replace")
                if 200 <= res.status < 300:
                    try:
                        ref = json.loads(body).get("messageId") or "middleware"
                    except Exception:
                        ref = "middleware"
                    return "sent", None, ref
                last_err = f"Middleware {res.status}: {body[:200]}"
        except Exception as e:  # noqa: BLE001 — deliberate broad net for ops log
            last_err = str(e)
        if attempt == 1:
            time.sleep(2)
    return "failed", last_err, None


def do_notify(args, con, rows, env):
    provider = (env.get("EMAIL_PROVIDER") or "mock").strip().lower()
    from_email = env.get("EMAIL_FROM") or "recruitment@mirdc.dost.gov.ph"
    reply_to = env.get("EMAIL_REPLY_TO") or from_email
    live = provider == "middleware" and bool(env.get("EMAIL_MIDDLEWARE_URL"))

    app_url = (args.app_url or env.get("APP_ORIGIN") or env.get("NEXTAUTH_URL") or "").rstrip("/")
    if not app_url:
        sys.exit("ERROR: no app URL. Pass --app-url https://your-rmis-host (or set APP_ORIGIN in .env).")
    if ("localhost" in app_url or "127.0.0.1" in app_url) and not args.allow_localhost:
        sys.exit(f"ERROR: app URL '{app_url}' is local. Pass the PUBLIC url, or add --allow-localhost for a rehearsal.")
    signin_url = f"{app_url}/#/signin"

    mode = "LIVE (middleware)" if live else "MOCK (logs only, nothing is emailed)"
    print(f"\nEmail mode: {mode}    app url: {app_url}")
    print(f"Sending {len(rows)} notice(s) …")

    sent = failed = 0
    for i, r in enumerate(rows, 1):
        subject, text, html = build_email(r, signin_url, app_url)
        if live:
            status, error, ref = send_via_middleware(
                env, r["email"], subject, text, html, from_email, reply_to
            )
        else:
            status, error, ref = "mock", None, "mock"
        con.execute(
            'INSERT INTO EmailLog ("to", subject, bodyText, bodyHtml, provider, '
            'status, providerRef, error, relatedType, relatedId, attachments, createdAt) '
            "VALUES (?,?,?,?,?,?,?,?,?,NULL,NULL,?)",
            (
                r["email"], subject, text, html,
                "middleware" if live else "mock",
                status, ref, error, NOTICE_RELATED, now_ms(),
            ),
        )
        con.commit()
        if status in ("sent", "mock"):
            sent += 1
            print(f"  [{i}/{len(rows)}] {r['email']}: {status}")
        else:
            failed += 1
            print(f"  [{i}/{len(rows)}] {r['email']}: FAILED — {error}")
        if live and i < len(rows):
            time.sleep(1.5)  # gentle on the relay

    print(f"\nDone: {sent} notice(s) logged {('and sent' if live else '(mock)')}, {failed} failure(s).")
    if failed:
        print("Re-run --notify later — failed addresses are retried automatically.")


# ──────────────────────────────────────────────────────────────────── main

def main():
    ap = argparse.ArgumentParser(
        description="Activate RMIS accounts whose signup verification email failed "
                    "during the middleware outage, and/or email them an apology "
                    "with sign-in instructions."
    )
    ap.add_argument("--app-root", default=DEFAULT_APP_ROOT,
                    help=f"application root (default {DEFAULT_APP_ROOT})")
    ap.add_argument("--db", default=None,
                    help="SQLite db path (default <app-root>/db/production-data.db)")
    ap.add_argument("--env", default=None,
                    help="app .env path (default <app-root>/.env)")
    ap.add_argument("--apply", action="store_true",
                    help="activate the matched accounts (default: dry run)")
    ap.add_argument("--notify", action="store_true",
                    help="email the apology/sign-in notice to accounts activated by --apply")
    ap.add_argument("--app-url", default=None,
                    help="public base URL used in the notice link (or APP_ORIGIN/.env)")
    ap.add_argument("--allow-localhost", action="store_true",
                    help="permit a localhost app URL (rehearsals only)")
    ap.add_argument("--all-unconfirmed", action="store_true",
                    help="widen the cohort to ALL unconfirmed applicants (not just failed-email ones)")
    ap.add_argument("--include", default=None, help="comma list: only these addresses")
    ap.add_argument("--exclude", default=None, help="comma list: skip these addresses")
    ap.add_argument("--limit", type=int, default=None, help="process at most N accounts")
    ap.add_argument("--csv", default=None, help="write the matched cohort to this CSV path")
    ap.add_argument("--yes", action="store_true", help="skip the interactive confirmation")

    args = ap.parse_args()
    args.db = args.db or os.path.join(args.app_root, "db", "production-data.db")
    env_path = args.env or os.path.join(args.app_root, ".env")
    env = parse_env(env_path)

    include = split_list(args.include)
    exclude = split_list(args.exclude)

    con = connect(args.db)
    s = stats(con)
    print("=" * 78)
    print("RMIS — OTP-outage account activation")
    print("=" * 78)
    print(f"DB: {args.db}")
    print(f"Applicants: {s['total']}  |  confirmed: {s['confirmed']}  |  unconfirmed: {s['unconfirmed']}")

    mutating = args.apply or args.notify

    # ── apply pass
    if args.apply:
        rows = filter_rows(
            con.execute(ALL_UNCONFIRMED_SQL if args.all_unconfirmed else COHORT_SQL).fetchall(),
            include, exclude, args.limit,
        )
        print(f"\n--apply cohort: {len(rows)} account(s) "
              f"({'ALL unconfirmed' if args.all_unconfirmed else 'failed-OTP-email only'})")
        if rows:
            print_cohort(rows)
        else:
            print("Nothing to activate (already activated, or no matches).")
        if args.csv and rows:
            write_csv(args.csv, rows, activated=False)
        if rows:
            confirm_or_abort(args, f"activate {len(rows)} applicant account(s)")
            do_apply(args, con, rows)
        else:
            print("(no --apply work to do)")

    # ── notify pass — targets accounts activated by THIS script (audit
    #    marker), so the two passes compose in any order and --notify can
    #    never email someone who was not actually activated.
    if args.notify:
        base = con.execute(
            NOTIFY_TARGETS_SQL, {"audit_action": AUDIT_ACTION, "notice": NOTICE_RELATED}
        ).fetchall()
        rows = filter_rows(base, include, exclude, args.limit)
        print(f"\n--notify cohort: {len(rows)} account(s) pending notice")
        for r in rows:
            print(f"  - {r['email']}  ({r['firstName'] or ''} {r['lastName'] or ''})".rstrip())
        if not rows:
            print("No pending recipients. (Did you run --apply first? Notices target "
                  "accounts activated by this script.)")
        elif args.csv:
            write_csv(args.csv, rows, activated=True)
        if rows:
            confirm_or_abort(args, f"email {len(rows)} applicant(s) the activation notice")
            do_notify(args, con, rows, env)

    if not mutating:
        rows = filter_rows(
            con.execute(ALL_UNCONFIRMED_SQL if args.all_unconfirmed else COHORT_SQL).fetchall(),
            include, exclude, args.limit,
        )
        print(f"\nDRY RUN — matched cohort: {len(rows)} account(s)")
        if rows:
            print_cohort(rows)
        print("\nThis is a dry run — nothing was changed.")
        print("  Step 1 (activate):  python3 deploy/activate-otp-outage-accounts.py --apply")
        print("  Step 2 (apology mail): python3 deploy/activate-otp-outage-accounts.py --notify --app-url https://<public-rmis-url>")
        if args.csv and rows:
            write_csv(args.csv, rows, activated=False)

    con.close()


def write_csv(path, rows, activated):
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["username", "email", "first_name", "last_name",
                    "registered_at_utc", "failed_otp_sends", "last_failure_utc",
                    "activated"])
        for r in rows:
            w.writerow([
                r["username"], r["email"], r["firstName"] or "", r["lastName"] or "",
                iso(r["registered_at"]), r["failed_sends"],
                iso(r["last_failure_at"]) if r["last_failure_at"] else "",
                "yes" if activated else "",
            ])
    print(f"CSV written: {path}")


def confirm_or_abort(args, what):
    if args.yes:
        return
    if not sys.stdin.isatty():
        sys.exit("ERROR: refusing to run a changing action non-interactively without --yes.")
    answer = input(f"\nType YES to {what}: ").strip()
    if answer != "YES":
        sys.exit("Aborted — nothing was changed.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit("\nInterrupted — nothing further was changed.")
