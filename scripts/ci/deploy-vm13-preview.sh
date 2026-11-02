#!/bin/sh
# Deploy a tested develop digest to VM13 as development Web + API. The API reaches
# the production PostgreSQL and knowledge service through an on-host SSH tunnel to
# the production host. The development environment runs no worker or database of
# its own: collection and judging happen only in the production stack.
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
tunnel_unit=eventgraph-prod-db-tunnel
prod_host=43.133.181.149
tunnel_port=15432
knowledge_port=15434
# The egress path drops connections at peak; one refused keyscan or inspect is
# transient and must not abort a deploy. Three attempts, five seconds apart.
prod_ssh() {
  ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "ubuntu@$prod_host" "$@"
}
prod_ssh_retry() {
  i=0
  until prod_ssh "$@"; do
    i=$((i+1))
    [ "$i" -lt 3 ] || return 1
    sleep 5
  done
}
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

# The tunnel is the only network path to the production database and knowledge
# service: SSH from VM13 to the production host (existing key), forwarding ports
# bound to loopback and the docker bridge gateway to the two containers'
# compose-network addresses. No database port is opened to the internet on
# either host. The container IPs change only if those containers are recreated;
# a stale address fails the deploy visibly instead of misrouting data.
bridge_gw="$(sudo -n docker network inspect bridge --format '{{(index .IPAM.Config 0).Gateway}}')"
db_ip="$(prod_ssh_retry 'docker inspect livingruntime-db-1 --format "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}"')" || { echo "Could not read the production database container address" >&2; exit 1; }
knowledge_ip="$(prod_ssh_retry 'docker inspect livingruntime-knowledge-1 --format "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}"')" || { echo "Could not read the production knowledge container address" >&2; exit 1; }
# Pin the production host key for the tunnel: the runner verifies this
# fingerprint (secrets.EVENTGRAPH_DEV_SSH_FINGERPRINT) on its own hops, and the
# same pin must authorize the VM13→production tunnel before the unit below
# connects. The pin is for whichever host-key algorithm the runner's client
# verifies (the pinned VM13 key in check.yml is ECDSA, not ed25519), so both
# algorithms sshd offers are scanned and only the scanned key whose fingerprint
# matches the pin is trusted — in a dedicated file rewritten on every run — and
# the connection is pinned to that algorithm so StrictHostKeyChecking matches
# the single entry.
: "${EVENTGRAPH_DEV_SSH_FINGERPRINT:?pinned production host key fingerprint (SHA256:...) required}"
mkdir -p "${HOME}/.ssh"
PROD_KNOWN_HOSTS="${HOME}/.ssh/known_hosts.prod"
prod_scan="$(mktemp "${PROD_KNOWN_HOSTS}.XXXXXX")"
scan_ok=""
prod_hit=""
i=0
while [ "$i" -lt 3 ] && [ -z "$prod_hit" ]; do
  ssh-keyscan -T 10 -t ed25519,ecdsa "$prod_host" 2>/dev/null | awk -v h="$prod_host" '$1 == h' > "$prod_scan"
  prod_hit="$(ssh-keygen -lf "$prod_scan" 2>/dev/null | awk -v fp="$EVENTGRAPH_DEV_SSH_FINGERPRINT" '$2 == fp { print NR; exit }')"
  [ -n "$prod_hit" ] || { i=$((i+1)); sleep 5; }
done
if [ -n "$prod_hit" ]; then
  awk -v n="$prod_hit" 'NR == n' "$prod_scan" > "${prod_scan}.ok" && mv "${prod_scan}.ok" "$PROD_KNOWN_HOSTS"
else
  if [ -s "$prod_scan" ]; then
    echo "production host key does not match the pinned fingerprint; refusing" >&2
  else
    echo "ssh-keyscan failed for $prod_host after 3 attempts; refusing" >&2
  fi
  rm -f "$prod_scan"
  exit 1
fi
prod_algo="$(awk '{print $2; exit}' "$PROD_KNOWN_HOSTS")"
sudo -n tee "/etc/systemd/system/$tunnel_unit.service" >/dev/null <<UNIT
[Unit]
Description=EventGraph production database and knowledge SSH tunnel for the VM13 preview
After=network-online.target docker.service
Wants=network-online.target

[Service]
User=ubuntu
ExecStart=/usr/bin/ssh -N -T -o ExitOnForwardFailure=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/home/ubuntu/.ssh/known_hosts.prod -o HostKeyAlgorithms=$prod_algo -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -i /home/ubuntu/.ssh/id_ed25519 -L 127.0.0.1:$tunnel_port:$db_ip:5432 -L $bridge_gw:$tunnel_port:$db_ip:5432 -L 127.0.0.1:$knowledge_port:$knowledge_ip:8000 -L $bridge_gw:$knowledge_port:$knowledge_ip:8000 ubuntu@$prod_host
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

# The preview reads the production database through this tunnel. Run idempotent
# migrations and missing-source seed here — the same steps a production deploy
# runs — so the schema always matches the containers being started.
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
