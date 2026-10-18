#!/usr/bin/env bash
# Immutable, incremental release from cn-dev -> VM09. No DB/Neo4j restart, no data import.
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
DEV="ubuntu@43.142.127.40"
DEV_ROOT="/home/ubuntu/livingruntime-aihot"
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=12 -o ServerAliveInterval=15 "${DEV}")
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.production.yml
 -f docker-compose.knowledge.yml -f docker-compose.release.yml --profile knowledge)
umask 077
LOCK_PATH="$HOME/.eventgraph-production-release.lock"
exec 9>"$LOCK_PATH"
command -v flock >/dev/null || { echo "flock is required" >&2; exit 1; }
flock -n 9 || { echo "Another production release or --check is active" >&2; exit 1; }
START=$SECONDS
RELEASE_STARTED=0
MIGRATION_ATTEMPTED=0
ENV_SNAPSHOT=''
rollback_on_exit() {
 local rc="$1"
 trap - EXIT
 if [[ "$rc" != 0 && "$RELEASE_STARTED" == 1 ]]; then
  if [[ "$MIGRATION_ATTEMPTED" == 1 ]]; then
   echo "ALERT: migration may have run; manual recovery required" >&2
  else
   echo "ALERT: restoring prior checkout and environment" >&2
   [[ -f "$ENV_SNAPSHOT" ]] && cp -p "$ENV_SNAPSHOT" .env
   git reset --hard "$OLD_SHA" || echo "ALERT: git rollback failed" >&2
   "${COMPOSE[@]}" up -d --no-deps --no-build --pull never api worker web knowledge || echo "ALERT: container rollback failed" >&2
   python3 scripts/production-smoke.py || echo "ALERT: rollback smoke failed" >&2
  fi
 fi
 exit "$rc"
}
trap 'rollback_on_exit "$?"' EXIT
[[ "${1:-}" == "" || "${1:-}" == "--check" ]] || { echo "Usage: $0 [--check]" >&2; exit 2; }
git diff --quiet && git diff --cached --quiet || { echo "Dirty checkout; abort" >&2; exit 1; }
test -f .env && test -f scripts/production-smoke.py
command -v docker >/dev/null
python3 scripts/production-env-check.py .env --role production --compare config/environments/production.flags.env.example --enforce
# Verify that production and builder use the same immutable EventGraph source commit.
git fetch github main
NEW_SHA="$(git rev-parse FETCH_HEAD)"
OLD_SHA="$(git rev-parse HEAD)"
[[ "$NEW_SHA" =~ ^[0-9a-f]{40}$ ]] || exit 1
CANONICAL_SHA="$(git ls-remote https://github.com/jboone1989/EventGraph.git refs/heads/main | awk '{print $1}')"
[[ "$CANONICAL_SHA" == "$NEW_SHA" ]] || { echo "Source mismatch: production remote is not EventGraph main" >&2; exit 1; }
python3 - "$NEW_SHA" <<'VERIFY_CI'
import json,os,sys,urllib.request
sha=sys.argv[1]
url=("https://api.github.com/repos/jboone1989/EventGraph/actions/workflows/"
     "check.yml/runs?head_sha="+sha+"&event=push&per_page=20")
headers={"Accept":"application/vnd.github+json","User-Agent":"eventgraph-release-check"}
if os.getenv("GITHUB_TOKEN"):
    headers["Authorization"]="Bearer "+os.environ["GITHUB_TOKEN"]
try:
    with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=20) as res:
        runs=json.load(res).get("workflow_runs",[])
except Exception as e:
    raise SystemExit("CI verification unavailable, refusing release: "+type(e).__name__)
if not any(r.get("head_sha")==sha and r.get("head_branch")=="main" and
           r.get("event")=="push" and r.get("status")=="completed" and
           r.get("conclusion")=="success" for r in runs):
    raise SystemExit("No completed successful main-push Check for "+sha)
