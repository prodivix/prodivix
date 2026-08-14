#!/usr/bin/env bash

set -euo pipefail

image="${1:-}"
if [[ -z "${image}" || "${#image}" -gt 1024 || "${image}" =~ [[:space:]] ]]; then
  echo '::error::A bounded exact Podman image reference is required.'
  exit 1
fi

podman_command="${PRODIVIX_ROOTLESS_PODMAN_COMMAND:-$(command -v podman || true)}"
if [[ -z "${podman_command}" || ! -x "${podman_command}" ]]; then
  echo '::error::The pre-adopted rootless Podman command is unavailable.'
  exit 1
fi

for attempt in 1 2 3; do
  if "${podman_command}" pull "${image}"; then
    exit 0
  fi
  if [[ "${attempt}" -eq 3 ]]; then
    echo "::error::Podman could not pull ${image} after three bounded attempts."
    exit 1
  fi
  echo "::warning::Podman pull attempt ${attempt} failed for ${image}; retrying."
  sleep "$((attempt * 5))"
done
