#!/usr/bin/env bash
# Runs `nginx -t` on nginx/nginx.conf (or $1) inside the image docker-compose.yml uses for nginx.
# -v mounts the conf where the image expects it; --add-host api:127.0.0.1 satisfies the parse-time
# upstream lookup (`server api:3000`) so only real syntax errors fail, not "host not found in upstream".
# T-0342 shipped an unquoted `{0,2}` that nginx cut at the brace; T-0362 added this gate to CI and deploy.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONF="$(readlink -f "${1:-$ROOT/nginx/nginx.conf}")"
IMAGE="${NGINX_IMAGE:-nginx:1.25-alpine}"
exec docker run --rm --add-host api:127.0.0.1 -v "$CONF:/etc/nginx/nginx.conf:ro" "$IMAGE" nginx -t
