# Run RMIS (latest version)

This guide builds and runs the latest RMIS checkout on this machine:

```text
/home/rmis-mirdc/Desktop/rmis-latestversion
```

The production SQLite database path is `db/production-data.db`. Do not use
`db/custom.db` for a production run. Keep the root `.env` file private; do not
copy its contents into chat, logs, or this guide.

## Fresh setup

Run these commands from a terminal on the host:

```bash
cd /home/rmis-mirdc/Desktop/rmis-latestversion

npm install

mkdir -p db
mkdir -p upload
DATABASE_URL="file:$PWD/db/production-data.db" npx prisma generate

# Fresh database only. This creates the schema in a new, empty database.
# Never run db push against an existing database containing data.
if [ ! -e db/production-data.db ]; then
  DATABASE_URL="file:$PWD/db/production-data.db" npx prisma db push
fi

DATABASE_URL="file:$PWD/db/production-data.db" npm run build

# Next.js standalone needs the runtime settings as well as the build settings.
cp .env .next/standalone/.env
```

Ensure `.env` contains the environment-specific secrets and service settings
required by the deployment. The start command below explicitly sets
`DATABASE_URL`, `INTRANET_ENFORCEMENT`, `PORT`, `HOSTNAME`, and `NODE_ENV`.

## Start with PM2

This replaces only the PM2 process named `rmis`, if one exists:

```bash
cd /home/rmis-mirdc/Desktop/rmis-latestversion

pm2 delete rmis 2>/dev/null || true

INTRANET_ENFORCEMENT=on \
DATABASE_URL="file:$PWD/db/production-data.db" \
UPLOAD_DIR="$PWD/upload" \
PORT=3000 \
HOSTNAME=0.0.0.0 \
NODE_ENV=production \
pm2 start "$PWD/.next/standalone/server.js" \
  --name rmis \
  --cwd "$PWD" \
  --update-env

pm2 save
```

Check that the process is online and the application and database are healthy:

```bash
pm2 status
curl --fail --show-error http://127.0.0.1:3000/api/health
```

A healthy response looks like:

```json
{"status":"healthy","checks":{"app":"ok","database":"ok","email":"ok"}}
```

The `email` check reports the configured provider's readiness — a misconfigured
relay (`EMAIL_PROVIDER=middleware` without `EMAIL_MIDDLEWARE_URL`) degrades the
response to `status:"degraded"` (HTTP 503) so the deployment curl catches it
before the first OTP is supposed to go out.

## Uploaded files (UPLOAD_DIR) — read this before rebuilding

Applicant documents (PDFs, images, PDS spreadsheets, profile pictures) are
stored on disk under `upload/<applicantId>/<file>`, with the path recorded in
the database. `UPLOAD_DIR` pins WHERE that directory lives, exactly like
`DATABASE_URL` pins the database. It must always point OUTSIDE `.next`:

- v4.1–v4.3 resolved uploads against the process working directory, which in
  standalone mode is `.next/standalone` — so `next build` **destroyed every
  uploaded file** on each rebuild while the database rows survived. This is
  the Oct 2026 incident (review queue showed file metadata, every PDF/image
  view returned 404; only files uploaded since the last rebuild survived).
- v4.3+ (Task 73) honors `UPLOAD_DIR` and falls back to `<deploy root>/upload`
  when unset. The PM2 block above pins it explicitly.
- Serving/deletion also probe the legacy locations, so files that still sit
  inside an old `.next/standalone/upload` keep working until rescued.

### One-time rescue of surviving files

Run this BEFORE the next `npm run build`, then verify the review queue:

```bash
cd /home/rmis-mirdc/Desktop/rmis-latestversion
mkdir -p upload

# 1) Files still inside the current standalone copy (uploaded since the last build)
cp -rn .next/standalone/upload/. upload/ 2>/dev/null || true

# 2) The old v4.1-era deployment folder, if it still exists on this machine
#    (adjust the path to the real old folder name)
cp -rn /home/rmis-mirdc/Desktop/RMISv4.1/.next/standalone/upload/. upload/ 2>/dev/null || true
cp -rn /home/rmis-mirdc/Desktop/RMISv4.1/upload/. upload/ 2>/dev/null || true
```

`cp -n` never overwrites newer files. Any document still missing after this
was destroyed by an earlier rebuild and can only be recovered from a VM/host
backup — otherwise ask the applicant to re-upload (the review queue shows an
explicit "File temporarily unavailable" card for those records).

### Nightly backup (closes the gap that made the incident silent)

`npm run backup` copies the database and the whole `upload/` tree into
`backups/<timestamp>/` and keeps the newest 14 runs (`BACKUP_KEEP` to change).
Schedule it, e.g. nightly at 02:30:

```bash
30 2 * * * cd /home/rmis-mirdc/Desktop/rmis-latestversion && DATABASE_URL="file:$PWD/db/production-data.db" UPLOAD_DIR="$PWD/upload" npm run backup >> /home/rmis-mirdc/rmis-backup.log 2>&1
```

## Stop and remove the PM2 app

```bash
pm2 delete rmis
pm2 save --force
```

This removes the app from PM2 and its saved startup list. It does not delete
the source code, `.env`, dependencies, or database.

## Existing deployments and data

The fresh-setup database initialization is only for a new, empty database. For
an existing deployment, preserve and back up its database and uploads, do not
run `prisma db push` against that data, and follow the update procedure in
[`DEPLOYMENT.md`](./DEPLOYMENT.md).
