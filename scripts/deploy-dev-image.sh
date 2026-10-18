#!/usr/bin/env bash
# Consume a GitHub CI-built digest. Never rebuild, migrate DB, reset Git or touch prod.
set -Eeuo pipefail
: "${GITHUB_WORKSPACE:?Trusted source checkout required}"
: "${EVENTGRAPH_APP_IMAGE:?Expected OCI image digest}"
: "${EVENTGRAPH_SOURCE_SHA:?Expected tested source SHA}"
[[ "$(hostname)" == "VM-0-5-ubuntu" ]] ||
  { echo "Not the verified cn-dev host" >&2; exit 1; }
[[ "$EVENTGRAPH_APP_IMAGE" =~ ^ghcr\.io/jboone1989/eventgraph-app@sha256:[a-f0-9]{64}$ ]] ||
  { echo "Image must be the EventGraph GHCR app pinned by digest" >&2; exit 1; }
[[ "$EVENTGRAPH_SOURCE_SHA" =~ ^[a-f0-9]{40}$ ]] ||
  { echo "Source SHA must be a full commit ID" >&2; exit 1; }

root="${EVENTGRAPH_DEV_ROOT:-/home/ubuntu/livingruntime-aihot}"
[[ -f "$root/docker-compose.yml" && -f "$root/.env" ]] ||
  { echo "Development stack missing" >&2; exit 1; }
[[ -f "$GITHUB_WORKSPACE/docker-compose.dev-image.yml" ]] ||
  { echo "Development Compose overlay missing" >&2; exit 1; }
command -v docker >/dev/null
command -v flock >/dev/null
state="$HOME/.local/state/eventgraph-dev"
install -d -m 0700 "$state"
exec 9>"$state/deploy.lock"
flock -n 9 || { echo "Another development release is running" >&2; exit 1; }

# The operator must record the *actual deployed* source baseline once.
# Never guess it from a dirty/de-synced development checkout HEAD.
[[ -f "$state/last-source-sha" ]] ||
  { echo "Missing verified development baseline; bootstrap manually" >&2; exit 1; }
previous_sha="$(cat "$state/last-source-sha")"
if [[ ! "$previous_sha" =~ ^[a-f0-9]{40}$ ]] ||
   ! git -C "$GITHUB_WORKSPACE" cat-file -e "$previous_sha^{commit}" 2>/dev/null ||
   ! git -C "$GITHUB_WORKSPACE" merge-base --is-ancestor "$previous_sha" "$EVENTGRAPH_SOURCE_SHA"; then
  echo "Unknown development source ancestry; abort" >&2; exit 1
fi
if git -C "$GITHUB_WORKSPACE" diff --name-only "$previous_sha" "$EVENTGRAPH_SOURCE_SHA" -- database/migrations/ |
   grep -q .; then
  echo "DB migration requires a separate, explicit development migration" >&2; exit 1
fi

free_kib="$(df -Pk "$root" | awk 'NR==2 {print $4}')"
[[ "$free_kib" =~ ^[0-9]+$ ]] && (( free_kib > 4194304 )) ||
  { echo "Less than 4 GiB of free development disk; abort" >&2; exit 1; }

cd "$root"
compose=(docker compose -f "$root/docker-compose.yml" -f "$GITHUB_WORKSPACE/docker-compose.dev-image.yml")
rollback_compose_file="$(mktemp "$state/rollback.XXXXXXXX.yml")"
applied=0
rollback() {
  local rc="$?"
  trap - EXIT
  if [[ "$applied" == 1 && "$rc" != 0 ]]; then
    echo "Development health failed: restoring the previous api/worker/web image IDs" >&2
    docker compose -f "$root/docker-compose.yml" -f "$rollback_compose_file" \
      up -d --no-deps --no-build --pull never api worker web ||
      echo "ALERT: application rollback failed" >&2
  fi
  rm -f "$rollback_compose_file"
  exit "$rc"
}
trap rollback EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

