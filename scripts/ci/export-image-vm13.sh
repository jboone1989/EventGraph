#!/bin/sh
# Ship a published digest from VM13 (reliable GHCR access) to cn-dev, which must
# never pull from GHCR directly (unreliable cross-border registry transfers).
# This is the delivery half of the cn-dev worker CD: it only moves image bytes
# over the pre-authorized VM13→cn-dev SSH path (the same key and host as the
# development database tunnel). Deployment and verification run separately in
# scripts/ci/deploy-image.sh on cn-dev. Production VM09 is never involved.
# Transport supplied by appleboy/ssh-action. No git pull, npm install, or build on host.
set -eu
: "${EVENTGRAPH_IMAGE:?immutable GHCR digest required}"
: "${EVENTGRAPH_RELEASE_SHA:?release SHA required}"
case "$EVENTGRAPH_IMAGE" in
  ghcr.io/jboone1989/eventgraph-app@sha256:*) ;;
  *) echo "Refusing unpinned image" >&2; exit 1 ;;
esac
case "$EVENTGRAPH_RELEASE_SHA" in
  *[!0-9a-f]*|'') echo "Invalid source SHA" >&2; exit 1 ;;
esac
[ "${#EVENTGRAPH_RELEASE_SHA}" -eq 40 ] || { echo "Invalid source SHA length" >&2; exit 1; }

cn_dev_host=43.142.127.40
# Pin cn-dev's host key: the runner verifies this fingerprint (secrets.
# EVENTGRAPH_DEV_SSH_FINGERPRINT) on its own hops, and the same pin must
# authorize the VM13→cn-dev leg before any image bytes move. The pin is for
# whichever host-key algorithm the runner's client verifies (the pinned VM13
# key in check.yml is ECDSA, not ed25519), so both algorithms sshd offers are
# scanned and only the scanned key whose fingerprint matches the pin is
# trusted — in a dedicated file rewritten on every run — and the connection is
# pinned to that algorithm so StrictHostKeyChecking matches the single entry.
: "${EVENTGRAPH_DEV_SSH_FINGERPRINT:?pinned cn-dev host key fingerprint (SHA256:...) required}"
mkdir -p "${HOME}/.ssh"
CNDEV_KNOWN_HOSTS="${HOME}/.ssh/known_hosts.cndev"
cndev_scan="$(mktemp "${CNDEV_KNOWN_HOSTS}.XXXXXX")"
ssh-keyscan -T 10 -t ed25519,ecdsa "$cn_dev_host" 2>/dev/null | awk -v h="$cn_dev_host" '$1 == h' > "$cndev_scan"
[ -s "$cndev_scan" ] || { echo "ssh-keyscan failed for $cn_dev_host" >&2; rm -f "$cndev_scan"; exit 1; }
cndev_hit="$(ssh-keygen -lf "$cndev_scan" | awk -v fp="$EVENTGRAPH_DEV_SSH_FINGERPRINT" '$2 == fp { print NR; exit }')"
[ -n "$cndev_hit" ] || { echo "cn-dev host key does not match the pinned fingerprint; refusing" >&2; rm -f "$cndev_scan"; exit 1; }
awk -v n="$cndev_hit" 'NR == n' "$cndev_scan" > "${cndev_scan}.ok" && mv "${cndev_scan}.ok" "$CNDEV_KNOWN_HOSTS"
rm -f "$cndev_scan"
cndev_algo="$(awk '{print $2; exit}' "$CNDEV_KNOWN_HOSTS")"
ssh_opts="-o StrictHostKeyChecking=yes -o UserKnownHostsFile=$CNDEV_KNOWN_HOSTS -o HostKeyAlgorithms=$cndev_algo -o ConnectTimeout=15 -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -i /home/ubuntu/.ssh/id_ed25519"

# VM13 pulls this digest for its own Web/API deploy on every release; pull only
# when this job runs first or the image was pruned. VM13 reaches GHCR reliably.
if ! sudo -n docker image inspect "$EVENTGRAPH_IMAGE" >/dev/null 2>&1; then
  sudo -n docker pull "$EVENTGRAPH_IMAGE"
fi
revision="$(sudo -n docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$EVENTGRAPH_IMAGE")"
[ "$revision" = "$EVENTGRAPH_RELEASE_SHA" ] \
  || { echo "Image revision $revision does not match release $EVENTGRAPH_RELEASE_SHA" >&2; exit 1; }
image_id="$(sudo -n docker image inspect --format '{{.Id}}' "$EVENTGRAPH_IMAGE")"

