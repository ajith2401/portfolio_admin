#!/bin/bash
# Usage: tests/e2e/run.sh [playwright args]. Starts `next start` on a free port against the throwaway DB.
cd "$(dirname "$0")/../.."
source tests/e2e/server-env.sh
(cd tests/e2e && node seed.mjs) || exit 1
PORT=${E2E_PORT:-3411}
( if [ -n "$E2E_DEV" ]; then npx next dev -p $PORT; else NODE_ENV=production npx next start -p $PORT; fi ) > "${TMPDIR}e2e-server.log" 2>&1 &
SRV=$!
trap "kill $SRV 2>/dev/null" EXIT
for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:$PORT/login && break; sleep 1; done
(cd tests/e2e && npx playwright test "$@")
