#!/usr/bin/env bash
# APIbase.pro — Server Bootstrap Script (§12.69, §12.194)
#
# Takes a clean Hetzner server (Ubuntu 22.04/24.04) from zero to production
# in ~2-3 minutes.
#
# Usage (as root on fresh server):
#   curl -O https://raw.githubusercontent.com/apibase/apibase/main/scripts/bootstrap.sh
#   bash bootstrap.sh
#
# Prerequisites:
#   - Fresh Ubuntu 22.04+ server
#   - Root SSH access
#   - .env.enc in repo (or manual .env placement)
#   - GHCR access configured (ghcr.io/apibase/apibase)
#
# What this script does:
#   1.  Update system packages
#   2.  Install Docker + Docker Compose
#   3.  Configure UFW firewall (22, 80, 443 only)
#   4.  Create deploy user (appuser:1001)
#   5.  Harden SSH (disable root login, password auth)
#   6.  Install fail2ban + unattended-upgrades
#   7.  Clone repository
#   8.  Decrypt .env.enc → .env (chmod 600)
#   9.  Pull Docker images
#   10. Start stack (entrypoint.sh handles migrations)
#   11. Wait for /health/ready
#   12. Run smoke tests
#   13. Setup certbot for TLS
#   14. Setup host cron jobs (certbot renewal, Docker prune)
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
DEPLOY_USER="deploy"
DEPLOY_UID=1001
APP_DIR="/opt/app"
REPO_URL="https://github.com/apibase/apibase.git"
COMPOSE_CMD="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
DOMAIN="apibase.pro"
READINESS_TIMEOUT=120
READINESS_INTERVAL=3

log() { echo "[bootstrap] $(date -u +%Y-%m-%dT%H:%M:%SZ) $1"; }
die() { log "FATAL: $1"; exit 1; }

# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------
if [ "$(id -u)" -ne 0 ]; then
  die "This script must be run as root"
fi

log "Starting bootstrap for $DOMAIN"
log "Target directory: $APP_DIR"

# ---------------------------------------------------------------------------
# Step 1: System update
# ---------------------------------------------------------------------------
log "Step 1/14: Updating system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

# ---------------------------------------------------------------------------
# Step 2: Install Docker + Docker Compose
# ---------------------------------------------------------------------------
log "Step 2/14: Installing Docker"
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  apt-get install -y -qq docker-compose-plugin
  systemctl enable docker
  systemctl start docker
  log "Docker installed: $(docker --version)"
else
  log "Docker already installed: $(docker --version)"
fi

# Verify Docker Compose plugin
docker compose version || die "Docker Compose plugin not available"

# ---------------------------------------------------------------------------
# Step 3: Configure UFW (§12.245 — ports 22, 80, 443 only)
# ---------------------------------------------------------------------------
log "Step 3/14: Configuring firewall"
if ! command -v ufw &>/dev/null; then
  apt-get install -y -qq ufw
fi

ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP (certbot + redirect)
ufw allow 443/tcp  # HTTPS
ufw --force enable
log "UFW enabled: 22, 80, 443 only"

# ---------------------------------------------------------------------------
# Step 4: Create deploy user (non-root, §12.219)
# ---------------------------------------------------------------------------
log "Step 4/14: Creating deploy user"
if ! id "$DEPLOY_USER" &>/dev/null; then
  adduser --disabled-password --gecos "" --uid "$DEPLOY_UID" "$DEPLOY_USER"
  usermod -aG docker "$DEPLOY_USER"

  # Copy SSH keys from root
  mkdir -p "/home/$DEPLOY_USER/.ssh"
  if [ -f /root/.ssh/authorized_keys ]; then
    cp /root/.ssh/authorized_keys "/home/$DEPLOY_USER/.ssh/"
  fi
  chown -R "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
  chmod 700 "/home/$DEPLOY_USER/.ssh"
  chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys" 2>/dev/null || true

  log "User '$DEPLOY_USER' created (uid=$DEPLOY_UID, docker group)"
else
  log "User '$DEPLOY_USER' already exists"
  usermod -aG docker "$DEPLOY_USER" 2>/dev/null || true
fi

# ---------------------------------------------------------------------------
# Step 5: Harden SSH
# ---------------------------------------------------------------------------
log "Step 5/14: Hardening SSH"
SSHD_CONFIG="/etc/ssh/sshd_config"
if grep -q "^PermitRootLogin yes" "$SSHD_CONFIG" 2>/dev/null || \
   grep -q "^#PermitRootLogin" "$SSHD_CONFIG" 2>/dev/null; then
  sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' "$SSHD_CONFIG"
  sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' "$SSHD_CONFIG"
  systemctl restart sshd
  log "SSH hardened: root login disabled, password auth disabled"
else
  log "SSH already hardened"
fi

# ---------------------------------------------------------------------------
# Step 6: Install fail2ban + unattended-upgrades
# ---------------------------------------------------------------------------
log "Step 6/14: Installing security packages"
apt-get install -y -qq fail2ban unattended-upgrades
systemctl enable fail2ban
systemctl start fail2ban

# Enable automatic security updates
echo 'Unattended-Upgrade::Automatic-Reboot "false";' \
  > /etc/apt/apt.conf.d/51apibase-unattended
dpkg-reconfigure -plow unattended-upgrades 2>/dev/null || true

log "fail2ban + unattended-upgrades configured"

# ---------------------------------------------------------------------------
# Step 7: Clone repository
# ---------------------------------------------------------------------------
log "Step 7/14: Setting up application directory"
mkdir -p "$APP_DIR"

if [ -d "$APP_DIR/.git" ]; then
  log "Repository already cloned, pulling latest"
  cd "$APP_DIR"
  git pull --ff-only
