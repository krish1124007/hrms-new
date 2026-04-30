#!/usr/bin/env bash
# =============================================================================
# HRMS — Export local development data so it can be migrated to the VPS
#
# Run this on YOUR LAPTOP (not the VPS) before zipping the deploy folder.
# It produces:
#   data-export/mongo.archive.gz   — full Mongo dump
#   data-export/uploads/           — copy of apps/api/uploads
#
# Then re-zip the project and ship it to the VPS. After deploy.sh up,
# run scripts/import-data.sh on the VPS to load it all.
#
# Usage:
#   ./scripts/export-local-data.sh                                   # default localhost
#   MONGODB_URI=mongodb://localhost:27017/hrms ./scripts/export-local-data.sh
# =============================================================================

set -euo pipefail

cd "$(dirname "$0")/.."

MONGODB_URI="${MONGODB_URI:-mongodb://localhost:27017/hrms}"
DB_NAME="${MONGODB_URI##*/}"
DB_NAME="${DB_NAME%%\?*}"   # strip query string if present

if ! command -v mongodump >/dev/null 2>&1; then
  echo "❌  mongodump not found in PATH."
  echo "    Install MongoDB Database Tools:"
  echo "        macOS  : brew install mongodb-database-tools"
  echo "        Ubuntu : sudo apt-get install mongodb-database-tools"
  exit 1
fi

mkdir -p data-export

echo "🔄  Dumping ${MONGODB_URI} (db=${DB_NAME}) → data-export/mongo.archive.gz"
mongodump --uri="$MONGODB_URI" --archive=data-export/mongo.archive.gz --gzip

if [ -d apps/api/uploads ]; then
  echo "📁  Copying apps/api/uploads → data-export/uploads/"
  rm -rf data-export/uploads
  cp -R apps/api/uploads data-export/uploads
  # Strip macOS metadata
  find data-export/uploads -name ".DS_Store" -delete 2>/dev/null || true
fi

# Marker file the VPS importer reads to know what's bundled
cat > data-export/MANIFEST.txt <<EOF
HRMS data export
================
Created : $(date -u +"%Y-%m-%dT%H:%M:%SZ")
DB name : ${DB_NAME}
Source  : ${MONGODB_URI}
Dump    : mongo.archive.gz ($(du -h data-export/mongo.archive.gz | cut -f1))
Uploads : $(if [ -d data-export/uploads ]; then du -sh data-export/uploads | cut -f1; else echo "(none)"; fi)
EOF

echo ""
echo "✅  Export complete:"
cat data-export/MANIFEST.txt
echo ""
echo "Next steps:"
echo "  1. Re-create the deployment zip with this folder included."
echo "  2. Upload the zip to the VPS."
echo "  3. On the VPS, after './scripts/deploy.sh up', run:"
echo "        ./scripts/import-data.sh"
