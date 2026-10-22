#!/usr/bin/env bash
# Modified for the 2026 modernization; see NOTICE and CHANGELOG.md.
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

case "${1:-}" in
  ""|--sample) ;;
  --help|-h)
    printf '%s\n' 'Usage: bash run.sh [--sample]' \
      'Start the local stack and initialize its schema. --sample imports two synthetic records.' \
      'Requires Docker Engine/Desktop and Docker Compose v2. No existing volume is removed.'
    exit 0
    ;;
  *) printf '%s\n' 'Unknown argument. Use bash run.sh --help.' >&2; exit 2 ;;
esac
if (( $# > 1 )); then
  printf '%s\n' 'Too many arguments. Use bash run.sh --help.' >&2
  exit 2
fi

command -v docker >/dev/null || { printf '%s\n' 'Install Docker with Compose v2 first.' >&2; exit 1; }
docker compose version >/dev/null

# Never overwrite an operator-provided secret or print it into terminal/CI logs.
if [[ ! -f .env && -z "${API_TOKEN:-}" ]]; then
  token=$(docker run --rm --network none \
    node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 \
    node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')
  [[ "$token" =~ ^[a-f0-9]{64}$ ]] || { printf '%s\n' 'Could not generate an access token.' >&2; exit 1; }
  (umask 077; set -o noclobber; printf 'API_TOKEN=%s\n' "$token" > .env)
  unset token
  printf '%s\n' 'Created .env with a random access token. Keep this file private.'
fi

docker compose config --quiet
docker compose up -d --wait --wait-timeout 180 solr
docker compose run --rm bootstrap
if [[ "${1:-}" == --sample ]]; then
  docker compose run --rm import-sample
fi
docker compose up -d --build --wait --wait-timeout 120 web
address=$(docker compose port web 3000)
printf '%s\n' "Ready at http://$address. Browser username: operator; password: API_TOKEN from .env or your environment."
