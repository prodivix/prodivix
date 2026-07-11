#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.ghcr.yml"
ENV_FILE="$SCRIPT_DIR/.env"
ENV_EXAMPLE_FILE="$SCRIPT_DIR/.env.example"

DEFAULT_GHCR_NAMESPACE="mdr-tutorials"
DEFAULT_IMAGE_TAG="latest"
DEFAULT_WEB_PORT="4173"
DEFAULT_SANDBOX_PORT="4174"
DEFAULT_BACKEND_PORT="8080"
DEFAULT_POSTGRES_PORT="127.0.0.1:5432"
DEFAULT_POSTGRES_USER="postgres"
DEFAULT_POSTGRES_DB="prodivix"
DEFAULT_TOKEN_TTL="24h"
DEFAULT_TZ="UTC"

ASSUME_YES="false"
SKIP_PULL="false"
SKIP_DOWN="false"
TAG_OVERRIDE=""

usage() {
  cat <<'EOF'
Usage: ./start-app.sh [options]

Interactive bare-server deployment for public GHCR images.

Options:
  --tag <tag>       Image tag to deploy. Defaults to latest.
  --yes, -y         Reuse or generate defaults without prompts.
  --skip-pull       Do not pull images before starting.
  --skip-down       Do not run docker compose down before starting.
  --help, -h        Show this help.

Examples:
  ./start-app.sh
  ./start-app.sh --tag sha-95bd22e
  ./start-app.sh --yes --tag latest
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag)
      TAG_OVERRIDE="${2:-}"
      if [[ -z "$TAG_OVERRIDE" ]]; then
        echo "Missing value for --tag" >&2
        exit 1
      fi
      shift 2
      ;;
    --yes | -y)
      ASSUME_YES="true"
      shift
      ;;
    --skip-pull)
      SKIP_PULL="true"
      shift
      ;;
    --skip-down)
      SKIP_DOWN="true"
      shift
      ;;
    --help | -h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

prompt() {
  local label="$1"
  local default_value="$2"
  local value

  if [[ "$ASSUME_YES" == "true" ]]; then
    printf '%s' "$default_value"
    return
  fi

  read -r -p "$label [$default_value]: " value
  printf '%s' "${value:-$default_value}"
}

prompt_secret() {
  local label="$1"
  local default_value="$2"
  local value

  if [[ "$ASSUME_YES" == "true" ]]; then
    printf '%s' "$default_value"
    return
  fi

  read -r -s -p "$label"
  value="$REPLY"
  echo
  printf '%s' "${value:-$default_value}"
}

yes_no() {
  local label="$1"
  local default_value="$2"
  local value

  if [[ "$ASSUME_YES" == "true" ]]; then
    [[ "$default_value" == "y" ]]
    return
  fi

  read -r -p "$label [$default_value]: " value
  value="${value:-$default_value}"
  [[ "$value" == "y" || "$value" == "Y" || "$value" == "yes" || "$value" == "YES" ]]
}

write_env_file() {
  local ghcr_namespace="$1"
  local image_tag="$2"
  local postgres_port="$3"
  local postgres_user="$4"
  local postgres_password="$5"
  local postgres_db="$6"
  local backend_port="$7"
  local allowed_origins="$8"
  local web_port="$9"
  local sandbox_port="${10}"
  local token_ttl="${11}"
  local timezone="${12}"

  cat >"$ENV_FILE" <<EOF
GHCR_NAMESPACE=$ghcr_namespace
IMAGE_TAG=$image_tag

POSTGRES_PORT=$postgres_port
POSTGRES_USER=$postgres_user
POSTGRES_PASSWORD=$postgres_password
POSTGRES_DB=$postgres_db

BACKEND_PORT=$backend_port
BACKEND_ALLOWED_ORIGINS=$allowed_origins
BACKEND_TOKEN_TTL=$token_ttl
BACKEND_DB_MAX_OPEN_CONNS=10
BACKEND_DB_MAX_IDLE_CONNS=5
BACKEND_DB_MAX_LIFETIME=30m

WEB_PORT=$web_port
SANDBOX_PORT=$sandbox_port
TZ=$timezone
EOF
}

load_env_value() {
  local key="$1"
  local fallback="$2"
  local file="$3"

  if [[ -f "$file" ]]; then
    local line
    line="$(grep -E "^${key}=" "$file" | tail -n 1 || true)"
    if [[ -n "$line" ]]; then
      printf '%s' "${line#*=}"
      return
    fi
  fi

  printf '%s' "$fallback"
}

echo "Prodivix bare-server deploy"
echo "Using public GHCR images; registry authentication is not required."
echo

if ! command_exists docker; then
  echo "Docker is not installed or not in PATH." >&2
  echo "Install Docker first, then run this script again." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is not available. Install the docker compose plugin first." >&2
  exit 1
fi

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Compose file not found: $COMPOSE_FILE" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" && -f "$ENV_EXAMPLE_FILE" ]]; then
  cp "$ENV_EXAMPLE_FILE" "$ENV_FILE"
fi

