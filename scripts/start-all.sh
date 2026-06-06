#!/usr/bin/env bash
set -euo pipefail

# Optional config file support:
#   CONFIG_FILE=.deploy.env ./scripts/start-all.sh
# default: $REPO_DIR/.deploy.env
CONFIG_FILE="${CONFIG_FILE:-}"
AUTO_INSTALL_DEPS="${AUTO_INSTALL_DEPS:-1}"
GO_VERSION="${GO_VERSION:-1.25.7}"

# ===== Config (override via env) =====
REPO_DIR="${REPO_DIR:-$HOME/prodivix}"
if [[ -z "$CONFIG_FILE" ]]; then
  CONFIG_FILE="$REPO_DIR/.deploy.env"
fi

if [[ -f "$CONFIG_FILE" ]]; then
  echo "==> Loading config from $CONFIG_FILE"
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
fi

BACKEND_PORT="${BACKEND_PORT:-8080}"
FRONTEND_PORT="${FRONTEND_PORT:-4173}"

# Frontend build-time backend URL
VITE_API_BASE="${VITE_API_BASE:-http://127.0.0.1:${BACKEND_PORT}}"

# Backend runtime config
BACKEND_ADDR=":${BACKEND_PORT}"
BACKEND_ALLOWED_ORIGINS="${BACKEND_ALLOWED_ORIGINS:-http://127.0.0.1:${FRONTEND_PORT},http://localhost:${FRONTEND_PORT}}"
BACKEND_DB_URL="${BACKEND_DB_URL:-postgres://postgres:postgres@127.0.0.1:5432/prodivix?sslmode=disable}"

# ===== Runtime files =====
RUN_DIR="$REPO_DIR/.run"
LOG_DIR="$REPO_DIR/.logs"
mkdir -p "$RUN_DIR" "$LOG_DIR"

BACKEND_PID_FILE="$RUN_DIR/backend.pid"
FRONTEND_PID_FILE="$RUN_DIR/frontend.pid"

stop_if_running() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file" || true)"
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
      echo "Stopping process $pid ..."
      kill "$pid" || true
      sleep 1
    fi
    rm -f "$pid_file"
  fi
}

get_sudo_cmd() {
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    echo ""
  elif command -v sudo >/dev/null 2>&1; then
    echo "sudo"
  else
    echo "NO_SUDO"
  fi
}

SUDO_CMD="$(get_sudo_cmd)"

run_as_root() {
  local cmd="$*"
  if [[ "$SUDO_CMD" == "NO_SUDO" ]]; then
    echo "Need root privileges for: $cmd"
    exit 1
  elif [[ -z "$SUDO_CMD" ]]; then
    bash -lc "$cmd"
  else
    sudo bash -lc "$cmd"
  fi
}

version_ge() {
  # returns 0 when $1 >= $2
  [[ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | tail -n1)" == "$1" ]]
}

install_node20() {
  echo "==> Installing Node.js >= 20"
  if command -v apt-get >/dev/null 2>&1; then
    run_as_root "apt-get update && apt-get install -y ca-certificates curl gnupg lsb-release"
    run_as_root "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -"
    run_as_root "apt-get install -y nodejs"
  elif command -v dnf >/dev/null 2>&1; then
    run_as_root "dnf install -y curl ca-certificates gnupg2"
    run_as_root "curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -"
    run_as_root "dnf install -y nodejs"
  elif command -v yum >/dev/null 2>&1; then
    run_as_root "yum install -y curl ca-certificates"
    run_as_root "curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -"
    run_as_root "yum install -y nodejs"
  else
    echo "Unsupported package manager for Node.js install"
    exit 1
  fi
}

install_pnpm() {
  echo "==> Installing pnpm (via corepack)"
  if ! command -v corepack >/dev/null 2>&1; then
    echo "corepack not found. Please install Node.js >= 20 first."
    exit 1
  fi
  corepack enable
  corepack prepare pnpm@latest --activate
}

install_go() {
  echo "==> Installing Go ${GO_VERSION}"
  local arch
  arch="$(uname -m)"
  case "$arch" in
    x86_64) arch="amd64" ;;
    aarch64|arm64) arch="arm64" ;;
    *)
      echo "Unsupported architecture for Go binary: $arch"
      exit 1
      ;;
  esac
  local tarball="go${GO_VERSION}.linux-${arch}.tar.gz"
  curl -fL "https://go.dev/dl/${tarball}" -o "/tmp/${tarball}"
  run_as_root "rm -rf /usr/local/go && tar -C /usr/local -xzf /tmp/${tarball} && ln -sf /usr/local/go/bin/go /usr/local/bin/go"
  rm -f "/tmp/${tarball}"
}

