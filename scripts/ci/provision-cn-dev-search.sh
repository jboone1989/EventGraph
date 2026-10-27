#!/bin/sh
# On cn-dev only. GitHub Actions passes the existing DEEPSEEK_API_KEY as an
# ephemeral environment variable; never echo it or put it in a command line.
# The worker runs the already-installed, tested image. VM13 and VM09 are untouched.
set -eu
: "${DEEPSEEK_API_KEY:?DEEPSEEK_API_KEY GitHub Secret is missing}"
case "$DEEPSEEK_API_KEY" in
  *'
'*) echo "DeepSeek key must be a single line" >&2; exit 1 ;;
esac
cd /home/ubuntu/livingruntime-aihot
env_file=.env
[ -f "$env_file" ] || { echo "Missing cn-dev environment file" >&2; exit 1; }
umask 077
tmp="$(mktemp .env.search.XXXXXX)"
trap 'rm -f "$tmp"' EXIT
grep -v '^DEEPSEEK_API_KEY=' "$env_file" > "$tmp"
printf '\nDEEPSEEK_API_KEY=%s\n' "$DEEPSEEK_API_KEY" >> "$tmp"
if cmp -s "$tmp" "$env_file"; then
  echo "cn-dev search credential already current"
  exit 0
fi
cp "$tmp" "$env_file"
# Compose's backend env_file reads .env at container creation; only recreate
# the worker (never cn-dev Web/API or the DB). Its 210s stop grace is retained.
sudo -n docker compose -f docker-compose.yml up -d --no-deps --no-build --force-recreate worker
sudo -n docker exec aihot-worker-1 node --input-type=module -e \
  "import {credential} from '@aihot/backend/config'; if (!credential('models','DEEPSEEK_API_KEY')) process.exit(1); console.log('search credential configured');"
