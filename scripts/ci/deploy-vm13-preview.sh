#!/bin/sh
# Deploy a tested develop digest to VM13 Web only; cn-dev has no runtime services.
set -eu
: "${EVENTGRAPH_IMAGE:?immutable GHCR digest required}"
: "${EVENTGRAPH_PREVIEW_RELEASE:?release SHA required}"
case "$EVENTGRAPH_IMAGE" in
  ghcr.io/jboone1989/eventgraph-app@sha256:*) ;;
  *) echo "Refusing unpinned image" >&2; exit 1 ;;
esac
case "$EVENTGRAPH_PREVIEW_RELEASE" in
  *[!0-9a-f]*|'') echo "Invalid source SHA" >&2; exit 1 ;;
esac
[ "${#EVENTGRAPH_PREVIEW_RELEASE}" -eq 40 ] || exit 1
cd /home/ubuntu/workspace/eventgraph
mkdir -p deploy
compose_file=docker-compose.vm13-preview.yml
proxy_file=deploy/vm13-readonly.Caddyfile
previous_image=""
if sudo -n docker inspect eventgraph-vm13-preview-web-1 >/dev/null 2>&1; then
  previous_image="$(sudo -n docker inspect --format '{{.Config.Image}}' eventgraph-vm13-preview-web-1)"
fi

git fetch --quiet --no-tags origin develop
staged_compose="$(mktemp "$PWD/.vm13-next.XXXXXX.yml")"
staged_proxy="$(mktemp "$PWD/deploy/.vm13-next.XXXXXX.Caddyfile")"
backup_compose="$(mktemp "$PWD/.vm13-prev.XXXXXX.yml")"
backup_proxy="$(mktemp "$PWD/deploy/.vm13-prev.XXXXXX.Caddyfile")"
proxy_was_present=0
cleanup() { rm -f "$staged_compose" "$staged_proxy" "$backup_compose" "$backup_proxy"; }
trap cleanup EXIT
git show "$EVENTGRAPH_PREVIEW_RELEASE:$compose_file" > "$staged_compose"
git show "$EVENTGRAPH_PREVIEW_RELEASE:$proxy_file" > "$staged_proxy"
cp "$compose_file" "$backup_compose"
if [ -f "$proxy_file" ]; then
  cp "$proxy_file" "$backup_proxy"
  proxy_was_present=1
fi
sudo -n docker pull "$EVENTGRAPH_IMAGE"
sudo -n docker pull caddy:2-alpine
sudo -n docker run --rm -v "$staged_proxy:/etc/caddy/Caddyfile:ro" caddy:2-alpine \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

export EVENTGRAPH_APP_IMAGE="$EVENTGRAPH_IMAGE"
compose() {
  sudo -n env EVENTGRAPH_APP_IMAGE="$EVENTGRAPH_APP_IMAGE" \
    EVENTGRAPH_PREVIEW_RELEASE="$EVENTGRAPH_PREVIEW_RELEASE" \
    docker compose -f "$compose_file" "$@"
}
restore() {
  echo "VM13 preview failed; restoring previous Web/Compose" >&2
  cp "$backup_compose" "$compose_file"
  if [ "$proxy_was_present" -eq 1 ]; then cp "$backup_proxy" "$proxy_file"; else rm -f "$proxy_file"; fi
  if [ -n "$previous_image" ]; then
    export EVENTGRAPH_APP_IMAGE="$previous_image"
    compose up -d --no-build --pull never --force-recreate web || true
  fi
  exit 1
}
cp "$staged_proxy" "$proxy_file"
cp "$staged_compose" "$compose_file"
compose config --quiet || restore
compose up -d --no-build --pull never --force-recreate api-forward web || restore
i=0
while [ "$i" -lt 30 ]; do
  if curl -fsS --max-time 8 http://127.0.0.1/api/health >/dev/null \
     && curl -fsS --max-time 8 -o /dev/null http://127.0.0.1/; then
    printf '%s\n' "$EVENTGRAPH_IMAGE" > .eventgraph-vm13-last-good-image
    echo "VM13 preview updated: $EVENTGRAPH_IMAGE"
    exit 0
  fi
  i=$((i+1))
  sleep 2
done
restore
