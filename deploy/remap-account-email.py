#!/usr/bin/env python3
# ============================================================================
# RMIS — account email remap (ops script, stdlib only).
#
# Remaps an account's email address EVERYWHERE it matters, in one transaction:
#   User.email            (login identity — must not collide, checked first)
#   User.updatedAt        (Prisma @updatedAt parity)
#   Applicant.emailAddress (the linked applicant profile's contact email)
#   EmailLog."to"         (historical sends — keeps cohort-matching logic and
#                          the email audit trail coherent with the new address)
#   AuditLog.userLabel    (display label on the account's audit rows)
#
# WHY: the OTP-outage activation script (deploy/activate-otp-outage-
# accounts.py) matches the cohort via EmailLog rows joined on the CURRENT
# User.email. Changing only User.email would silently drop the account from
# that cohort — so historical log addresses are remapped too.
#
# Usage:
#   python3 remap-account-email.py OLD_EMAIL NEW_EMAIL [--db PATH] [--yes]
#
# Guards: refuses when NEW already exists as a User (case-insensitive);
# refuses when OLD does not exist as a User; single transaction (all-or-
# nothing); the USERNAME is intentionally left unchanged (login by email
# works either way; the script prints the current username for reference).
# ============================================================================

import argparse
import sqlite3
import sys
import time


def main():
    ap = argparse.ArgumentParser(description="Remap an RMIS account email across User, Applicant, EmailLog and AuditLog.")
    ap.add_argument("old_email")
    ap.add_argument("new_email")
    ap.add_argument("--db", default=None, help="SQLite db path (default <app-root>/db/production-data.db)")
    ap.add_argument("--app-root", default="/home/rmis-mirdc/Desktop/rmis-latestversion")
    ap.add_argument("--yes", action="store_true", help="skip interactive confirmation")
    args = ap.parse_args()

    old, new = args.old_email.strip().lower(), args.new_email.strip().lower()
    if "@" not in old or "@" not in new:
        sys.exit("ERROR: both addresses must be valid emails.")
    if old == new:
        sys.exit("ERROR: addresses are identical — nothing to do.")
    db = args.db or f"{args.app_root}/db/production-data.db"

    con = sqlite3.connect(db, timeout=30.0)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    user = cur.execute(
        "SELECT id, username, email, role, confirmed FROM User WHERE LOWER(email)=?", (old,)
    ).fetchone()
    if not user:
        sys.exit(f"ERROR: no User with email {old} — nothing to remap.")
    clash = cur.execute(
        "SELECT id, username, role FROM User WHERE LOWER(email)=?", (new,)
    ).fetchone()
    if clash:
        sys.exit(f"ERROR: {new} already belongs to user '{clash['username']}' ({clash['role']}) — refusing.")

    counts = {
        "User": cur.execute(
            "SELECT COUNT(*) FROM User WHERE LOWER(email)=?", (old,)
        ).fetchone()[0],
        "Applicant": cur.execute(
            "SELECT COUNT(*) FROM Applicant WHERE LOWER(emailAddress)=?", (old,)
        ).fetchone()[0],
        'EmailLog("to")': cur.execute(
            'SELECT COUNT(*) FROM EmailLog WHERE LOWER("to")=?', (old,)
        ).fetchone()[0],
        "AuditLog(userLabel)": cur.execute(
            "SELECT COUNT(*) FROM AuditLog WHERE LOWER(userLabel)=?", (old,)
        ).fetchone()[0],
    }

    print(f"Remap {old}  ->  {new}")
    print(f"  account: username='{user['username']}' role={user['role']} confirmed={user['confirmed']} id={user['id']}")
    for k, v in counts.items():
        print(f"  {k}: {v} row(s)")

    if not args.yes:
        if not sys.stdin.isatty():
            sys.exit("ERROR: non-interactive shell — re-run with --yes to proceed.")
        if input("\nType YES to remap: ").strip() != "YES":
            sys.exit("Aborted — nothing was changed.")

    con.execute("BEGIN IMMEDIATE")
    try:
        cur.execute("UPDATE User SET email=?, updatedAt=? WHERE LOWER(email)=?",
                    (new, int(time.time() * 1000), old))
        cur.execute("UPDATE Applicant SET emailAddress=? WHERE LOWER(emailAddress)=?", (new, old))
        cur.execute('UPDATE EmailLog SET "to"=? WHERE LOWER("to")=?', (new, old))
        cur.execute("UPDATE AuditLog SET userLabel=? WHERE LOWER(userLabel)=?", (new, old))
        con.commit()
    except Exception:
        con.rollback()
        raise

    print("\nDone — remap committed:")
    print(f"  {old} -> {new}")
    print(f"  login by email now uses {new}; username stays '{user['username']}'.")
    con.close()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit("\nInterrupted — nothing was changed.")
