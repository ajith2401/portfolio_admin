#!/bin/bash
# Cross-application publishing test. Admin and Portfolio production builds BOTH use ONE throwaway local DB.
# Usage: E2E_MONGODB_URI=mongodb://127.0.0.1:<port>/shared_test tests/e2e/run-integration.sh
# Prereq: `next build` done in both repos. Secrets are generated per run and never printed.
set -u
cd "$(dirname "$0")/../.."
ADMIN_DIR=$PWD
PORTFOLIO_DIR=${PORTFOLIO_DIR:-$ADMIN_DIR/../portfolio}
export E2E_MONGODB_URI=${E2E_MONGODB_URI:?set E2E_MONGODB_URI to a local shared_test database}
case "$E2E_MONGODB_URI" in mongodb://127.0.0.1:*|mongodb://localhost:*) ;; *) echo "refusing non-local DB"; exit 1;; esac
case "$E2E_MONGODB_URI" in *test*) ;; *) echo "refusing: db name must contain 'test'"; exit 1;; esac
PUB_PORT=${PUB_PORT:-3110}; ADM_PORT=${E2E_PORT:-3411}
RSECRET=$(openssl rand -hex 16); APIKEY=$(openssl rand -hex 16)
source tests/e2e/server-env.sh            # JWT secret, admin creds (local test values)
export MONGODB_URI=$E2E_MONGODB_URI
export E2E_PUBLIC=http://127.0.0.1:$PUB_PORT E2E_SITE_URL=http://localhost:$PUB_PORT
(cd tests/e2e && node seed.mjs) || exit 1
start_portfolio() {
  (cd "$PORTFOLIO_DIR" && NODE_ENV=production MONGODB_URI=$E2E_MONGODB_URI NEXT_PUBLIC_SITE_URL=$E2E_SITE_URL SITE_URL=$E2E_SITE_URL \
    REVALIDATE_SECRET=$RSECRET ADMIN_API_KEY=$APIKEY npx next start -p $PUB_PORT) > "${TMPDIR}int-portfolio.log" 2>&1 &
  PUB_PID=$!
}
start_admin() { # $1 = revalidate URL
  (NODE_ENV=production ADMIN_ALLOWED_ORIGINS=http://127.0.0.1:$ADM_PORT PORTFOLIO_REVALIDATE_URL=$1 REVALIDATE_SECRET=$RSECRET \
    npx next start -p $ADM_PORT) > "${TMPDIR}int-admin.log" 2>&1 &
  ADM_PID=$!
}
wait_for() { for i in $(seq 1 90); do curl -s -o /dev/null "$1" && return 0; sleep 1; done; echo "server not up: $1"; return 1; }
killtree() { for c in $(pgrep -P "$1" 2>/dev/null); do killtree "$c"; done; kill "$1" 2>/dev/null; }
for P in $PUB_PORT $ADM_PORT; do lsof -nP -iTCP:$P -sTCP:LISTEN -t >/dev/null 2>&1 && { echo "port $P already in use; refusing (a stale server would invalidate the test)"; exit 1; }; done
start_portfolio; start_admin "http://127.0.0.1:$PUB_PORT/api/revalidate"
trap 'killtree $PUB_PID; killtree $ADM_PID' EXIT
wait_for http://127.0.0.1:$PUB_PORT/ && wait_for http://127.0.0.1:$ADM_PORT/login || exit 1
export E2E_BAD_SECRET=$(openssl rand -hex 16)   # guaranteed different from the real secret
( cd tests/e2e && npx playwright test specs/05-integration-publish.spec.mjs "$@" ); RC1=$?
# Phase 2: restart admin pointing at a dead revalidate URL to prove a failed revalidation never fails the save.
killtree $ADM_PID; sleep 2
start_admin "http://127.0.0.1:1/api/revalidate"; wait_for http://127.0.0.1:$ADM_PORT/login || exit 1
( cd tests/e2e && npx playwright test specs/06-revalidate-failure.spec.mjs "$@" ); RC2=$?
echo "phase1 exit=$RC1 phase2 exit=$RC2"; exit $((RC1 + RC2))
