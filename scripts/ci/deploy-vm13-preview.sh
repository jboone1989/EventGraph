#!/bin/sh
# VM13 only: deploy tested develop digest to existing Web preview.
set -eu
: "${EVENTGRAPH_IMAGE:?missing immutable GHCR image digest}"
: "${EVENTGRAPH_PREVIEW_RELEASE:?missing tested source SHA}"
case "$EVENTGRAPH_IMAGE" in
  ghcr.io/jboone1989/eventgraph-app@sha256:*) ;;
  *) echo "Refusing non-digest image" >&2; exit 1 ;;
esac
case "$EVENTGRAPH_PREVIEW_RELEASE" in
  *[!0-9a-f]*|'') echo "Invalid source SHA" >&2; exit 1 ;;
esac
[ "${#EVENTGRAPH_PREVIEW_RELEASE}" -eq 40 ] || { echo "Source SHA must be 40 hex digits" >&2; exit 1; }
cd /home/ubuntu/workspace/eventgraph
[ -f docker-compose.vm13-preview.yml ] || { echo "Missing VM13 Web-only Compose" >&2; exit 1; }
compose() {
  sudo -n env EVENTGRAPH_APP_IMAGE="$EVENTGRAPH_APP_IMAGE" \
    EVENTGRAPH_PREVIEW_RELEASE="$EVENTGRAPH_PREVIEW_RELEASE" \
    docker compose -f docker-compose.vm13-preview.yml "$@"
}
previous=""
if sudo -n docker inspect eventgraph-vm13-preview-web-1 >/dev/null 2>&1; then
  previous="$(sudo -n docker inspect --format '{{.Config.Image}}' eventgraph-vm13-preview-web-1)"
fi
export EVENTGRAPH_APP_IMAGE="$EVENTGRAPH_IMAGE"
# Source parity: deploy the Compose definition belonging to the published
# source SHA, not an arbitrarily old file left in the VM13 checkout.
sudo -n docker pull "$EVENTGRAPH_IMAGE"
git fetch --quiet --no-tags origin develop
staged="$(mktemp "$PWD/.vm13-compose-next.XXXXXX.yml")"
backup="$(mktemp "$PWD/.vm13-compose-previous.XXXXXX.yml")"
trap 'rm -f "$staged" "$backup"' EXIT
git show "$EVENTGRAPH_PREVIEW_RELEASE:docker-compose.vm13-preview.yml" > "$staged"
sudo -n env EVENTGRAPH_APP_IMAGE="$EVENTGRAPH_IMAGE" \
  EVENTGRAPH_PREVIEW_RELEASE="$EVENTGRAPH_PREVIEW_RELEASE" \
  docker compose -f "$staged" config --quiet
cp docker-compose.vm13-preview.yml "$backup"
cp "$staged" docker-compose.vm13-preview.yml
compose config --quiet
rollback() {
  echo "VM13 preview check failed; restoring only Web and previous Compose" >&2
  if [ -f "$backup" ]; then
    cp "$backup" docker-compose.vm13-preview.yml
  fi
  if [ -n "$previous" ] && [ "$previous" != "$EVENTGRAPH_IMAGE" ]; then
    export EVENTGRAPH_APP_IMAGE="$previous"
    compose up -d --no-deps --no-build --pull never web || true
  fi
  exit 1
}
compose up -d --no-deps --no-build --pull never web || rollback
i=0
healthy=0
while [ "$i" -lt 30 ]; do
  if curl -fsS --max-time 5 http://127.0.0.1/api/health >/dev/null &&
     curl -fsS --max-time 8 -o /dev/null http://127.0.0.1/; then
    healthy=1
    break
  fi
  i=$((i+1))
  sleep 2
done
[ "$healthy" -eq 1 ] || rollback
printf '%s\n' "$EVENTGRAPH_IMAGE" > .eventgraph-vm13-last-good-image
echo "VM13 Web preview verified: $EVENTGRAPH_IMAGE (source $EVENTGRAPH_PREVIEW_RELEASE)"