print("CI verified:",sha)
VERIFY_CI
TAG="${NEW_SHA:0:12}"
read_tag() { sed -n "s/^$1=//p" .env | tail -n1; }
OLD_TAG="$(read_tag LRSITE_RELEASE)"
APP_TAG="$(read_tag LRSITE_APP_RELEASE)"
KNOWLEDGE_TAG="$(read_tag LRSITE_KNOWLEDGE_RELEASE)"
APP_TAG="${APP_TAG:-$OLD_TAG}"
KNOWLEDGE_TAG="${KNOWLEDGE_TAG:-$OLD_TAG}"
VALID='^[0-9a-f]{12}$'
APP_CHANGED=0; KNOWLEDGE_CHANGED=0; SCHEMA_CHANGED=0
# Compare from the image's source commit, not checkout HEAD; source may already
# be updated while the running containers still have a previous release tag.
APP_BASE="$OLD_SHA"; KNOWLEDGE_BASE="$OLD_SHA"
if [[ "$APP_TAG" =~ $VALID ]] && git cat-file -e "$APP_TAG^{commit}" 2>/dev/null; then
 APP_BASE="$APP_TAG"
else APP_CHANGED=1
fi
if [[ "$KNOWLEDGE_TAG" =~ $VALID ]] && git cat-file -e "$KNOWLEDGE_TAG^{commit}" 2>/dev/null; then
 KNOWLEDGE_BASE="$KNOWLEDGE_TAG"
