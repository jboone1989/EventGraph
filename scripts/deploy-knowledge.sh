#!/usr/bin/env bash
# GitHub Actions-only Graphiti rollout. Reuse immutable GHCR image; never build on VM09.
# Do not recreate PostgreSQL/Neo4j or touch their persistent volumes.
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.production.yml
  -f docker-compose.knowledge.yml -f docker-compose.release.yml --profile knowledge)
EXPECTED="${EVENTGRAPH_KNOWLEDGE_RELEASE_SHA:?GitHub release SHA required}"
IMAGE="${EVENTGRAPH_KNOWLEDGE_IMAGE:?Verified GHCR knowledge image required}"
[[ "$EXPECTED" =~ ^[0-9a-f]{40}$ ]] || { echo "Invalid release SHA" >&2; exit 1; }
[[ "$IMAGE" =~ ^ghcr\.io/jboone1989/eventgraph-knowledge@sha256:[0-9a-f]{64}$ ]] || {
  echo "Invalid immutable Graphiti image reference" >&2; exit 1;
}
# Application deployment must have completed first; refuse mismatched source trees.
[[ "$(git rev-parse HEAD)" == "$EXPECTED" ]] || {
  echo "Production application checkout is not at the same verified main SHA" >&2; exit 1;
}
[[ -f .env ]] || { echo "Production environment is missing" >&2; exit 1; }
TAG="${EXPECTED:0:12}"
OLD_TAG="$(sed -n 's/^LRSITE_KNOWLEDGE_RELEASE=//p' .env | tail -n1)"
VALID='^[0-9a-f]{12}$'
if [[ "$OLD_TAG" =~ $VALID ]] &&
    git cat-file -e "$OLD_TAG^{commit}" 2>/dev/null &&
    git diff --quiet "$OLD_TAG" HEAD -- knowledge_service/ &&
    docker image inspect "livingruntime-knowledge:$OLD_TAG" >/dev/null 2>&1; then
  echo "Graphiti source unchanged ($OLD_TAG); retaining running knowledge container"
  exit 0
fi
echo "Graphiti source changed: deploying immutable knowledge image from GHCR"
if [[ -n "${GHCR_TOKEN:-}" ]]; then
  dockercfg="$(mktemp -d)"
  export DOCKER_CONFIG="$dockercfg"
  trap 'rm -rf "$dockercfg"' EXIT
  printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "${GHCR_USER:-jboone1989}" --password-stdin >/dev/null
  unset GHCR_TOKEN
fi
docker pull "$IMAGE"
docker image tag "$IMAGE" "livingruntime-knowledge:$TAG"
# Shell override is temporary. Do not commit the new tag to .env until health succeeds,
# so failed deployments can be retried on the next automated release.
LRSITE_KNOWLEDGE_RELEASE="$TAG" "${COMPOSE[@]}" up -d --no-deps --no-build --pull never knowledge
ready=0
for i in $(seq 1 20); do
  if "${COMPOSE[@]}" exec -T knowledge python -c \
      'import urllib.request; assert urllib.request.urlopen("http://127.0.0.1:8000/health",timeout=4).status==200' 2>/dev/null; then
    ready=1
    break
  fi
  sleep 3
done
[[ "$ready" == 1 ]] || { echo "Graphiti container failed /health; release not recorded" >&2; exit 1; }
python3 - "$TAG" "$IMAGE" <<'WRITE_RELEASE'
from pathlib import Path
import re, sys
tag, image = sys.argv[1:]
p = Path(".env")
data = p.read_text()
for key, value in {"LRSITE_KNOWLEDGE_RELEASE":tag, "LRSITE_KNOWLEDGE_IMAGE_REF":image}.items():
    if re.search(r"^"+key+r"=", data, re.M):
        data = re.sub(r"^"+key+r"=.*$", lambda _:key+"="+value, data, flags=re.M)
    else:
        data += "\n"+key+"="+value+"\n"
p.write_text(data)
p.chmod(0o600)
WRITE_RELEASE
echo "SUCCESS: Graphiti image updated for main $EXPECTED; Neo4j unchanged"
