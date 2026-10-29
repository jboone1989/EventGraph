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

# Transport scratch space: a stable file on cn-dev permits rsync block-level
# delta transfer across revisions and keeps partial bytes from aborted runs.
# Docker registry PUSH did not resume incomplete large blob uploads: a 28-minute
# timeout could discard the whole unfinished blob even with smaller ones done.
# The existing pinned SSH connection is reused; no new service or port is opened.
remote_dir=/home/ubuntu/.eventgraph-transfer
remote_archive="$remote_dir/current.tar"
work_dir="$(mktemp -d /var/tmp/eventgraph-transport.XXXXXX)"
trap 'rm -rf "$work_dir"' EXIT
archive="$work_dir/current.tar"
# Write as this user via a shell redirect; docker itself requires sudo.
sudo -n docker save "$image_id" > "$archive"
local_sha="$(sha256sum "$archive" | awk '{print $1}')"
# On VM13, high-loss outbound TCP collapses CUBIC's congestion window.
# BBR is available in the dev kernel; enable it before starting new SSH flows.
sudo -n modprobe tcp_bbr
sudo -n sysctl -w net.ipv4.tcp_congestion_control=bbr >/dev/null
ssh $ssh_opts ubuntu@"$cn_dev_host" "mkdir -p '$remote_dir'"
# A killed reassembly can leave an incomplete full-size copy; it is never resumable.
ssh $ssh_opts ubuntu@"$cn_dev_host" "rm -f -- '$remote_archive.ready'"

# Credit existing resumable chunks: they already occupy disk and will be
# overwritten in-place. Never credit more than the new archive's total size.
archive_bytes="$(stat -c %s "$archive")"
needed_bytes="$((archive_bytes * 2 + 268435456))"
remote_parts="$remote_dir/parts"
free_bytes="$(ssh $ssh_opts ubuntu@"$cn_dev_host" "df -B1 --output=avail '$remote_dir' | tail -n 1 | tr -d ' '")"
staged_bytes="$(ssh $ssh_opts ubuntu@"$cn_dev_host" "if [ -d '$remote_parts' ]; then du -s -B1 '$remote_parts' | cut -f1; else printf 0; fi")"
[ "$staged_bytes" -le "$archive_bytes" ] || staged_bytes="$archive_bytes"
available_bytes="$((free_bytes + staged_bytes))"
if [ "$available_bytes" -lt "$needed_bytes" ]; then
  echo "cn-dev free space $free_bytes (+ $staged_bytes staged) is below safe transport requirement $needed_bytes" >&2
  exit 1
fi

# Public VM13→cn-dev TCP shows ~1.47 MB retransmitted of 5.2 MB and cwnd=2.
# Eight bounded SSH streams move changed blocks concurrently, without any
# new service or port. The previous verified archive seeds stable chunk files.
parts_dir="$work_dir/parts"
mkdir -p "$parts_dir"
split -b 8m -d -a 3 "$archive" "$parts_dir/part."
ssh $ssh_opts ubuntu@"$cn_dev_host" "mkdir -p '$remote_parts'; if [ -f '$remote_archive' ] && [ ! -e '$remote_parts/part.000' ]; then split -b 8m -d -a 3 '$remote_archive' '$remote_parts/part.'; fi"
cat > "$work_dir/transfer-parts.sh" <<'TRANSFER'
#!/bin/sh
set -eu
parts=$1
remote_parts=$2
cn_dev_host=$3
ssh_opts=$4
pids=
active=0
failed=0
for part in "$parts"/part.*; do
  (
    rsync --archive --inplace --partial --no-whole-file \
      --compress --compress-choice=zstd --compress-level=3 --timeout=600 \
      --rsh="ssh $ssh_opts" "$part" "ubuntu@$cn_dev_host:$remote_parts/${part##*/}"
  ) &
  pids="$pids $!"
  active=$((active + 1))
  if [ "$active" -ge 8 ]; then
    for pid in $pids; do wait "$pid" || failed=1; done
    pids=
    active=0
  fi
