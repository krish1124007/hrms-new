#!/usr/bin/env bash
# =============================================================================
# HRMS — Import bundled data on the VPS (after deploy.sh up)
#
# Reads:
#   data-export/mongo.archive.gz   — restored into the mongodb container
#   data-export/uploads/           — copied into the hrms_uploads volume
#
# Idempotent-ish: --drop replaces collections in the target DB. Re-running
# will overwrite whatever was there.
# =============================================================================

set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f data-export/mongo.archive.gz ]; then
  echo "❌  data-export/mongo.archive.gz not found."
  echo "    Did you run scripts/export-local-data.sh on your laptop and re-zip?"
  exit 1
fi

if [ ! -f .env ]; then
  echo "❌  .env not found. Run: cp .env.production .env  and fill in values."
  exit 1
fi

# Load env so we have mongo creds + db name
set -a; . ./.env; set +a
: "${MONGO_ROOT_USERNAME:?}"; : "${MONGO_ROOT_PASSWORD:?}"
DB_NAME="${MONGO_DB_NAME:-hrms}"

# Detect the source DB name from the dump's manifest if available
SOURCE_DB="$DB_NAME"
if [ -f data-export/MANIFEST.txt ]; then
  SRC=$(grep -E "^DB name" data-export/MANIFEST.txt | awk '{print $NF}')
  [ -n "$SRC" ] && SOURCE_DB="$SRC"
fi

echo "ℹ️   Source DB in dump : ${SOURCE_DB}"
echo "ℹ️   Target DB on VPS  : ${DB_NAME}"

# Sanity check that the stack is running
if ! docker compose -f docker/docker-compose.yml --env-file .env ps mongodb \
     | grep -qE "(running|healthy)"; then
  echo "❌  hrms-mongo container is not running. Start it first: ./scripts/deploy.sh up"
  exit 1
fi

read -r -p "⚠️   This will OVERWRITE database '${DB_NAME}'. Type YES to continue: " confirm
[ "$confirm" = "YES" ] || { echo "Aborted."; exit 1; }

# --- 1. Restore MongoDB ----------------------------------------------------
echo ""
echo "🔄  Restoring Mongo dump (all databases)…"

# We use docker exec with environment variables inside the container to avoid shell escaping issues
docker compose -f docker/docker-compose.yml --env-file .env exec -T mongodb sh -c '
  mongorestore \
    --username "$MONGO_INITDB_ROOT_USERNAME" \
    --password "$MONGO_INITDB_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --drop \
    --archive --gzip' < data-export/mongo.archive.gz

echo "✅  Mongo restore complete."

# --- 2. Copy uploads into the Docker volume --------------------------------
if [ -d data-export/uploads ]; then
  echo ""
  echo "📁  Copying uploads into hrms_uploads volume…"

  # Resolve the actual volume name (compose prefixes with the project name).
  VOLUME_NAME=$(docker volume ls --format '{{.Name}}' | grep -E '_hrms_uploads$' | head -1)
  if [ -z "$VOLUME_NAME" ]; then
    echo "❌  Couldn't find the hrms_uploads volume. Is the stack up?"
    exit 1
  fi
  echo "    Volume: ${VOLUME_NAME}"

  # Run a throwaway alpine container with the volume mounted, copy files in.
  docker run --rm \
    -v "${VOLUME_NAME}:/dest" \
    -v "$(pwd)/data-export/uploads:/src:ro" \
    alpine sh -c "cp -R /src/. /dest/ && chown -R 1000:1000 /dest"

  echo "✅  Uploads imported."
fi

# --- 3. Reindex Meilisearch (best-effort) ----------------------------------
echo ""
echo "🔁  Restarting API so it re-warms caches and Meilisearch indexes…"
docker compose -f docker/docker-compose.yml --env-file .env restart api

echo ""
echo "✅  All done. Hit your domain and log in with your existing credentials."
