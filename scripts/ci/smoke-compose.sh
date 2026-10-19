#!/usr/bin/env bash
# Shared acceptance for the PR build and the exact published GHCR digest.
# Run only against the disposable CI stack, with COMPOSE_FILE selecting its images.
set -euo pipefail
ready=0
for i in $(seq 1 90); do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/api/health 2>/dev/null; then
    ready=1
    break
  fi
  sleep 2
done
docker compose ps
[[ "$ready" == 1 ]] || { echo 'Compose health check timed out' >&2; exit 1; }
docker compose run --rm --no-deps --pull never --entrypoint node setup scripts/smoke.ts --base http://web:3000
docker compose exec -T db psql -U aihot -d aihot -Atc "select count(*) from sources" | grep -qx "$(node -p "require('./industry/sources.json').sources.length")"
