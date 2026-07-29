#!/usr/bin/env bash

set -euo pipefail

evidence_path="${1:-rootless-podman-info.json}"

fail() {
  echo "::error::$1"
  exit 1
}

case "${ImageOS:-}:${ImageVersion:-}" in
  ubuntu24:20260720.247.2)
    expected_podman_path='/usr/bin/podman'
    expected_podman_version='podman version 4.9.3'
    expected_oci_runtime_path='/usr/bin/crun'
    expected_conmon_path='/usr/bin/conmon'
    expected_cgroup_manager='systemd'
    ;;
  ubuntu24:20260726.254.1)
    expected_podman_path='/usr/local/bin/podman'
    expected_podman_version='podman version 5.8.4'
    expected_oci_runtime_path='/usr/local/bin/crun'
    expected_conmon_path='/usr/local/lib/podman/conmon'
    expected_cgroup_manager='cgroupfs'
    ;;
  *)
    fail "Rootless Podman runner image is not pre-adopted: ${ImageOS:-missing}:${ImageVersion:-missing}"
    ;;
esac

actual_podman_path="$(command -v podman || true)"
test "${actual_podman_path}" = "${expected_podman_path}" ||
  fail "Podman path drifted: expected ${expected_podman_path}, received ${actual_podman_path:-missing}"
test "$("${expected_podman_path}" --version)" = "${expected_podman_version}" ||
  fail "Podman version drifted for ${ImageOS}:${ImageVersion}"
test -x "${expected_oci_runtime_path}" ||
  fail "Pre-adopted OCI runtime is missing: ${expected_oci_runtime_path}"
test -x "${expected_conmon_path}" ||
  fail "Pre-adopted conmon is missing: ${expected_conmon_path}"
"${expected_oci_runtime_path}" --version
"${expected_conmon_path}" --version

podman_sha256="$(sha256sum "${expected_podman_path}" | cut --delimiter=' ' --fields=1)"
oci_runtime_sha256="$(sha256sum "${expected_oci_runtime_path}" | cut --delimiter=' ' --fields=1)"
conmon_sha256="$(sha256sum "${expected_conmon_path}" | cut --delimiter=' ' --fields=1)"

runner_user="$(id --user --name)"
runner_uid="$(id --user)"
test "${runner_uid}" -ne 0 || fail 'Rootless Podman must not run as root.'
grep --quiet "^${runner_user}:" /etc/subuid ||
  sudo usermod --add-subuids 100000-165535 "${runner_user}"
grep --quiet "^${runner_user}:" /etc/subgid ||
  sudo usermod --add-subgids 100000-165535 "${runner_user}"

sudo loginctl enable-linger "${runner_user}"
sudo systemctl start "user@${runner_uid}.service"
runtime_dir="/run/user/${runner_uid}"
test -S "${runtime_dir}/bus" ||
  fail "Rootless user bus is missing: ${runtime_dir}/bus"
export XDG_RUNTIME_DIR="${runtime_dir}"
export DBUS_SESSION_BUS_ADDRESS="unix:path=${runtime_dir}/bus"

containers_config="${HOME}/.config/containers/containers.conf"
mkdir --parents "$(dirname "${containers_config}")"
printf '%s\n' \
  '[engine]' \
  "cgroup_manager = \"${expected_cgroup_manager}\"" \
  'events_logger = "file"' \
  'runtime = "crun"' \
  "conmon_path = [\"${expected_conmon_path}\"]" \
  '' \
  '[engine.runtimes]' \
  "crun = [\"${expected_oci_runtime_path}\"]" \
  >"${containers_config}"

"${expected_podman_path}" system migrate
test "$("${expected_podman_path}" info --format '{{.Host.Security.Rootless}}')" = 'true' ||
  fail 'Podman did not initialize as a rootless engine.'
actual_oci_runtime_path="$("${expected_podman_path}" info --format '{{.Host.OCIRuntime.Path}}')"
test "${actual_oci_runtime_path}" = "${expected_oci_runtime_path}" ||
  fail "Podman selected the wrong OCI runtime: expected ${expected_oci_runtime_path}, received ${actual_oci_runtime_path}"
actual_conmon_path="$("${expected_podman_path}" info --format '{{.Host.Conmon.Path}}')"
test "${actual_conmon_path}" = "${expected_conmon_path}" ||
  fail "Podman selected the wrong conmon: expected ${expected_conmon_path}, received ${actual_conmon_path}"
actual_cgroup_manager="$("${expected_podman_path}" info --format '{{.Host.CgroupManager}}')"
test "${actual_cgroup_manager}" = "${expected_cgroup_manager}" ||
  fail "Podman selected the wrong cgroup manager: expected ${expected_cgroup_manager}, received ${actual_cgroup_manager}"
"${expected_podman_path}" info --format json >"${evidence_path}"

{
  echo "XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR}"
  echo "DBUS_SESSION_BUS_ADDRESS=${DBUS_SESSION_BUS_ADDRESS}"
  echo "PRODIVIX_ROOTLESS_PODMAN_PATH=${expected_podman_path}"
  echo "PRODIVIX_ROOTLESS_PODMAN_COMMAND=${expected_podman_path}"
  echo "PRODIVIX_ROOTLESS_PODMAN_SHA256=${podman_sha256}"
  echo "PRODIVIX_ROOTLESS_OCI_RUNTIME_PATH=${expected_oci_runtime_path}"
  echo "PRODIVIX_ROOTLESS_OCI_RUNTIME_SHA256=${oci_runtime_sha256}"
  echo "PRODIVIX_ROOTLESS_CONMON_PATH=${expected_conmon_path}"
  echo "PRODIVIX_ROOTLESS_CONMON_SHA256=${conmon_sha256}"
  echo "PRODIVIX_ROOTLESS_CGROUP_MANAGER=${expected_cgroup_manager}"
} >>"${GITHUB_ENV}"

{
  echo '### Rootless Podman toolchain identity'
  echo
  echo "| Component | Path | SHA-256 |"
  echo "| --- | --- | --- |"
  echo "| Podman | \`${expected_podman_path}\` | \`${podman_sha256}\` |"
  echo "| OCI runtime | \`${expected_oci_runtime_path}\` | \`${oci_runtime_sha256}\` |"
  echo "| conmon | \`${expected_conmon_path}\` | \`${conmon_sha256}\` |"
  echo
  echo "Cgroup manager: \`${expected_cgroup_manager}\`"
} >>"${GITHUB_STEP_SUMMARY}"