# Delivery moves bytes by pushing into a registry that runs on cn-dev's
# loopback, so the link carries only layers cn-dev does not already have.
# docker save ships every layer of the image every time (146 MB compressed for
# this app), and across the variable cross-border VM13→cn-dev link that
# repeatedly blew past the 20-minute deadline even with the #197 gzip stream
# (measured ~123 KB/s sustained on 2026-10-28; both attempts of that morning
# timed out, one finishing server-side 21 minutes in). The Registry HTTP API
# is content-addressed: each blob is HEAD-checked and only missing ones are
# uploaded, so a code-only release ships just its app layer, and a push that
# dies mid-way is resumed by the next attempt — already-uploaded blobs are
# skipped. Docker treats 127.0.0.0/8 as insecure by default, so a plain-HTTP
# registry needs no daemon configuration on either host; it is bound to
# cn-dev's loopback and reachable only through this pre-authorized SSH path.
# cn-dev never contacts GHCR. The verified image ID below still catches any
# incomplete or corrupt transfer.
registry_addr=127.0.0.1:5000
registry_image=registry:2
registry_repo="$registry_addr/eventgraph-dev"
registry_container=eventgraph-dev-registry

# Bootstrap once: cn-dev has no Docker Hub access to fetch the registry image,
# so VM13 (reliable registry access) ships it over the one-shot compressed
# stream — a few MB, needed only until the image is on cn-dev.
if ! ssh $ssh_opts ubuntu@"$cn_dev_host" "docker image inspect $registry_image >/dev/null 2>&1"; then
  sudo -n docker image inspect "$registry_image" >/dev/null 2>&1 \
    || sudo -n docker pull "$registry_image" \
    || { sudo -n docker pull mirror.gcr.io/library/"$registry_image" \
      && sudo -n docker tag mirror.gcr.io/library/"$registry_image" "$registry_image"; }
  sudo -n docker save "$registry_image" | gzip -1 | ssh $ssh_opts ubuntu@"$cn_dev_host" 'gzip -dc | docker load'
fi
# Idempotent: start the existing container if it stopped, create it otherwise,
# then wait until the API answers. A failed/incomplete delivery intentionally
# leaves this volume in place so a workflow retry can resume already-uploaded
# blobs. After a verified delivery we remove the registry and volume; the next
# release recreates it and seeds shared layers from cn-dev's last local image.
ssh $ssh_opts ubuntu@"$cn_dev_host" "docker ps --format '{{.Names}}' | grep -qx $registry_container || docker start $registry_container 2>/dev/null || docker run -d --name $registry_container --restart unless-stopped -p 127.0.0.1:5000:5000 -v eventgraph-dev-registry:/var/lib/registry $registry_image"
ssh $ssh_opts ubuntu@"$cn_dev_host" 'for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do curl --connect-timeout 3 --max-time 5 -fsS -o /dev/null http://127.0.0.1:5000/v2/ && exit 0; sleep 1; done; echo "cn-dev registry did not become ready" >&2; exit 1'

# Seed the registry from an image cn-dev already has locally (the last
# delivered tag, else any local eventgraph-dev image). Consecutive releases
# share almost all layers, so pushing the seed over cn-dev's own loopback —
# disk speed, zero cross-border bytes — lets even the first push through this
# relay skip those blobs instead of shipping the whole image like the old
# stream did. Best-effort: with no local image (first-ever deploy) the first
# push is full-size but resumable across retries.
ssh $ssh_opts ubuntu@"$cn_dev_host" 'seed="$(sed -n 1p /home/ubuntu/.eventgraph-last-delivered-image 2>/dev/null || true)"; docker image inspect "$seed" >/dev/null 2>&1 || seed="$(docker images --format "{{.Repository}}:{{.Tag}}" | grep "^eventgraph-dev:" | head -n 1)"; [ -n "$seed" ] && docker tag "$seed" 127.0.0.1:5000/eventgraph-dev:seed >/dev/null 2>&1 && docker push 127.0.0.1:5000/eventgraph-dev:seed >/dev/null 2>&1 || true'

# Push from VM13 through an SSH tunnel bound to loopback on both ends: the
# same pre-authorized connection as the database tunnel, no new port on
# either host. Killed on exit so the tunnel never outlives the script.
tunnel_pid=
trap '[ -z "$tunnel_pid" ] || kill "$tunnel_pid" 2>/dev/null || true' EXIT
start_tunnel() {
  if [ -n "$tunnel_pid" ]; then
    kill "$tunnel_pid" 2>/dev/null || true
    wait "$tunnel_pid" 2>/dev/null || true
  fi
  ssh $ssh_opts -n -N -o ExitOnForwardFailure=yes -L "$registry_addr:$registry_addr" ubuntu@"$cn_dev_host" &
  tunnel_pid=$!
}
# The cross-border SSH handshake can take longer than a local Docker push
# retry. Verify that the forwarded registry actually answers before sending
# blobs, and replace a dead/unresponsive tunnel before the next attempt.
ensure_tunnel() {
  if [ -z "$tunnel_pid" ] || ! kill -0 "$tunnel_pid" 2>/dev/null ||
    ! curl --connect-timeout 3 --max-time 5 -fsS -o /dev/null "http://$registry_addr/v2/" 2>/dev/null; then
    start_tunnel
  fi
  ready=0
  check=1
  while [ "$check" -le 45 ]; do
    if ! kill -0 "$tunnel_pid" 2>/dev/null; then break; fi
    if curl --connect-timeout 3 --max-time 5 -fsS -o /dev/null "http://$registry_addr/v2/" 2>/dev/null; then
      ready=1
      break
    fi
    check=$((check + 1))
    sleep 1
  done
  [ "$ready" -eq 1 ] || { echo "cn-dev registry SSH tunnel not ready" >&2; return 1; }
}

