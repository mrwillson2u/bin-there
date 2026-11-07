#!/usr/bin/env bash
# Refresh the dev instance's data from the newest live backup (DEC-040). Run on ubuntubot;
# it only works inside the development folder (~/bin-there, DEC-050), never ~/bin-there-prod, so it can never touch the live data.
set -euo pipefail
BACKUPS=${BACKUP_PATH:-$HOME/bin-there-backups}
cd "$(dirname "$0")/.."
case "$PWD" in
  */bin-there) ;;
  *) echo "Run this in the development folder (~/bin-there), not $PWD" >&2; exit 1 ;;
esac
SNAP=$(ls -t "$BACKUPS/snapshots" | head -1)
[ -n "$SNAP" ] || { echo "No snapshots in $BACKUPS" >&2; exit 1; }
docker compose -f compose.dev.yaml stop 2>/dev/null || true
rm -rf ./data
mkdir -p ./data/photos
cp "$BACKUPS/snapshots/$SNAP"/app.db* ./data/
cp -r "$BACKUPS/photos/." ./data/photos/
docker compose -f compose.dev.yaml up -d
echo "dev data refreshed from snapshot $SNAP ($(ls ./data/photos | wc -l) photos)"
