#!/usr/bin/env bash
# Consumes a CI-built, immutable app image on cn-dev. Does NOT build, migrate,
# touch data volumes, alter the developer's Git working tree, or touch prod.
set -Eeuo pipefail

: "${GITHUB_WORKSPACE:?Run via the trusted cn-dev GitHub Actions runner}"
: "${EVENTGRAPH_APP_IMAGE:?Pass GHCR image@sha256:digest from CI}"
: "${EVENTGRAPH_SOURCE_SHA:?Pass the successful main commit SHA}"
[[ "$EVENTGRAPH_APP_IMAGE" =~ ^ghcr\.io/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$ ]] ||
  { echo "Expected a GHCR image with immutable sha256 digest" >&2; exit 1; }
[[ "$EVENTGRAPH_SOURCE_SHA" =~ ^[a-f0-9]{40}$ ]] ||
  { echo "Expected the complete source commit SHA" >&2; exit 1; }

ROOT="${EVENTGRAPH_DEV_ROOT:-/home/ubuntu/livingruntime-aihot}"
[[ -f "$ROOT/docker-compose.yml" && -f "$ROOT/.env" ]] ||
  { echo "Development Compose checkout or .env is missing: $ROOT" >&2; exit 1; }
[[ -f "$GITHUB_WORKSPACE/docker-compose.dev-image.yml" ]] ||
  { echo "Missing development image overlay" >&2; exit 1; }

command -v flock >/dev/null
command -v docker >/dev/null
mkdir -p "$HOME/.local/state/eventgraph-dev"
exec 9>"$HOME/.local/state/eventgraph-dev/deploy.lock"
flock -n 9 || { echo "Another dev rollout is running" >&2; exit 1; }

# The current cn-dev checkout is NOT reset/pulled/overwritten.
# Verify the exact difference from the previously deployed source. Schema
# updates require a separate, explicit development migration, never a blind
# Compose application replacement.
state="$HOME/.local/state/eventgraph-dev"
previous_sha=""
if [[ -f "$state/last-source-sha" ]]; then
  previous_sha="$(cat "$state/last-source-sha")"
elif git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  previous_sha="$(git -C "$ROOT" rev-parse HEAD)"
fi
if [[ ! "$previous_sha" =~ ^[a-f0-9]{40}$ ]] ||
   ! git -C "$GITHUB_WORKSPACE" cat-file -e "$previous_sha^{commit}" 2>/dev/null ||
   ! git -C "$GITHUB_WORKSPACE" merge-base --is-ancestor "$previous_sha" "$EVENTGRAPH_SOURCE_SHA"; then
  echo "Unknown/unrelated current dev base; bootstrap source state manually before enabling auto rollout" >&2
  exit 1
fi
if git -C "$GITHUB_WORKSPACE" diff --name-only "$previous_sha" "$EVENTGRAPH_SOURCE_SHA" -- database/migrations/ |
   grep -q .; then
  echo "Database migrations changed; refusing automatic app-only dev rollout" >&2
  exit 1
fi

cd "$ROOT"
compose=(docker compose -f "$ROOT/docker-compose.yml" -f "$GITHUB_WORKSPACE/docker-compose.dev-image.yml")
api_container="$(docker compose -f "$ROOT/docker-compose.yml" ps -q api)"
[[ -n "$api_container" ]] || { echo "Dev API is not running; do not bootstrap over missing stack" >&2; exit 1; }
previous_image="$(docker inspect --format '{{.Config.Image}}' "$api_container")"
[[ -n "$previous_image" ]] || { echo "Cannot capture rollback image" >&2; exit 1; }

export EVENTGRAPH_APP_IMAGE
"${compose[@]}" config --quiet
docker pull "$EVENTGRAPH_APP_IMAGE"

changed=0
rollback() {
  rc="$?"
  trap - ERR
  if [[ "$rc" != 0 && "$changed" == 1 ]]; then
    echo "Dev smoke failed; rolling back application containers only" >&2
    export EVENTGRAPH_APP_IMAGE="$previous_image"
    "${compose[@]}" up -d --no-deps --no-build --pull never api worker web ||
      echo "ALERT: dev rollback failed; investigate containers" >&2
  fi
  exit "$rc"
}
trap rollback ERR

changed=1
"${compose[@]}" up -d --no-deps --no-build --pull never api worker web
# Check app inside its own Docker network; no public exposure or prod contact.
healthy=0
for attempt in $(seq 1 20); do
  if "${compose[@]}" exec -T web node -e \
     "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
     >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 3
done
[[ "$healthy" == 1 ]] || { echo "Dev health check failed" >&2; false; }
changed=0
printf '%s\n' "$EVENTGRAPH_SOURCE_SHA" > "$state/last-source-sha"
printf '%s\n' "$EVENTGRAPH_APP_IMAGE" > "$state/last-image-ref"
chmod 600 "$state/last-source-sha" "$state/last-image-ref"
echo "DEV UPDATED: source=$EVENTGRAPH_SOURCE_SHA image=$EVENTGRAPH_APP_IMAGE"
