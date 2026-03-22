#!/usr/bin/env bash
# deploy_digitalocean.sh
# Deploys SeeForMe backend to a DigitalOcean Droplet
# Usage: ./deploy_digitalocean.sh <droplet-ip>

set -e
DROPLET_IP=${1:?"Usage: $0 <droplet-ip>"}
SSH_USER="root"
APP_DIR="/opt/seefore"

echo "🚀 Deploying SeeForMe to DigitalOcean Droplet: $DROPLET_IP"

# Install Docker on droplet (first time only)
ssh $SSH_USER@$DROPLET_IP << 'ENDSSH'
  if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
  fi
  mkdir -p /opt/seefore
ENDSSH

# Copy backend files
echo "📦 Uploading backend..."
rsync -avz --exclude '__pycache__' --exclude '*.pyc' \
  ./backend/ $SSH_USER@$DROPLET_IP:$APP_DIR/backend/
rsync -avz .env $SSH_USER@$DROPLET_IP:$APP_DIR/.env
rsync -avz docker-compose.yml $SSH_USER@$DROPLET_IP:$APP_DIR/

# Build and restart
ssh $SSH_USER@$DROPLET_IP << ENDSSH
  cd $APP_DIR
  docker compose down || true
  docker compose build backend
  docker compose up -d backend
  echo "✅ Backend running!"
  docker compose ps
ENDSSH

echo ""
echo "✅ Deployment complete!"
echo "   Backend: http://$DROPLET_IP:8000"
echo "   Health:  http://$DROPLET_IP:8000/health"
echo ""
echo "Next: Point seefore.tech DNS → Cloudflare → $DROPLET_IP"
