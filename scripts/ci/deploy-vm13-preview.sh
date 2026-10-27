#!/bin/sh
# Deploy a tested develop digest to VM13 as development Web + API. The API reaches
# the isolated cn-dev development PostgreSQL through an on-host SSH tunnel; it never
# contacts production. cn-dev keeps the worker and collection workloads.
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
env_file=vm13.env
tunnel_unit=eventgraph-dev-db-tunnel
cn_dev_host=43.142.127.40
tunnel_port=15432
[ -f "$env_file" ] || { echo "Missing $env_file (docs/vm13-preview.md)" >&2; exit 1; }
grep -q '^DATABASE_URL=.*@devdb:'"$tunnel_port"'/' "$env_file" \
  || { echo "$env_file DATABASE_URL must target devdb:$tunnel_port" >&2; exit 1; }

previous_image=""
if sudo -n docker inspect eventgraph-vm13-preview-web-1 >/dev/null 2>&1; then
  previous_image="$(sudo -n docker inspect --format '{{.Config.Image}}' eventgraph-vm13-preview-web-1)"
fi

git fetch --quiet --no-tags origin develop
staged_compose="$(mktemp "$PWD/.vm13-next.XXXXXX.yml")"
backup_compose="$(mktemp "$PWD/.vm13-prev.XXXXXX.yml")"
cleanup() { rm -f "$staged_compose" "$backup_compose"; }
trap cleanup EXIT
git show "$EVENTGRAPH_PREVIEW_RELEASE:$compose_file" > "$staged_compose"
cp "$compose_file" "$backup_compose"

sudo -n docker pull "$EVENTGRAPH_IMAGE"
revision="$(sudo -n docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$EVENTGRAPH_IMAGE")"
[ "$revision" = "$EVENTGRAPH_PREVIEW_RELEASE" ] \
  || { echo "Image revision $revision does not match release $EVENTGRAPH_PREVIEW_RELEASE" >&2; exit 1; }
image_id="$(sudo -n docker image inspect --format '{{.Id}}' "$EVENTGRAPH_IMAGE")"

# The tunnel is the only network path to the development database: SSH from VM13 to
# cn-dev (existing key), forwarding a port bound to loopback and the docker bridge
# gateway. No database port is opened to the internet on either host.
bridge_gw="$(sudo -n docker network inspect bridge --format '{{(index .IPAM.Config 0).Gateway}}')"
# Pin cn-dev's host key for the tunnel: the runner verifies this fingerprint
# (secrets.EVENTGRAPH_DEV_SSH_FINGERPRINT) on its own hops, and the same pin
# must authorize the VM13→cn-dev tunnel before the unit below connects. The
# verified key goes to a dedicated file rewritten on every run, so entries
# appended by the earlier trust-on-first-keyscan bootstrap cannot authorize a
# different key.
: "${EVENTGRAPH_DEV_SSH_FINGERPRINT:?pinned cn-dev host key fingerprint (SHA256:...) required}"
mkdir -p "${HOME}/.ssh"
CNDEV_KNOWN_HOSTS="${HOME}/.ssh/known_hosts.cndev"
cndev_scan="${CNDEV_KNOWN_HOSTS}.scan"
ssh-keyscan -T 10 -t ed25519 "$cn_dev_host" 2>/dev/null | awk -v h="$cn_dev_host" '$1 == h' | head -n 1 > "$cndev_scan"
[ -s "$cndev_scan" ] || { echo "ssh-keyscan failed for $cn_dev_host" >&2; rm -f "$cndev_scan"; exit 1; }
ssh-keygen -lf "$cndev_scan" | awk -v fp="$EVENTGRAPH_DEV_SSH_FINGERPRINT" '$2 == fp { ok = 1 } END { exit !ok }' \
  || { echo "cn-dev host key does not match the pinned fingerprint; refusing" >&2; rm -f "$cndev_scan"; exit 1; }
mv "$cndev_scan" "$CNDEV_KNOWN_HOSTS"
sudo -n tee "/etc/systemd/system/$tunnel_unit.service" >/dev/null <<UNIT
[Unit]
Description=EventGraph development database SSH tunnel to cn-dev
After=network-online.target docker.service
Wants=network-online.target

[Service]
User=ubuntu
ExecStart=/usr/bin/ssh -N -T -o ExitOnForwardFailure=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=%h/.ssh/known_hosts.cndev -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -i /home/ubuntu/.ssh/id_ed25519 -L 127.0.0.1:$tunnel_port:127.0.0.1:5432 -L $bridge_gw:$tunnel_port:127.0.0.1:5432 ubuntu@$cn_dev_host
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
sudo -n systemctl daemon-reload
sudo -n systemctl enable --now "$tunnel_unit" >/dev/null
sudo -n systemctl restart "$tunnel_unit"

export EVENTGRAPH_APP_IMAGE="$EVENTGRAPH_IMAGE"
compose() {
  sudo -n env EVENTGRAPH_APP_IMAGE="$EVENTGRAPH_APP_IMAGE" \
    EVENTGRAPH_PREVIEW_RELEASE="$EVENTGRAPH_PREVIEW_RELEASE" \
    docker compose -f "$compose_file" "$@"
}
restore() {
  echo "VM13 preview failed; restoring previous Compose and services" >&2
  cp "$backup_compose" "$compose_file"
  if [ -n "$previous_image" ]; then
    EVENTGRAPH_APP_IMAGE="$previous_image"
    export EVENTGRAPH_APP_IMAGE
    compose up -d --no-build --pull never --force-recreate --remove-orphans api web || true
  fi
  exit 1
}
cp "$staged_compose" "$compose_file"
compose config --quiet || restore

# The API healthcheck is a real database round trip through the tunnel; wait for
# the forwarded port on the docker bridge gateway before recreating the services.
wait_for_db() {
  i=0
  while [ "$i" -lt 30 ]; do
    if timeout 3 bash -c "echo > /dev/tcp/$bridge_gw/$tunnel_port" 2>/dev/null; then
      return 0
    fi
    i=$((i+1))
    sleep 2
  done
  return 1
}
wait_for_db || { echo "Database tunnel did not become ready" >&2; restore; }

# The development database remains on cn-dev, but the pinned image is already on
# VM13. Run idempotent migrations and missing-source seed through the private DB
# tunnel here; removing cn-dev's image deployment must not also remove setup.
compose run --rm --no-deps -T --entrypoint sh api -c 'node scripts/migrate.ts && node scripts/seed.ts' || restore

compose up -d --no-build --pull never --force-recreate --remove-orphans api web || restore
for service in api web; do
  container_id="$(compose ps -q "$service" || true)"
  [ -n "$container_id" ] || { echo "Service missing: $service" >&2; restore; }
  [ "$(sudo -n docker inspect -f '{{.State.Running}}' "$container_id")" = "true" ] \
    || { echo "Service not running: $service" >&2; restore; }
  [ "$(sudo -n docker inspect -f '{{.Image}}' "$container_id")" = "$image_id" ] \
    || { echo "Service $service is not running the published digest" >&2; restore; }
done

i=0
while [ "$i" -lt 40 ]; do
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