sudo -n docker tag "$image_id" "$registry_repo:$EVENTGRAPH_RELEASE_SHA"
# Normally the pinned base/dependency layers are already in the cn-dev registry.
# A one-off cold transfer (after a base-image update) can require ~21 minutes at
# the measured cross-border rate, so reserve 28 minutes total and 3 for a
# resumable retry. Every attempt is still bounded; a hung push cannot pin CI.
# timeout runs as root inside sudo to signal docker directly; --quiet avoids
# progress output on the slow cross-border link.
push_deadline=$(( $(date +%s) + 28 * 60 ))
pushed=0
attempt=1
while [ "$attempt" -le 3 ]; do
  ensure_tunnel
  remaining=$(( push_deadline - $(date +%s) ))
  if [ "$remaining" -le 0 ]; then
    echo "Push budget exhausted before attempt $attempt" >&2
    break
  fi
  attempt_timeout=$remaining
  [ "$attempt_timeout" -le 1500 ] || attempt_timeout=1500
  if sudo -n timeout -k 5 "$attempt_timeout" docker push --quiet "$registry_repo:$EVENTGRAPH_RELEASE_SHA"; then
    pushed=1
    break
  fi
  echo "Push attempt $attempt failed or stalled; retrying (blobs already uploaded are skipped)" >&2
  attempt=$((attempt + 1))
  [ "$attempt" -le 3 ] && sleep 5
done
[ "$pushed" = 1 ] || { echo "Pushing $EVENTGRAPH_IMAGE to the cn-dev registry failed" >&2; exit 1; }

# Pull on cn-dev from its own loopback registry (also incremental against the
# local image store), then prove the exact image (by ID) arrived before the
# deploy step runs, exactly as the previous save/load transport did. The local
# tag keeps the content-addressed contract scripts/ci/deploy-image.sh checks:
# the tag name is the image ID, so a delivered tag cannot pose as another
# image, and the pairing file binds it to this release digest.
ssh $ssh_opts ubuntu@"$cn_dev_host" "docker pull '$registry_repo:$EVENTGRAPH_RELEASE_SHA'"
remote_id="$(ssh $ssh_opts ubuntu@"$cn_dev_host" "docker image inspect --format '{{.Id}}' '$registry_repo:$EVENTGRAPH_RELEASE_SHA'")"
[ "$remote_id" = "$image_id" ] \
  || { echo "cn-dev did not end up with the published image $image_id (got ${remote_id:-none})" >&2; exit 1; }
ssh $ssh_opts ubuntu@"$cn_dev_host" "docker tag '$image_id' 'eventgraph-dev:${image_id#sha256:}' && printf '%s\\n%s\\n' 'eventgraph-dev:${image_id#sha256:}' '$EVENTGRAPH_IMAGE' > /home/ubuntu/.eventgraph-last-delivered-image.tmp && mv /home/ubuntu/.eventgraph-last-delivered-image.tmp /home/ubuntu/.eventgraph-last-delivered-image"
# Drop transport-only Docker tags after the durable local tag/pairing exists.
# Leaving either the release tag or the seed tag on an old image prevents
# deploy-image.sh from reclaiming that image by ID during stale-image cleanup.
ssh $ssh_opts ubuntu@"$cn_dev_host" "docker rmi '$registry_repo:$EVENTGRAPH_RELEASE_SHA' >/dev/null && if docker image inspect '$registry_repo:seed' >/dev/null 2>&1; then docker rmi '$registry_repo:seed' >/dev/null; fi"

# The registry is transport scratch space, not an artifact store. Once the exact
# image is pulled, ID-verified and recorded in cn-dev's local image store, tear
# down the registry and its volume completely. This avoids manifest-delete and
# stop-the-world garbage-collection semantics entirely. Failed/incomplete
# transfers never reach this point, so their volume stays available for retry
# and preserves already-uploaded blobs. Rollback images are unaffected because
# they live in cn-dev's local image store.
ssh $ssh_opts ubuntu@"$cn_dev_host" "docker rm -f $registry_container >/dev/null && docker volume rm eventgraph-dev-registry >/dev/null"
echo "Image $EVENTGRAPH_IMAGE delivered to cn-dev through the loopback registry"
