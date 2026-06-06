#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-$HOME/prodivix}"
RUN_DIR="$REPO_DIR/.run"

for f in backend.pid frontend.pid; do
  pid_file="$RUN_DIR/$f"
  if [[ -f "$pid_file" ]]; then
    pid="$(cat "$pid_file" || true)"
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
      echo "Stopping $pid"
      kill "$pid" || true
    fi
    rm -f "$pid_file"
  fi
done

echo "Stopped."
