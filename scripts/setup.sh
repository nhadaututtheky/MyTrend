#!/bin/bash
set -e

echo "=== MyTrend Setup ==="

# Check Docker
if ! command -v docker &> /dev/null; then
  echo "ERROR: Docker is not installed. Please install Docker first."
  exit 1
fi

if ! command -v docker compose &> /dev/null && ! command -v docker-compose &> /dev/null; then
  echo "ERROR: Docker Compose is not installed."
  exit 1
fi

# Create .env if not exists
if [ ! -f .env ]; then
  echo "Creating .env from .env.example..."
  cp .env.example .env
  echo "Please edit .env with your settings before starting."
fi

# Create data directories
mkdir -p pb_data nm_data

# Build and start
echo "Building and starting services..."
docker compose up -d --build

echo ""
echo "=== MyTrend is running! ==="
echo "Frontend:  http://localhost:3000"
echo "PocketBase Admin: http://localhost:8090/_/"
echo "Nginx:     http://localhost"
echo ""
echo "First time? Create an admin account at the PocketBase Admin URL above."