done
for pid in $pids; do wait "$pid" || failed=1; done
[ "$failed" -eq 0 ]
TRANSFER

if ! timeout -k 5 30m sh "$work_dir/transfer-parts.sh" "$parts_dir" "$remote_parts" "$cn_dev_host" "$ssh_opts"; then
  echo "Resumable parallel VM13→cn-dev image transfer incomplete; staged bytes retained for retry" >&2
  exit 1
fi

# Rebuild into a separate path; never load or overwrite an unverified archive.
rebuild='set -eu; cat'
for part in "$parts_dir"/part.*; do
  rebuild="$rebuild '$remote_parts/${part##*/}'"
done
rebuild="$rebuild > '$remote_archive.ready'; sha256sum '$remote_archive.ready' | cut -d ' ' -f1"
remote_sha="$(ssh $ssh_opts ubuntu@"$cn_dev_host" "$rebuild")"
[ "$remote_sha" = "$local_sha" ] || {
  echo "cn-dev archive checksum mismatch; refusing to load image" >&2
  # Preserve the last verified archive and resumable parts, but free the
  # full-size failed reassembly or the next run can fail its disk preflight.
  ssh $ssh_opts ubuntu@"$cn_dev_host" "rm -f -- '$remote_archive.ready'"
  exit 1
}
ssh $ssh_opts ubuntu@"$cn_dev_host" "mv '$remote_archive.ready' '$remote_archive'"
# The verified current.tar can seed every later retry; release the staging
# parts before Docker unpacks layers to avoid a third archive-sized footprint.
ssh $ssh_opts ubuntu@"$cn_dev_host" "rm -rf -- '$remote_parts'"

ssh $ssh_opts ubuntu@"$cn_dev_host" "docker load -i '$remote_archive' >/dev/null"
remote_id="$(ssh $ssh_opts ubuntu@"$cn_dev_host" "docker image inspect --format '{{.Id}}' '$image_id'")"
[ "$remote_id" = "$image_id" ] || {
  echo "cn-dev loaded image ID $remote_id does not match $image_id" >&2
  exit 1
}
remote_revision="$(ssh $ssh_opts ubuntu@"$cn_dev_host" "docker image inspect --format '{{index .Config.Labels \"org.opencontainers.image.revision\"}}' '$image_id'")"
[ "$remote_revision" = "$EVENTGRAPH_RELEASE_SHA" ] || {
  echo "cn-dev loaded image revision does not match release" >&2
  exit 1
}
# Preserve deploy-image.sh's existing content-addressed tag and digest pairing.
ssh $ssh_opts ubuntu@"$cn_dev_host" "docker tag '$image_id' 'eventgraph-dev:${image_id#sha256:}' && printf '%s\n%s\n' 'eventgraph-dev:${image_id#sha256:}' '$EVENTGRAPH_IMAGE' > /home/ubuntu/.eventgraph-last-delivered-image.tmp && mv /home/ubuntu/.eventgraph-last-delivered-image.tmp /home/ubuntu/.eventgraph-last-delivered-image"

# Failed transfers retain resumable parts; successful checksum verification
# removes them before Docker load. Keep only the verified current.tar.

# This only runs after the exact verified image has arrived; the retired
# transport-only registry and its scratch volume have no rollback role.
ssh $ssh_opts ubuntu@"$cn_dev_host" 'if docker ps -a --format "{{.Names}}" | grep -qx eventgraph-dev-registry; then docker rm -f eventgraph-dev-registry >/dev/null; fi; docker volume inspect eventgraph-dev-registry >/dev/null 2>&1 && docker volume rm eventgraph-dev-registry >/dev/null || true'
echo "Verified image $EVENTGRAPH_IMAGE delivered to cn-dev by resumable rsync"