else KNOWLEDGE_CHANGED=1
fi
if ! git diff --quiet "$KNOWLEDGE_BASE" "$NEW_SHA" -- knowledge_service/; then KNOWLEDGE_CHANGED=1; fi
# A code change rebuilds the shared app image; knowledge_service is independent.
while IFS= read -r path; do
 case "$path" in
  knowledge_service/*) KNOWLEDGE_CHANGED=1 ;;
  database/migrations/*) APP_CHANGED=1; SCHEMA_CHANGED=1 ;;
  docs/*|.github/*|tests/*|apps/web/tests/*|README*|AGENTS.md|CLAUDE.md|CONTRIBUTING.md|SECURITY.md|NOTICE|LICENSE|.env.example|scripts/deploy-prod.sh|scripts/production-env-check.py|scripts/production-smoke.py) ;;
  docker-compose.*.yml|docker-compose.yml) ;; # Compose applies its own configuration hash
  *) APP_CHANGED=1 ;;
 esac
done < <(git diff --name-only "$APP_BASE" "$NEW_SHA")
if [[ ! "$APP_TAG" =~ $VALID ]] || ! docker image inspect "livingruntime-app:$APP_TAG" >/dev/null 2>&1; then APP_CHANGED=1; fi
if [[ ! "$KNOWLEDGE_TAG" =~ $VALID ]] || ! docker image inspect "livingruntime-knowledge:$KNOWLEDGE_TAG" >/dev/null 2>&1; then KNOWLEDGE_CHANGED=1; fi
if [[ "${1:-}" == "--check" ]]; then
 echo "Source old=$OLD_SHA new=$NEW_SHA rebuild_app=$APP_CHANGED rebuild_knowledge=$KNOWLEDGE_CHANGED migrate=$SCHEMA_CHANGED"
 LRSITE_APP_RELEASE="${APP_TAG:-$TAG}" LRSITE_KNOWLEDGE_RELEASE="${KNOWLEDGE_TAG:-$TAG}" "${COMPOSE[@]}" config --quiet
 "${SSH[@]}" "git -C '$DEV_ROOT' rev-parse --is-inside-work-tree"
 python3 scripts/production-smoke.py
 exit 0
fi
if [[ "$APP_CHANGED" == 1 || "$KNOWLEDGE_CHANGED" == 1 ]]; then
 echo "[1/5] Build only changed images on cn-dev"
 "${SSH[@]}" "bash -s -- '$NEW_SHA' '$TAG' '$DEV_ROOT' '$APP_CHANGED' '$KNOWLEDGE_CHANGED'" <<'BUILD_ON_DEV'
set -Eeuo pipefail
SHA="$1"; TAG="$2"; ROOT="$3"; APP="$4"; KNOWLEDGE="$5"
git -C "$ROOT" fetch https://github.com/jboone1989/EventGraph.git main
[[ "$(git -C "$ROOT" rev-parse FETCH_HEAD)" == "$SHA" ]] || { echo "Source mismatch" >&2; exit 1; }
TMP="$(mktemp -d /tmp/livingruntime-build.XXXXXXXX)"
trap 'rm -rf "$TMP"' EXIT
git -C "$ROOT" archive "$SHA" | tar -xf - -C "$TMP"
if [[ "$APP" == 1 ]]; then docker build -t "livingruntime-app:$TAG" -f "$TMP/Dockerfile" "$TMP"; fi
if [[ "$KNOWLEDGE" == 1 ]]; then docker build -t "livingruntime-knowledge:$TAG" -f "$TMP/knowledge_service/Dockerfile" "$TMP"; fi
BUILD_ON_DEV
 echo "[2/5] Transfer only changed image(s)"
 if [[ "$APP_CHANGED" == 1 ]]; then
  "${SSH[@]}" "docker image save livingruntime-app:$TAG | gzip -1" | gzip -dc | docker image load
  APP_TAG="$TAG"
 fi
 if [[ "$KNOWLEDGE_CHANGED" == 1 ]]; then
  "${SSH[@]}" "docker image save livingruntime-knowledge:$TAG | gzip -1" | gzip -dc | docker image load
  KNOWLEDGE_TAG="$TAG"
 fi
else
 echo "[1–2/5] No image changes: reuse existing app and knowledge images"
fi
echo "[3/5] Advance checkout and pin per-service release image"
git merge --ff-only "$NEW_SHA"
[[ "$(git rev-parse HEAD)" == "$NEW_SHA" ]] || exit 1
python3 - "$APP_TAG" "$KNOWLEDGE_TAG" <<'WRITE_RELEASE'
from pathlib import Path
import os,re,sys
app,knowledge=sys.argv[1:]
assert all(re.fullmatch(r"[0-9a-f]{12}", tag) for tag in (app,knowledge))
p=Path(".env")
data=p.read_text()
for key,tag in {"LRSITE_APP_RELEASE":app,"LRSITE_KNOWLEDGE_RELEASE":knowledge,"LRSITE_RELEASE":app}.items():
 if re.search(r"^"+key+r"=",data,re.M):
  data=re.sub(r"^"+key+r"=.*$",key+"="+tag,data,flags=re.M)
 else:data+="\n"+key+"="+tag+"\n"
p.write_text(data)
os.chmod(p,0o600)
WRITE_RELEASE
python3 scripts/production-env-check.py .env --role production --compare config/environments/production.flags.env.example --enforce
"${COMPOSE[@]}" config --quiet
echo "[4/5] Apply schema migration only if migration files changed"
if [[ "$SCHEMA_CHANGED" == 1 ]]; then
 "${COMPOSE[@]}" run --rm --no-deps setup
fi
# Compose compares image/config hashes; no --force-recreate, no --build, and
# no dependencies => PostgreSQL and Neo4j are never recreated for an app release.
echo "[4/5] Reconcile only application services and Graphiti config"
"${COMPOSE[@]}" up -d --no-deps --no-build --pull never api worker web knowledge
echo "[5/5] Verify real site content and graph"
OK=0
for n in 1 2 3 4 5 6 7 8 9 10; do
 if python3 scripts/production-smoke.py; then OK=1; break; fi
 sleep 6
done
[[ "$OK" == 1 ]] || { echo "Smoke failed; persisted volumes were not altered" >&2; exit 1; }
echo "SUCCESS: $NEW_SHA app=$APP_TAG knowledge=$KNOWLEDGE_TAG elapsed=${SECONDS}s"
