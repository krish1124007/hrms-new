#!/usr/bin/env bash
# =============================================================================
# HRMS — One-shot deploy / redeploy helper
#
# Usage (from project root):
#   ./scripts/deploy.sh         # build + start the stack
#   ./scripts/deploy.sh logs    # tail logs
#   ./scripts/deploy.sh stop    # stop the stack (data preserved)
#   ./scripts/deploy.sh down    # stop + remove containers (volumes preserved)
#   ./scripts/deploy.sh nuke    # stop + remove containers AND volumes (DANGER)
#   ./scripts/deploy.sh seed    # run the admin seed (creates admin@example.com)
# =============================================================================

set -euo pipefail

cd "$(dirname "$0")/.."

# --- Pre-flight checks ------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  echo "❌ docker is not installed. Install Docker first."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "❌ docker compose plugin is not available."
  exit 1
fi

if [ ! -f .env ]; then
  echo "❌ .env not found. Copy .env.production → .env and fill in the values."
  exit 1
fi

# --- Subcommand dispatcher --------------------------------------------------
cmd="${1:-up}"

case "$cmd" in
  up|deploy)
    echo "🔨  Building images…"
    docker compose -f docker/docker-compose.yml --env-file .env build
    echo "🚀  Starting stack…"
    docker compose -f docker/docker-compose.yml --env-file .env up -d
    echo "✅  Stack is up. Tail logs with:  ./scripts/deploy.sh logs"
    docker compose -f docker/docker-compose.yml ps
    ;;
  logs)
    docker compose -f docker/docker-compose.yml --env-file .env logs -f --tail=200
    ;;
  stop)
    docker compose -f docker/docker-compose.yml --env-file .env stop
    ;;
  down)
    docker compose -f docker/docker-compose.yml --env-file .env down
    ;;
  nuke)
    read -r -p "⚠️   This will delete ALL data (mongo, redis, uploads). Type YES to continue: " confirm
    [ "$confirm" = "YES" ] || { echo "Aborted."; exit 1; }
    docker compose -f docker/docker-compose.yml --env-file .env down -v
    ;;
  seed)
    echo "🌱  Seeding default admin (admin@example.com / Admin@123)…"
    docker compose -f docker/docker-compose.yml --env-file .env exec api \
      node /app/apps/api/dist/scripts/seed-admin.js
    echo "ℹ️   Change this password immediately after first login."
    ;;
  ps|status)
    docker compose -f docker/docker-compose.yml --env-file .env ps
    ;;
  *)
    echo "Unknown command: $cmd"
    echo "Usage: $0 {up|logs|stop|down|nuke|seed|ps}"
    exit 1
    ;;
esac
