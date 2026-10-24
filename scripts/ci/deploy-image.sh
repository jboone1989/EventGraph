#!/bin/sh
# Transport supplied by appleboy/ssh-action. No git pull, npm install, or build on host.
set -eu
: "${EVENTGRAPH_IMAGE:?Missing image digest}"
: "${EVENTGRAPH_DIR:?Missing deployment directory}"
: "${GHCR_USER:?Missing registry account}"
: "${GHCR_TOKEN:?Missing registry access token}"
case "$EVENTGRAPH_IMAGE" in
  ghcr.io/jboone1989/eventgraph-app@sha256:*) ;;
  *) echo "Refuse untrusted image reference" >&2; exit 1 ;;
esac
cd "$EVENTGRAPH_DIR"
test -f .env
test -f docker-compose.yml
umask 077
# GHCR login is isolated from host-wide Docker credentials.
dockercfg="$(mktemp -d)"
export DOCKER_CONFIG="$dockercfg"

# An ephemeral Compose overlay uses the immutable GHCR digest. The original
# DB, data volumes, networks and Compose project name remain unchanged.
overlay="$(mktemp "$EVENTGRAPH_DIR/.ci-image.XXXXXXXX.yml")"
cat > "$overlay" <<'OVERLAY'
services:
  setup:
    image: ${EVENTGRAPH_APP_IMAGE:?}
  api:
    image: ${EVENTGRAPH_APP_IMAGE:?}
  worker:
    image: ${EVENTGRAPH_APP_IMAGE:?}
  web:
    image: ${EVENTGRAPH_APP_IMAGE:?}
OVERLAY
cleanup() {
  rm -f "$overlay"
  rm -rf -- "$dockercfg"
}
trap cleanup EXIT
compose() {
  docker compose -f docker-compose.yml -f "$overlay" "$@"
}
previous=""
if [ -f .eventgraph-last-good-image ]; then
  previous="$(cat .eventgraph-last-good-image)"
else
  # First managed release: capture the actual running image (not a mutable tag).
  running="$(docker compose -f docker-compose.yml ps -q web || true)"
  if [ -z "$running" ]; then
    echo "No running web container or successful release marker: bootstrap first" >&2
    exit 1
  fi
  old_id="$(docker inspect -f '{{.Image}}' "$running")"
  if ! docker image inspect eventgraph-rollback:pre-ci >/dev/null 2>&1; then
    docker image tag "$old_id" eventgraph-rollback:pre-ci
  fi
  previous="eventgraph-rollback:pre-ci"
fi
export EVENTGRAPH_APP_IMAGE="$EVENTGRAPH_IMAGE"
compose config --quiet
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin >/dev/null
unset GHCR_TOKEN
docker pull "$EVENTGRAPH_IMAGE"
# Keep a usable rollback image even after host-level image pruning.
case "$previous" in
  ghcr.io/*)
    if ! docker image inspect "$previous" >/dev/null 2>&1; then
      docker pull "$previous"
    fi
    ;;
  *)
    docker image inspect "$previous" >/dev/null
    ;;
esac
# Read-only migration parity check: abort before updating any service if the
# new image expects schema files the target database has not applied.
if ! compose run --rm --no-deps --pull never --entrypoint node setup --input-type=module -e '
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import { sql, closeDb } from "@aihot/backend/db";
const modules = path.join(REPO_ROOT, "modules");
const dirs = [path.join(REPO_ROOT, "database/migrations"),
  ...(existsSync(modules) ? readdirSync(modules).map(m => path.join(modules, m, "migrations")) : [])];
const expected = new Set(dirs.flatMap(dir => existsSync(dir) ?
  readdirSync(dir).filter(name => name.endsWith(".sql")) : []));
try {
  const rows = await sql.unsafe("SELECT name FROM schema_migrations");
  const applied = new Set(rows.map(r => r.name));
  const pending = [...expected].filter(name => !applied.has(name));
  if (pending.length) throw new Error("Pending database migrations: " + pending.join(", "));
  console.log("Schema already up to date; proceeding with image-only release");
} catch (error) {
  console.error("Release blocked: " + error.message);
  process.exitCode = 1;
} finally {
  await closeDb();
}
'; then
  echo "Schema preflight failed; no app containers were changed" >&2
  exit 1
fi
rollback() {
  echo "Deployment failed, restoring previous app image where available" >&2
  if [ -n "$previous" ] && [ "$previous" != "$EVENTGRAPH_IMAGE" ]; then
    EVENTGRAPH_APP_IMAGE="$previous"
    export EVENTGRAPH_APP_IMAGE
    compose up -d --no-deps --no-build --pull never api worker web || true
  fi
  exit 1
}
# Image-only rollout: schema migrations require a separately reviewed, backed-up release.
# Database/Neo4j services and persistent volumes are not touched.
if ! compose up -d --no-deps --no-build --pull never api worker web; then
  rollback
fi
for service in api worker web; do
  container_id="$(compose ps -q "$service" || true)"
  if [ -z "$container_id" ] || [ "$(docker inspect -f '{{.State.Running}}' "$container_id")" != "true" ]; then
    echo "Service not running: $service" >&2
    rollback
  fi
done
healthy=0
i=0
while [ "$i" -lt 30 ]; do
  if compose exec -T web node -e \
    'fetch("http://127.0.0.1:3000/api/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))'; then
    healthy=1
    break
  fi
  i=$((i+1))
  sleep 2
done
if [ "$healthy" -ne 1 ]; then
  compose ps
  rollback
fi
printf '%s\n' "$EVENTGRAPH_IMAGE" > .eventgraph-last-good-image.tmp
echo "Reconciling existing public page indexing in bounded batches"
compose exec -T api node scripts/reindex-public-pages.ts
mv .eventgraph-last-good-image.tmp .eventgraph-last-good-image
echo "Release verified: $EVENTGRAPH_IMAGE"
