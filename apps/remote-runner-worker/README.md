# Prodivix Remote Runner Worker

Independent G2 worker agent. It claims one execution at a time, fetches the exact
lease-fenced snapshot, renews the lease, materializes files into an execution-local
temporary directory, runs allowlisted argv commands without a shell, and publishes
monotonic state transitions.

Sanitized stdout/stderr and output-budget warnings are published as structured
execution log events before the terminal transition. Event ingestion is lease
fenced; a lost lease prevents both further output and terminal publication.

The production default is the rootless Podman adapter. Every execution receives a
short-lived, digest-pinned OCI sandbox with a read-only root filesystem, isolated
tmpfs workspace, no host mounts, no capabilities, no-new-privileges,
and bounded CPU, memory, disk, process, file-descriptor, wall-clock, and output
budgets. Dependency install can use only an internal
`REMOTE_WORKER_INSTALL_NETWORK`, whose sole egress is the verified allowlist
proxy. The Worker checks the network's internal flag, proxy attachment, and exact
allowlist before starting; after install it disconnects the network and verifies
the container has no attached network before releasing Preview, Test, or Build.
Without that configuration, install and runtime are both networkless.
Cancellation stops the named container and `--rm` removes it. The
filesystem/process supervisor remains available only as an explicit non-production
reference adapter. The Control Plane never executes user code.

Required environment:

- `REMOTE_WORKER_ID`
- `REMOTE_WORKER_TOKEN`
- `REMOTE_WORKER_PROVIDER_ID`
- `REMOTE_WORKER_CONTROL_PLANE_URL`
- `REMOTE_WORKER_SANDBOX_IMAGE` (immutable `sha256:` or `name@sha256:` reference)

Optional lease, heartbeat, polling, timeout, output-budget, Podman command, and
sandbox resource/artifact/retention limits use the `REMOTE_WORKER_*` prefix.
The optional install-egress boundary is configured as one fail-closed set:

- `REMOTE_WORKER_INSTALL_NETWORK`: pre-provisioned internal network;
- `REMOTE_WORKER_INSTALL_PROXY_URL`: HTTP proxy origin on that network;
- `REMOTE_WORKER_INSTALL_PROXY_CONTAINER`: infrastructure proxy container;
- `REMOTE_WORKER_INSTALL_ALLOWED_HOSTS`: comma-separated exact or wildcard hosts.

The Worker never creates or broadens this policy. The proxy accepts authenticated
HTTPS `CONNECT` only on port 443, resolves a selected public address to block
private/link-local/metadata targets, and records origin-level metadata. Worker
projection emits transport-neutral `network.request` traces containing only
method, sanitized origin URL, timing, outcome/status, byte counts, runtime zone,
and explicit redaction state. Headers, paths, queries, fragments, bodies, cookies,
authorization and proxy internals are not representable by that contract.
Worker credentials are not inherited by the sandbox and are included in output
redaction values.

Successful Build executions collect only the exact
`snapshot.buildPlan.outputDirectoryPath`. The trusted sandbox entry rejects
symbolic links, special files, path escape, excessive file counts, and byte-budget
overflow before returning one `ExecutionBuildBundle`. The Worker, rather than user
code, derives the artifact digest, size, expiry, and execution-scoped grant.

Remote Preview uses the snapshot's explicit `static-bundle` preview plan. It
runs a bounded production build inside the same networkless sandbox and publishes
an `ExecutionPreviewBundle` only after the nested build manifest, HTML entrypoint,
target, snapshot digest, file hashes, and artifact budget are verified. The
canonical artifact then declares `readiness=ready` and `health=healthy`; hosting or
gateway URLs remain an artifact-resolver concern and are not fabricated by the
Worker.

## Rootless sandbox Gate

`pnpm run verify:g2:rootless-sandbox` is intentionally a Linux/Podman integration
Gate rather than a default local test. The dedicated
`.github/workflows/g2-rootless-sandbox.yml` workflow installs Podman on an Ubuntu
runner and executes it as the non-root runner account. It builds the sandbox from a
digest-pinned base, runs active isolation and cgroup probes, then emits the living
Golden Workspace through the strict Remote snapshot codec and performs real
dependency install, Preview, Build, and canonical Test inside Podman. The Gate
compares strict Preview/Build file facts, verifies source trace, cancellation,
timeout, phase-network isolation and orphan cleanup, and uploads structured JSON
evidence plus the full Gate log. It builds the worker and its complete workspace
dependency graph from a clean checkout before entering Podman. Windows
contributors do not need WSL, Docker Desktop, or Podman for ordinary development.
