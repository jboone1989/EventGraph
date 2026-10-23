#!/usr/bin/env bash
# Promote the develop-verified immutable GHCR digest on VM09. No compile or DB/Neo4j restart.
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.production.yml
 -f docker-compose.knowledge.yml -f docker-compose.release.yml --profile knowledge)
START=$SECONDS
[[ "${1:-}" == "" || "${1:-}" == "--check" ]] || { echo "Usage: $0 [--check]" >&2; exit 2; }
git diff --quiet && git diff --cached --quiet || { echo "Dirty checkout; abort" >&2; exit 1; }
test -f .env && test -f scripts/production-smoke.py
command -v docker >/dev/null
python3 scripts/production-env-check.py .env --role production --compare config/environments/production.flags.env.example --enforce
git fetch github main
NEW_SHA="$(git rev-parse FETCH_HEAD)"
OLD_SHA="$(git rev-parse HEAD)"
[[ "$NEW_SHA" =~ ^[0-9a-f]{40}$ ]] || exit 1
# The release manifest travels with main and pins the previously validated develop image.
PIN="$(git show "$NEW_SHA:.github/production-image.env")"
SOURCE_SHA="$(printf '%s\n' "$PIN" | sed -n 's/^SOURCE_SHA=//p')"
IMAGE_REF="$(printf '%s\n' "$PIN" | sed -n 's/^IMAGE_REF=//p')"
[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "Invalid pinned develop SHA" >&2; exit 1; }
[[ "$IMAGE_REF" =~ ^ghcr\.io/jboone1989/eventgraph-app@sha256:[0-9a-f]{64}$ ]] || { echo "Invalid pinned digest" >&2; exit 1; }
git fetch github "$SOURCE_SHA"
# Changes outside automation/docs/host-only deployment tools must be the proven build inputs.
git diff --quiet "$SOURCE_SHA" "$NEW_SHA" -- . \
  ':(exclude).github/**' ':(exclude)scripts/deploy-prod.sh' \
  ':(exclude)docs/ci-cd.md' ':(exclude)docs/production-deployment.md' ||
  { echo "Main contains unverified application changes" >&2; exit 1; }
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
 echo "Promoting develop=$SOURCE_SHA image=$IMAGE_REF"
 python3 scripts/production-smoke.py
 exit 0
fi
# Graphiti/Neo4j has a separate image; an app digest cannot silently replace it.
# Keep the existing knowledge image/version. Graphiti is released independently.
if [[ "$APP_CHANGED" == 1 ]]; then
  echo "[1/5] Pull the already verified develop image (no host build)"
  docker pull "$IMAGE_REF"
  docker image tag "$IMAGE_REF" "livingruntime-app:$TAG"
  APP_TAG="$TAG"
else
  echo "[1/5] Application image unchanged; keep existing release"
fi
echo "[2/5] Reuse existing Graphiti image and persistent data"
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
for key,tag in {"LRSITE_APP_RELEASE":app,"LRSITE_KNOWLEDGE_RELEASE":knowledge,"LRSITE_RELEASE":app,"AIHOT_RELEASE":app}.items():
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
echo "[4/5] Reconcile application containers only; leave Graphiti/Neo4j running"
"${COMPOSE[@]}" up -d --no-deps --no-build --pull never api worker web
echo "[5/5] Verify real site content and graph"
OK=0
for n in 1 2 3 4 5 6 7 8 9 10; do
 if python3 scripts/production-smoke.py; then OK=1; break; fi
 sleep 6
done
[[ "$OK" == 1 ]] || { echo "Smoke failed; persisted volumes were not altered" >&2; exit 1; }
echo "SUCCESS: $NEW_SHA app=$APP_TAG knowledge=$KNOWLEDGE_TAG elapsed=${SECONDS}s"