else
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR"
log "Repository ready at $APP_DIR"

# ---------------------------------------------------------------------------
# Step 8: Decrypt .env
# ---------------------------------------------------------------------------
log "Step 8/14: Setting up environment"
cd "$APP_DIR"

if [ -f .env ]; then
  log ".env already exists — skipping decryption"
elif [ -f .env.enc ]; then
  # Decrypt with sops (if installed) or age
  if command -v sops &>/dev/null; then
    sops -d .env.enc > .env
  elif command -v age &>/dev/null; then
    age -d -i /root/.age-key.txt .env.enc > .env
  else
    die ".env.enc exists but no decryption tool (sops/age) found. Place .env manually."
  fi
  chmod 600 .env
  chown "$DEPLOY_USER:$DEPLOY_USER" .env
  log ".env decrypted (chmod 600)"
else
  if [ -f .env.example ]; then
    die ".env not found. Copy .env.example to .env and fill in real values."
  else
    die ".env not found. Create it from .env.example before running bootstrap."
  fi
fi

# ---------------------------------------------------------------------------
# Step 9: Pull Docker images
# ---------------------------------------------------------------------------
log "Step 9/14: Pulling Docker images"
cd "$APP_DIR"
$COMPOSE_CMD pull
log "All images pulled"

# ---------------------------------------------------------------------------
# Step 10: Start the stack
# ---------------------------------------------------------------------------
log "Step 10/14: Starting Docker stack"
$COMPOSE_CMD up -d
log "Stack started (entrypoint.sh handles migrations)"

# ---------------------------------------------------------------------------
# Step 11: Wait for readiness
# ---------------------------------------------------------------------------
log "Step 11/14: Waiting for /health/ready (timeout: ${READINESS_TIMEOUT}s)"
ELAPSED=0
READY=false
while [ "$ELAPSED" -lt "$READINESS_TIMEOUT" ]; do
  HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" http://localhost:80/health/ready 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    READY=true
    break
  fi
  sleep "$READINESS_INTERVAL"
  ELAPSED=$((ELAPSED + READINESS_INTERVAL))
  # Progress indicator
  if [ $((ELAPSED % 15)) -eq 0 ]; then
    log "Still waiting... (${ELAPSED}s, last HTTP: $HTTP_CODE)"
  fi
done

if [ "$READY" = "true" ]; then
  log "System ready after ${ELAPSED}s"
else
  log "WARNING: System not ready after ${READINESS_TIMEOUT}s (HTTP: $HTTP_CODE)"
  log "Check logs: docker compose logs api"
fi

# ---------------------------------------------------------------------------
# Step 12: Smoke tests
# ---------------------------------------------------------------------------
log "Step 12/14: Running smoke tests"
if [ -x scripts/smoke-test.sh ]; then
  if API_URL=http://localhost:80 bash scripts/smoke-test.sh; then
    log "Smoke tests passed"
  else
    log "WARNING: Smoke tests failed — check system status"
  fi
else
  log "WARNING: scripts/smoke-test.sh not found or not executable"
fi

# ---------------------------------------------------------------------------
# Step 13: Setup TLS with certbot
# ---------------------------------------------------------------------------
log "Step 13/14: Setting up TLS"
if ! command -v certbot &>/dev/null; then
  apt-get install -y -qq certbot
fi

# Check if cert already exists
if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  log "TLS certificate already exists for $DOMAIN"
else
  log "Requesting TLS certificate for $DOMAIN"
  # Nginx must be serving /.well-known/acme-challenge/ on port 80
  certbot certonly --webroot \
    -w /var/www/certbot \
    -d "$DOMAIN" \
    --non-interactive \
    --agree-tos \
    --email "admin@$DOMAIN" \
    --no-eff-email || {
    log "WARNING: certbot failed — TLS not configured. Run manually:"
    log "  certbot certonly --webroot -w /var/www/certbot -d $DOMAIN"
  }

  # Reload nginx to pick up new cert
  $COMPOSE_CMD exec -T nginx nginx -s reload 2>/dev/null || true
fi

# ---------------------------------------------------------------------------
# Step 14: Setup host cron jobs (§12.244)
# ---------------------------------------------------------------------------
log "Step 14/14: Setting up host cron jobs"
CRON_FILE="/etc/cron.d/apibase"

cat > "$CRON_FILE" << 'CRON'
# APIbase.pro — Host Cron Jobs (§12.244)
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Certbot renewal — twice daily (§12.209)
0 3,15 * * * root certbot renew --quiet --deploy-hook "docker compose -f /opt/app/docker-compose.yml -f /opt/app/docker-compose.prod.yml exec -T nginx nginx -s reload"

# Docker image prune — weekly Sunday 04:00 UTC (§12.220)
0 4 * * 0 root docker image prune -f --filter "until=168h" >> /var/log/docker-prune.log 2>&1
CRON

chmod 644 "$CRON_FILE"
log "Host cron jobs installed at $CRON_FILE"

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
log "========================================="
log "Bootstrap complete for $DOMAIN"
log "========================================="
log ""
log "Application: $APP_DIR"
log "Deploy user: $DEPLOY_USER"
log "Firewall:    22, 80, 443"
log "TLS:         certbot ($DOMAIN)"
log "Cron:        $CRON_FILE"
log ""
log "Next steps:"
log "  1. Verify: curl https://$DOMAIN/health/ready"
log "  2. Monitor: http://localhost:9090 (Prometheus)"
log "  3. Dashboards: http://localhost:3000 (Grafana)"
log ""
log "Deploy new versions:"
log "  ssh $DEPLOY_USER@<server> 'cd $APP_DIR && bash scripts/deploy.sh <commit-sha>'"
log ""