declare -A previous_ids=()
printf 'services:\n' > "$rollback_compose_file"
for service in api worker web; do
  cid="$(docker compose -f "$root/docker-compose.yml" ps -q "$service")"
  [[ -n "$cid" ]] || { echo "Missing running development $service" >&2; exit 1; }
  old_id="$(docker inspect --format '{{.Image}}' "$cid")"
  [[ "$old_id" =~ ^sha256:[0-9a-f]{64}$ ]] ||
    { echo "Cannot pin previous $service image" >&2; exit 1; }
  previous_ids["$service"]="$old_id"
  previous_tag="eventgraph-dev-rollback:$service"
  docker image tag "$old_id" "$previous_tag"
  printf '  %s:\n    image: %s\n' "$service" "$previous_tag" >> "$rollback_compose_file"
done

export EVENTGRAPH_APP_IMAGE
"${compose[@]}" config --quiet
docker pull "$EVENTGRAPH_APP_IMAGE"
new_id="$(docker image inspect --format '{{.Id}}' "$EVENTGRAPH_APP_IMAGE")"
[[ "$new_id" =~ ^sha256:[0-9a-f]{64}$ ]] ||
  { echo "Missing local image ID after pull" >&2; exit 1; }
source_label="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$EVENTGRAPH_APP_IMAGE")"
[[ "$source_label" == "$EVENTGRAPH_SOURCE_SHA" ]] ||
  { echo "Pulled image does not match the successful GitHub source SHA" >&2; exit 1; }

applied=1
"${compose[@]}" up -d --no-deps --no-build --pull never api worker web
stable=0
for attempt in $(seq 1 30); do
  ready=1
  for service in api worker web; do
    cid="$("${compose[@]}" ps -q "$service")"
    if [[ -z "$cid" ]] ||
       [[ "$(docker inspect --format '{{.State.Running}}' "$cid")" != "true" ]] ||
       [[ "$(docker inspect --format '{{.Image}}' "$cid")" != "$new_id" ]]; then
      ready=0
      break
    fi
  done
  if [[ "$ready" == 1 ]] &&
     "${compose[@]}" exec -T web node -e \
       "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
       >/dev/null 2>&1; then
    stable=$((stable+1))
    if (( stable >= 3 )); then break; fi
  else
    stable=0
  fi
  sleep 3
done
(( stable >= 3 )) || { echo "New development containers failed smoke/image check" >&2; false; }

applied=0
printf '%s\n' "$EVENTGRAPH_SOURCE_SHA" > "$state/last-source-sha"
printf '%s\n' "$EVENTGRAPH_APP_IMAGE" > "$state/last-image-ref"
chmod 0600 "$state/last-source-sha" "$state/last-image-ref"

# Remove older unused EventGraph package images, never all Docker images or
# volumes. Protect every running/stopped container image and the prior
# per-service rollback IDs. Unrelated developer images are untouched.
mapfile -t referenced < <(docker ps -aq | xargs -r docker inspect --format '{{.Image}}')
mapfile -t candidates < <(docker images --no-trunc \
  --filter 'label=org.opencontainers.image.source=https://github.com/jboone1989/EventGraph' \
  --format '{{.ID}}' | sort -u)
for id in "${candidates[@]}"; do
  [[ "$id" == "$new_id" ]] && continue
  keep=0
  for service in api worker web; do
    [[ "$id" == "${previous_ids[$service]}" ]] && keep=1
  done
  for used in "${referenced[@]}"; do
    [[ "$id" == "$used" ]] && keep=1
  done
  if [[ "$keep" == 0 ]]; then docker image rm "$id" >/dev/null 2>&1 || true; fi
done
docker image prune -f >/dev/null || true
echo "DEV UPDATED: source=$EVENTGRAPH_SOURCE_SHA image=$EVENTGRAPH_APP_IMAGE"
