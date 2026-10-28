#!/bin/sh
# cn-dev development data plane: recreate ONLY the worker from an image already
# delivered locally by scripts/ci/export-image-vm13.sh (VM13 pulls from GHCR and
# streams it over the pre-authorized SSH path; cn-dev never contacts the
# registry — its cross-border registry pulls are unreliable). Web and API live
# on VM13 (scripts/ci/deploy-vm13-preview.sh); this deployment and that one are
# independent — neither gates the other. Transport supplied by
# appleboy/ssh-action. No git pull, npm install, or build on host.
set -eu
: "${EVENTGRAPH_IMAGE:?Missing image digest}"
: "${EVENTGRAPH_RELEASE_SHA:?Missing release SHA}"
: "${EVENTGRAPH_DIR:?Missing deployment directory}"
case "$EVENTGRAPH_IMAGE" in
  ghcr.io/jboone1989/eventgraph-app@sha256:*) ;;
  *) echo "Refuse untrusted image reference" >&2; exit 1 ;;
esac
# The tag comes from the environment (manual runs) or from the pairing file the
# export step wrote on this host after verifying the delivery (CI runs).
delivered="/home/ubuntu/.eventgraph-last-delivered-image"
if [ -z "${EVENTGRAPH_IMAGE_TAG:-}" ]; then
  [ -f "$delivered" ] || { echo "No image delivered; run export-image-vm13.sh first" >&2; exit 1; }
  EVENTGRAPH_IMAGE_TAG="$(sed -n 1p "$delivered")"
  delivered_digest="$(sed -n 2p "$delivered")"
  [ "$delivered_digest" = "$EVENTGRAPH_IMAGE" ] \
    || { echo "Delivered image $delivered_digest does not match release digest $EVENTGRAPH_IMAGE" >&2; exit 1; }
fi
case "$EVENTGRAPH_IMAGE_TAG" in
  eventgraph-dev:[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]*) ;;
  *) echo "Refuse untrusted local image tag $EVENTGRAPH_IMAGE_TAG" >&2; exit 1 ;;
esac
cd "$EVENTGRAPH_DIR"
test -f .env
test -f docker-compose.yml

# The image must already be on this host, delivered as a local tag via docker
# load from scripts/ci/export-image-vm13.sh (docker save|load cannot
# preserve registry digest references, so delivery uses a content-addressed
# local tag). There is deliberately no registry login or pull here.
docker image inspect "$EVENTGRAPH_IMAGE_TAG" >/dev/null \
  || { echo "Image $EVENTGRAPH_IMAGE_TAG is not loaded on cn-dev; run export-image-vm13.sh first" >&2; exit 1; }
revision="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$EVENTGRAPH_IMAGE_TAG")"
[ "$revision" = "$EVENTGRAPH_RELEASE_SHA" ] \
  || { echo "Image revision $revision does not match release $EVENTGRAPH_RELEASE_SHA" >&2; exit 1; }
image_id="$(docker image inspect --format '{{.Id}}' "$EVENTGRAPH_IMAGE_TAG")"
# The tag name is the image ID: a delivered tag cannot pose as another image.
[ "$image_id" = "sha256:${EVENTGRAPH_IMAGE_TAG#eventgraph-dev:}" ] \
  || { echo "Local tag $EVENTGRAPH_IMAGE_TAG does not point at image $image_id" >&2; exit 1; }

# An ephemeral Compose overlay uses the immutable digest for the worker and its
# setup only. The original DB, data volumes, networks and Compose project name
# remain unchanged, and no Web/API containers are created on this host.
overlay="$(mktemp "$EVENTGRAPH_DIR/.ci-image.XXXXXXXX.yml")"
cat > "$overlay" <<'OVERLAY'
services:
  setup:
    image: ${EVENTGRAPH_APP_IMAGE:?}
  worker:
    image: ${EVENTGRAPH_APP_IMAGE:?}
    # The base compose leaves AIHOT_RELEASE empty, so without this override the
    # worker heartbeat reports "dev" while the container actually runs a pinned
    # revision (single-item T11 observability defect, Issue #176). The label var
    # is re-exported on rollback so a restored worker reports its own image.
    environment:
      AIHOT_RELEASE: ${EVENTGRAPH_RELEASE_LABEL:?}
OVERLAY
EVENTGRAPH_RELEASE_LABEL="$EVENTGRAPH_RELEASE_SHA"
export EVENTGRAPH_RELEASE_LABEL
cleanup() {
  rm -f "$overlay" "${db_overlay:-}"
}
trap cleanup EXIT
compose() {
  docker compose -f docker-compose.yml -f "$overlay" -f "$db_overlay" "$@"
}

# The development database stays private: this cn-dev-only overlay from the exact
# release publishes it on host loopback for the VM13 SSH tunnel, nothing public.
git fetch --quiet --no-tags origin develop
db_overlay="$(mktemp "$EVENTGRAPH_DIR/.ci-dev-db.XXXXXXXX.yml")"
git show "$EVENTGRAPH_RELEASE_SHA:docker-compose.dev-db.yml" > "$db_overlay"
previous=""
if [ -f .eventgraph-last-good-image ]; then
  previous="$(cat .eventgraph-last-good-image)"