install_docker() {
  echo "==> Installing Docker Engine"
  run_as_root "curl -fsSL https://get.docker.com | sh"
}

install_docker_compose() {
  echo "==> Installing Docker Compose plugin"
  local compose_version arch
  compose_version="v2.40.1"
  arch="$(uname -m)"
  case "$arch" in
    x86_64) arch="x86_64" ;;
    aarch64|arm64) arch="aarch64" ;;
    *)
      echo "Unsupported architecture for Docker Compose binary: $arch"
      exit 1
      ;;
  esac
  run_as_root "mkdir -p /usr/local/lib/docker/cli-plugins"
  run_as_root "curl -fL https://github.com/docker/compose/releases/download/${compose_version}/docker-compose-linux-${arch} -o /usr/local/lib/docker/cli-plugins/docker-compose"
  run_as_root "chmod +x /usr/local/lib/docker/cli-plugins/docker-compose"
}

ensure_dependencies() {
  local has_issue=0

  if ! command -v node >/dev/null 2>&1; then
    has_issue=1
    [[ "$AUTO_INSTALL_DEPS" == "1" ]] && install_node20
  else
    local node_version
    node_version="$(node -v | sed 's/^v//')"
    if ! version_ge "$node_version" "20.0.0"; then
      has_issue=1
      [[ "$AUTO_INSTALL_DEPS" == "1" ]] && install_node20
    fi
  fi

  if ! command -v pnpm >/dev/null 2>&1; then
    has_issue=1
    [[ "$AUTO_INSTALL_DEPS" == "1" ]] && install_pnpm
  fi

  if ! command -v go >/dev/null 2>&1; then
    has_issue=1
    [[ "$AUTO_INSTALL_DEPS" == "1" ]] && install_go
  fi

  if ! command -v docker >/dev/null 2>&1; then
    has_issue=1
    [[ "$AUTO_INSTALL_DEPS" == "1" ]] && install_docker
  fi

  if ! docker compose version >/dev/null 2>&1; then
    has_issue=1
    [[ "$AUTO_INSTALL_DEPS" == "1" ]] && install_docker_compose
  fi

  if [[ "$AUTO_INSTALL_DEPS" != "1" && "$has_issue" -eq 1 ]]; then
    echo "Missing dependencies detected. Re-run with AUTO_INSTALL_DEPS=1."
    exit 1
  fi
}

echo "==> Repo: $REPO_DIR"
cd "$REPO_DIR"

echo "==> Checking dependencies (node>=20, pnpm, go, docker, docker compose)"
ensure_dependencies

echo "==> Installing node deps"
pnpm install --frozen-lockfile

echo "==> Starting PostgreSQL (docker compose)"
docker compose -f apps/backend/docker-compose.yml up -d

echo "==> Building backend"
pushd apps/backend >/dev/null
go build -o backend .
popd >/dev/null

echo "==> Building frontend"
VITE_API_BASE="$VITE_API_BASE" pnpm --filter @prodivix/web build

echo "==> Stopping old services (if any)"
stop_if_running "$BACKEND_PID_FILE"
stop_if_running "$FRONTEND_PID_FILE"

echo "==> Starting backend on ${BACKEND_ADDR}"
nohup env \
  BACKEND_ADDR="$BACKEND_ADDR" \
  BACKEND_ALLOWED_ORIGINS="$BACKEND_ALLOWED_ORIGINS" \
  BACKEND_DB_URL="$BACKEND_DB_URL" \
  apps/backend/backend >"$LOG_DIR/backend.log" 2>&1 &
echo $! > "$BACKEND_PID_FILE"

echo "==> Starting frontend static server on :${FRONTEND_PORT}"
nohup pnpm dlx serve -s apps/web/dist -l "$FRONTEND_PORT" >"$LOG_DIR/frontend.log" 2>&1 &
echo $! > "$FRONTEND_PID_FILE"

echo "==> Done"
echo "Backend:  http://127.0.0.1:${BACKEND_PORT}"
echo "Frontend: http://127.0.0.1:${FRONTEND_PORT}"
echo "Logs:     $LOG_DIR"
