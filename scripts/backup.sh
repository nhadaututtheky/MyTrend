#!/bin/bash
set -e

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/mytrend_backup_${TIMESTAMP}.tar.gz"

echo "=== MyTrend Backup ==="

mkdir -p "$BACKUP_DIR"

# Backup PocketBase data
echo "Backing up PocketBase data..."
docker compose exec -T pocketbase ./pocketbase backup

# Copy the backup from the container volume
echo "Creating archive..."
tar -czf "$BACKUP_FILE" \
  -C "$(docker volume inspect mytrend_pb_data --format '{{ .Mountpoint }}')" . \
  2>/dev/null || {
    # Fallback: use docker cp
    CONTAINER_ID=$(docker compose ps -q pocketbase)
    docker cp "${CONTAINER_ID}:/pb/pb_data" "/tmp/pb_data_backup"
    tar -czf "$BACKUP_FILE" -C "/tmp/pb_data_backup" .
    rm -rf "/tmp/pb_data_backup"
  }

echo "Backup created: $BACKUP_FILE"

# Keep only last 7 backups
ls -t "${BACKUP_DIR}"/mytrend_backup_*.tar.gz 2>/dev/null | tail -n +8 | xargs rm -f 2>/dev/null || true

echo "=== Backup Complete ==="
