#!/usr/bin/env bash
# =============================================================================
# HRMS — MongoDB restore from a backup created by backup.sh
#
# Usage:
#   ./scripts/restore.sh ./backups/hrms-hrms-20260101-020000.archive.gz
# =============================================================================

set -euo pipefail

cd "$(dirname "$0")/.."

if [ $# -ne 1 ]; then
  echo "Usage: $0 <path-to-archive.gz>"
  exit 1
fi

ARCHIVE="$1"
[ -f "$ARCHIVE" ] || { echo "❌ File not found: $ARCHIVE"; exit 1; }

if [ -f .env ]; then
  set -a; . ./.env; set +a
fi

: "${MONGO_ROOT_USERNAME:?}"; : "${MONGO_ROOT_PASSWORD:?}"
DB_NAME="${MONGO_DB_NAME:-hrms}"

read -r -p "⚠️   This will OVERWRITE database '${DB_NAME}'. Type YES to continue: " confirm
[ "$confirm" = "YES" ] || { echo "Aborted."; exit 1; }

echo "🔄  Restoring ${ARCHIVE} → ${DB_NAME} …"
docker compose -f docker/docker-compose.yml --env-file .env exec -T mongodb \
  mongorestore \
    --username "$MONGO_ROOT_USERNAME" \
    --password "$MONGO_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --nsInclude "${DB_NAME}.*" \
    --drop \
    --archive --gzip \
  < "$ARCHIVE"

echo "✅  Restore complete."
