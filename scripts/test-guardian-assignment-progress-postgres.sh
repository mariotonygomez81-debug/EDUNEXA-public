#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="edunexa-guardian-progress-$$"
PORT="${EDUNEXA_PG_PORT:-55439}"
IMAGE="${EDUNEXA_POSTGRES_IMAGE:-postgres:16-alpine}"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Install Docker Desktop or Docker Engine, then retry." >&2
  exit 2
fi

docker run --detach --rm \
  --name "$CONTAINER" \
  --publish "127.0.0.1:$PORT:5432" \
  --env POSTGRES_PASSWORD=postgres \
  --env POSTGRES_DB=edunexa_guardian_test \
  "$IMAGE" >/dev/null

ready=0
for attempt in $(seq 1 40); do
  if docker exec "$CONTAINER" pg_isready -U postgres -d edunexa_guardian_test >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "Temporary PostgreSQL container did not become ready." >&2
  docker logs "$CONTAINER" >&2 || true
  exit 1
fi

psql_in_container() {
  docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d edunexa_guardian_test
}

psql_in_container < "$ROOT/scripts/fixtures/guardian-assignment-progress-postgres.sql"
psql_in_container < "$ROOT/docs/database/guardian-assignment-progress.draft.sql"
psql_in_container < "$ROOT/scripts/fixtures/guardian-assignment-progress-postgres.assertions.sql"

echo "PASS: isolated PostgreSQL validation completed. No Supabase project was contacted."
