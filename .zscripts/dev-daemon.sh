#!/bin/bash
# Daemon spawner: double-fork so the dev server reparents to PID 1
# and survives the tool-session teardown (same pattern as agent-browser).
set -u

PROJECT_DIR="/home/z/my-project"
cd "$PROJECT_DIR"

export DATABASE_URL="file:/home/z/my-project/db/production-data.db"
export NEXT_TELEMETRY_DISABLED=1

# Any stale server holding port 3000?
pkill -f "next dev" 2>/dev/null || true
sleep 1

# --fork guarantees the setsid'd process is a grandchild; this script exits
# immediately, so the dev server is reparented to init (PID 1).
setsid --fork bun run dev < /dev/null > /dev/null 2>&1

echo "spawned"
