#!/bin/sh
# Read-only gate before moving develop into main. No pulling, building or writes.
set -eu
: "${EVENTGRAPH_DIR:?Missing production checkout directory}"
cd "$EVENTGRAPH_DIR"
for f in .env docker-compose.yml docker-compose.production.yml docker-compose.knowledge.yml docker-compose.release.yml; do
  test -f "$f" || { echo "Missing production stack: $f" >&2; exit 1; }
done
compose() {
  docker compose -p livingruntime -f docker-compose.yml -f docker-compose.production.yml \
    -f docker-compose.knowledge.yml -f docker-compose.release.yml "$@"
}
compose config --quiet
for service in db api worker web; do
  id="$(compose ps --status running -q "$service")"
  test -n "$id" || { echo "Production $service is not running; refuse release" >&2; exit 1; }
done
# Existing traffic and persistent volumes are read-only inspected here.
compose exec -T web node -e \
  'fetch("http://127.0.0.1:3000/api/health").then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))'
echo "Production Compose, running services and health endpoint verified"
