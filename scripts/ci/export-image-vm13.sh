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
# authorize the VM13→cn-dev leg before any image bytes move. The verified key
# goes to a dedicated file rewritten on every run, so entries appended by the
# earlier trust-on-first-keyscan bootstrap cannot authorize a different key.
: "${EVENTGRAPH_DEV_SSH_FINGERPRINT:?pinned cn-dev host key fingerprint (SHA256:...) required}"
mkdir -p "${HOME}/.ssh"
CNDEV_KNOWN_HOSTS="${HOME}/.ssh/known_hosts.cndev"
cndev_scan="$(mktemp "${CNDEV_KNOWN_HOSTS}.XXXXXX")"
ssh-keyscan -T 10 -t ed25519 "$cn_dev_host" 2>/dev/null | awk -v h="$cn_dev_host" '$1 == h' | head -n 1 > "$cndev_scan"
[ -s "$cndev_scan" ] || { echo "ssh-keyscan failed for $cn_dev_host" >&2; rm -f "$cndev_scan"; exit 1; }
ssh-keygen -lf "$cndev_scan" | awk -v fp="$EVENTGRAPH_DEV_SSH_FINGERPRINT" '$2 == fp { ok = 1 } END { exit !ok }' \
  || { echo "cn-dev host key does not match the pinned fingerprint; refusing" >&2; rm -f "$cndev_scan"; exit 1; }
mv "$cndev_scan" "$CNDEV_KNOWN_HOSTS"
ssh_opts="-o StrictHostKeyChecking=yes -o UserKnownHostsFile=$CNDEV_KNOWN_HOSTS -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -i /home/ubuntu/.ssh/id_ed25519"

# VM13 pulls this digest for its own Web/API deploy on every release; pull only
# when this job runs first or the image was pruned. VM13 reaches GHCR reliably.
if ! sudo -n docker image inspect "$EVENTGRAPH_IMAGE" >/dev/null 2>&1; then
  sudo -n docker pull "$EVENTGRAPH_IMAGE"
fi
revision="$(sudo -n docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$EVENTGRAPH_IMAGE")"
[ "$revision" = "$EVENTGRAPH_RELEASE_SHA" ] \
  || { echo "Image revision $revision does not match release $EVENTGRAPH_RELEASE_SHA" >&2; exit 1; }
image_id="$(sudo -n docker image inspect --format '{{.Id}}' "$EVENTGRAPH_IMAGE")"

# Stream the image to cn-dev without writing a tarball on either host; cn-dev
# never contacts the registry. ubuntu on cn-dev may run docker (docker group).
# docker save|load cannot preserve registry digest references, so delivery uses
# a content-addressed local tag (eventgraph-dev:<image ID hex>): the deploy
# script rejects any tag that does not point at the ID named by its own hex.
tag="eventgraph-dev:${image_id#sha256:}"
sudo -n docker tag "$image_id" "$tag"
sudo -n docker save "$tag" | ssh $ssh_opts ubuntu@"$cn_dev_host" 'docker load'

# Prove the exact image (by ID) arrived before cn-dev tries to deploy it.
remote_id="$(ssh $ssh_opts ubuntu@"$cn_dev_host" "docker image inspect --format '{{.Id}}' '$tag'")"
[ "$remote_id" = "$image_id" ] \
  || { echo "cn-dev did not end up with the published image $image_id (got ${remote_id:-none})" >&2; exit 1; }
# Record the verified pairing so deploy-image.sh can bind this tag to this
# release digest (CI steps cannot know the image ID in advance).
ssh $ssh_opts ubuntu@"$cn_dev_host" "printf '%s\\n%s\\n' '$tag' '$EVENTGRAPH_IMAGE' > /home/ubuntu/.eventgraph-last-delivered-image.tmp && mv /home/ubuntu/.eventgraph-last-delivered-image.tmp /home/ubuntu/.eventgraph-last-delivered-image"
echo "Image $EVENTGRAPH_IMAGE delivered to cn-dev as $tag"