current_namespace="$(load_env_value GHCR_NAMESPACE "$DEFAULT_GHCR_NAMESPACE" "$ENV_FILE")"
current_tag="$(load_env_value IMAGE_TAG "$DEFAULT_IMAGE_TAG" "$ENV_FILE")"
current_web_port="$(load_env_value WEB_PORT "$DEFAULT_WEB_PORT" "$ENV_FILE")"
current_sandbox_port="$(load_env_value SANDBOX_PORT "$DEFAULT_SANDBOX_PORT" "$ENV_FILE")"
current_backend_port="$(load_env_value BACKEND_PORT "$DEFAULT_BACKEND_PORT" "$ENV_FILE")"
current_postgres_port="$(load_env_value POSTGRES_PORT "$DEFAULT_POSTGRES_PORT" "$ENV_FILE")"
current_postgres_user="$(load_env_value POSTGRES_USER "$DEFAULT_POSTGRES_USER" "$ENV_FILE")"
current_postgres_password="$(load_env_value POSTGRES_PASSWORD "" "$ENV_FILE")"
current_postgres_db="$(load_env_value POSTGRES_DB "$DEFAULT_POSTGRES_DB" "$ENV_FILE")"
current_allowed_origins="$(load_env_value BACKEND_ALLOWED_ORIGINS "http://localhost:${current_web_port}" "$ENV_FILE")"
current_token_ttl="$(load_env_value BACKEND_TOKEN_TTL "$DEFAULT_TOKEN_TTL" "$ENV_FILE")"
current_tz="$(load_env_value TZ "$DEFAULT_TZ" "$ENV_FILE")"

if [[ -n "$TAG_OVERRIDE" ]]; then
  current_tag="$TAG_OVERRIDE"
fi

echo "Deployment settings"
ghcr_namespace="$(prompt "GHCR namespace" "${current_namespace:-$DEFAULT_GHCR_NAMESPACE}")"
image_tag="$(prompt "Image tag" "${current_tag:-$DEFAULT_IMAGE_TAG}")"
web_port="$(prompt "Public web port" "${current_web_port:-$DEFAULT_WEB_PORT}")"
sandbox_port="$(prompt "Public plugin sandbox port" "${current_sandbox_port:-$DEFAULT_SANDBOX_PORT}")"
backend_port="$(prompt "Backend API port" "${current_backend_port:-$DEFAULT_BACKEND_PORT}")"
postgres_port="$(prompt "Postgres host bind" "${current_postgres_port:-$DEFAULT_POSTGRES_PORT}")"
postgres_user="$(prompt "Postgres user" "${current_postgres_user:-$DEFAULT_POSTGRES_USER}")"

if [[ -z "$current_postgres_password" || "$current_postgres_password" == "postgres" ]]; then
  generated_password="$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32 || true)"
  current_postgres_password="${generated_password:-change-me-$(date +%s)}"
fi
postgres_password="$(prompt_secret "Postgres password [hidden, press Enter to keep/generate]: " "$current_postgres_password")"

postgres_db="$(prompt "Postgres database" "${current_postgres_db:-$DEFAULT_POSTGRES_DB}")"
allowed_origins="$(prompt "Allowed browser origins" "$current_allowed_origins")"
token_ttl="$(prompt "Backend token TTL" "${current_token_ttl:-$DEFAULT_TOKEN_TTL}")"
timezone="$(prompt "Timezone" "${current_tz:-$DEFAULT_TZ}")"

echo
echo "Writing $ENV_FILE"
write_env_file \
  "$ghcr_namespace" \
  "$image_tag" \
  "$postgres_port" \
  "$postgres_user" \
  "$postgres_password" \
  "$postgres_db" \
  "$backend_port" \
  "$allowed_origins" \
  "$web_port" \
  "$sandbox_port" \
  "$token_ttl" \
  "$timezone"

echo
echo "Images:"
echo "  ghcr.io/$ghcr_namespace/prodivix-web:$image_tag"
echo "  ghcr.io/$ghcr_namespace/prodivix-backend:$image_tag"
echo "  ghcr.io/$ghcr_namespace/prodivix-plugin-sandbox:$image_tag"
echo

if [[ "$SKIP_DOWN" != "true" ]]; then
  if yes_no "Stop existing containers before starting" "y"; then
    compose down --remove-orphans
  fi
fi

if [[ "$SKIP_PULL" != "true" ]]; then
  echo "Pulling public GHCR images..."
  compose pull
fi

echo "Starting Prodivix..."
compose up -d

echo
echo "Waiting for services..."
sleep 5
compose ps

echo
backend_health_url="http://127.0.0.1:${backend_port}/api/ping"
if command_exists curl; then
  if curl -fsS "$backend_health_url" >/dev/null; then
    echo "Backend health: OK ($backend_health_url)"
  else
    echo "Backend health check did not pass yet: $backend_health_url"
    echo "Check logs with: docker compose -f $COMPOSE_FILE --env-file $ENV_FILE logs -f backend"
  fi
else
  echo "curl not found; skipped backend health check."
fi

echo
echo "Done."
echo "Web:     http://127.0.0.1:${web_port}"
echo "Backend: http://127.0.0.1:${backend_port}/api/ping"
echo
echo "Useful commands:"
echo "  docker compose -f $COMPOSE_FILE --env-file $ENV_FILE ps"
echo "  docker compose -f $COMPOSE_FILE --env-file $ENV_FILE logs -f"
echo "  docker compose -f $COMPOSE_FILE --env-file $ENV_FILE pull && docker compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d"
