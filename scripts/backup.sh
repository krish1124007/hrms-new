#!/usr/bin/env bash
# =============================================================================
# HRMS — MongoDB backup (runs mongodump inside the mongodb container)
#
# Creates a timestamped tarball under ./backups/.
# Schedule via crontab on the host:
#   0 2 * * *  cd /opt/hrms && ./scripts/backup.sh >> /var/log/hrms-backup.log 2>&1
# =============================================================================

set -euo pipefail

cd "$(dirname "$0")/.."

# Load env so we know the mongo credentials
if [ -f .env ]; then
  # shellcheck disable=SC1091
  set -a; . ./.env; set +a
fi

: "${MONGO_ROOT_USERNAME:?MONGO_ROOT_USERNAME not set}"
: "${MONGO_ROOT_PASSWORD:?MONGO_ROOT_PASSWORD not set}"
DB_NAME="${MONGO_DB_NAME:-hrms}"

BACKUP_DIR="$(pwd)/backups"
mkdir -p "$BACKUP_DIR"

TS=$(date +%Y%m%d-%H%M%S)
NAME="hrms-${DB_NAME}-${TS}"

echo "🔄  Dumping ${DB_NAME} to ${BACKUP_DIR}/${NAME}.archive.gz …"

docker compose -f docker/docker-compose.yml --env-file .env exec -T mongodb \
  mongodump \
    --username "$MONGO_ROOT_USERNAME" \
    --password "$MONGO_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --db "$DB_NAME" \
    --archive --gzip \
  > "${BACKUP_DIR}/${NAME}.archive.gz"

SIZE=$(du -h "${BACKUP_DIR}/${NAME}.archive.gz" | cut -f1)
echo "✅  Backup complete: ${NAME}.archive.gz (${SIZE})"

# Retention: keep last 14 days
find "$BACKUP_DIR" -name "hrms-*.archive.gz" -mtime +14 -delete 2>/dev/null || true
echo "🧹  Pruned backups older than 14 days."