else
  # First managed release: capture the actual running image (not a mutable tag).
  running="$(docker compose -f docker-compose.yml ps -q worker || true)"
  if [ -z "$running" ]; then
    echo "No running worker container or successful release marker: bootstrap first" >&2
    exit 1
  fi
  old_id="$(docker inspect -f '{{.Image}}' "$running")"
  if ! docker image inspect eventgraph-rollback:pre-ci >/dev/null 2>&1; then
    docker image tag "$old_id" eventgraph-rollback:pre-ci
  fi
  previous="eventgraph-rollback:pre-ci"
fi
export EVENTGRAPH_APP_IMAGE="$EVENTGRAPH_IMAGE_TAG"
compose config --quiet
# The rollback image must already be local: this host cannot re-pull it from the
# registry. Fail before touching anything if it is gone.
docker image inspect "$previous" >/dev/null \
  || { echo "Rollback image $previous is not available locally; refusing to deploy" >&2; exit 1; }
# Run the existing idempotent setup on every development release: migrations
# apply only once; seed inserts missing source IDs without overriding admin
# edits. The worker needs the schema before its new code starts. The VM13 job
# runs the same setup through the DB tunnel; runMigrations' advisory lock
# serializes the two.
compose up -d --no-deps --no-build --pull never db
if ! compose run --rm --no-deps --pull never setup; then
  echo "Development migration/source seed failed; worker unchanged" >&2
  exit 1
fi

rollback() {
  echo "Deployment failed, restoring previous worker image where available" >&2
  if [ -n "$previous" ] && [ "$previous" != "$EVENTGRAPH_IMAGE_TAG" ]; then
    EVENTGRAPH_APP_IMAGE="$previous"
    export EVENTGRAPH_APP_IMAGE
    # A pre-CI rollback image carries no revision label, and its worker honestly
    # reported "dev" (empty AIHOT_RELEASE); restore exactly that instead of
    # failing the recreate on the overlay's non-empty ${EVENTGRAPH_RELEASE_LABEL:?}.
    EVENTGRAPH_RELEASE_LABEL="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$previous")"
    [ -n "$EVENTGRAPH_RELEASE_LABEL" ] || EVENTGRAPH_RELEASE_LABEL=dev
    export EVENTGRAPH_RELEASE_LABEL
    if ! compose up -d --no-deps --no-build --pull never worker; then
      echo "Rollback failed to restore $previous: worker NOT recovered, manual intervention required" >&2
    fi
  fi
  exit 1
}
# Development database and Neo4j persistent volumes are untouched.
if ! compose up -d --no-deps --no-build --pull never worker; then
  rollback
fi
container_id="$(compose ps -q worker || true)"
if [ -z "$container_id" ] || [ "$(docker inspect -f '{{.State.Running}}' "$container_id")" != "true" ]; then
  echo "Service not running: worker" >&2
  rollback
fi
if [ "$(docker inspect -f '{{.Image}}' "$container_id")" != "$image_id" ]; then
  echo "Service worker is not running the published digest" >&2
  rollback
fi
# The worker has no HTTP port; its settings heartbeat (written on boot and every
# minute) proves the new process started, migrated schema included, reaches the
# database, and identifies itself as the pinned release instead of "dev". stop_grace_period is 210s, so a graceful stop can add minutes.
started="$(date -u +%Y-%m-%dT%H:%M:%S)"
healthy=0
i=0
while [ "$i" -lt 45 ]; do
  beat="$(compose exec -T db psql -U aihot -d aihot -Atc \
    "SELECT (value->>'at') >= '$started' AND value->>'release' = '$EVENTGRAPH_RELEASE_SHA' FROM settings WHERE key = 'heartbeat.worker'" 2>/dev/null || true)"
  if [ "$beat" = "t" ]; then
    healthy=1
    break
  fi
  i=$((i+1))
  sleep 4
done
if [ "$healthy" -ne 1 ]; then
  compose logs --tail 40 worker || true
  rollback
fi
printf '%s\n' "$EVENTGRAPH_IMAGE_TAG" > .eventgraph-last-good-image.tmp
echo "Reconciling existing public page indexing in bounded batches"
compose exec -T worker node scripts/reindex-public-pages.ts || { rm -f .eventgraph-last-good-image.tmp; rollback; }
mv .eventgraph-last-good-image.tmp .eventgraph-last-good-image
# Keep only the deployed image and the rollback image; stale superseded
# digests once filled this disk (97% on 2026-10-27). Images used by running
# containers refuse to be removed, so this never touches a live service.
# docker images reports short IDs; compare on the first 12 hex chars.
previous_id="$(docker image inspect --format '{{.Id}}' "$previous")"
keep12="$(printf '%s' "${image_id#sha256:}" | cut -c1-12)"
prev12="$(printf '%s' "${previous_id#sha256:}" | cut -c1-12)"
docker images --format '{{.ID}} {{.Repository}}' \
  | awk -v keep="$keep12" -v prev="$prev12" \
    '($2=="ghcr.io/jboone1989/eventgraph-app" || $2=="eventgraph-dev") && substr($1,1,12)!=keep && substr($1,1,12)!=prev {print $1}' \
  | while read -r stale_id; do docker rmi "$stale_id" >/dev/null 2>&1 || true; done
echo "Release verified: $EVENTGRAPH_IMAGE (running $EVENTGRAPH_IMAGE_TAG)"
