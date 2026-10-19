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
  docker logout ghcr.io >/dev/null 2>&1 || true
}
trap cleanup EXIT
compose() {
  docker compose -f docker-compose.yml -f "$overlay" "$@"
}
previous=""
if [ -f .eventgraph-last-good-image ]; then
  previous="$(cat .eventgraph-last-good-image)"
elif docker image inspect eventgraph-app:latest >/dev/null 2>&1; then
  previous="eventgraph-app:latest"
fi
export EVENTGRAPH_APP_IMAGE="$EVENTGRAPH_IMAGE"
compose config --quiet
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin >/dev/null
unset GHCR_TOKEN
docker pull "$EVENTGRAPH_IMAGE"
rollback() {
  echo "Deployment failed, restoring previous app image where available" >&2
  if [ -n "$previous" ] && [ "$previous" != "$EVENTGRAPH_IMAGE" ]; then
    EVENTGRAPH_APP_IMAGE="$previous"
    export EVENTGRAPH_APP_IMAGE
    compose up -d --no-deps --no-build --pull never api worker web || true
  fi
  exit 1
}
# Database schema migrations must have passed the PR migration-safety check.
# Do not run the Compose setup seed command or touch DB/Neo4j containers.
if ! compose run --rm --no-deps --pull never --entrypoint node setup scripts/migrate.ts; then
  echo "Migration failed before app update" >&2
  exit 1
fi
if ! compose up -d --no-deps --no-build --pull never api worker web; then
  rollback
fi
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
mv .eventgraph-last-good-image.tmp .eventgraph-last-good-image
echo "Release verified: $EVENTGRAPH_IMAGE"
