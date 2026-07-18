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
the container has no attached network before releasing Preview, Test, Build, or
one-shot Server Function execution.
Without that configuration, install and runtime are both networkless.
Cancellation stops the named container and `--rm` removes it. The
filesystem/process supervisor remains available only as an explicit non-production
reference adapter. The Control Plane never executes user code.

Remote Terminal connects only after the runtime network has been removed and
verified. The worker runs `podman exec --interactive` without allocating a host
TTY; `/opt/prodivix/terminal-entry.sh` uses util-linux `script` to allocate the
PTY inside the already isolated container. Command cursors are acknowledged only
after the local open/input/resize/signal/close effect succeeds. Output publication
retries the same deterministic id, independently streaming-redacts stdout/stderr,
and closes fail-closed on lease or identity loss. The shell and every runtime file
are destroyed with the named execution container.

Required environment:

- `REMOTE_WORKER_ID`
- `REMOTE_WORKER_TOKEN`
- `REMOTE_WORKER_PROVIDER_ID`
- `REMOTE_WORKER_CONTROL_PLANE_URL`
- `REMOTE_WORKER_SANDBOX_IMAGE` (immutable `sha256:` or `name@sha256:` reference)

Optional lease, heartbeat, polling, timeout, output-budget, Podman command, and
sandbox resource/artifact/retention limits use the `REMOTE_WORKER_*` prefix.
`REMOTE_WORKER_TERMINAL_POLL_MS` controls the ephemeral command mailbox polling
interval and defaults to `100`.
`REMOTE_WORKER_SECRET_CANARIES_JSON` may contain a bounded JSON string array for
deployment/Gate canaries. The active worker credential, lease token, and these
canaries are held only by the runtime output guard.
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
redaction values. Both sandbox adapters mark a detected redaction, and the Worker
independently scans log, crash, Network, artifact descriptor/content, and test
report surfaces before the first durable publication. A hit discards every
original output and artifact, publishes only safe `EXE-5004`, and terminates the
execution with the fixed `secret-material-detected` reason. The Control Plane
repeats the scan before persistence as a separate trust boundary.

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

Remote Server Function uses the dedicated `production/server/code` provider and
one exact Snapshot v6 plan. The Worker projects only the strict value request,
runs a bounded, deterministically projected canonical TS/JS import graph after
runtime network removal, and revalidates the result against the trusted snapshot
profile before publishing one canonical report artifact. Only unique relative
static ESM imports are supported; external, dynamic, CommonJS, reference,
ambiguous, and over-budget graphs fail before execution. The result SourceTrace
aggregates the root and imported CodeArtifacts. Authenticated and `workspace.owner`
permission reads/guards
additionally require an unexpired Control Plane authority bound to the exact
execution, worker attempt, Workspace, and snapshot. The Worker reduces it to
`AuthPrincipal` plus the bounded allowed-permission list, writes a mode-0600
execution-local authority file, and the generated runner strictly validates the exact
required permission and removes that file before invoking project code. Public
functions never receive the projection. Session id, Bearer, cookie, lease token,
other permission policies, runtime network, and project-source mutation remain
fail closed in this isolated target.

When the exact code-export profile declares reference-only Secret fields, the
Worker creates a per-resolution X25519 key and calls the worker-token + lease
fenced Control Plane endpoint. It accepts only a short-lived envelope bound to
the exact execution, worker attempt, Workspace, snapshot, function, invocation,
and recipient key. The request has a 15-second timeout; both ciphertext hops
require JSON/no-store/nosniff and enforce their byte limit while streaming.
The rootless install-phase payload contains no invocation, authority, or Secret.
Only after install exits, residual processes are killed, and the runtime network
is verified absent does a nonce-bound second control message deliver these values.
Before materialization, the entrypoint deletes and recreates the reserved root
`.prodivix` transport directory and requires the four canonical transport paths,
so an installer cannot retain a pre-created file or symlink target for runtime
invocation, authority, Secret, or result material.
Decrypted fields are then added to the output guard and written to a mode-0600
one-shot file. The generated runner validates and deletes that file before
importing project code, exposes only declared fields through callback-bound
`useSecret`, and blocks material-bearing output. A second residual-process hard
cut precedes filesystem capture. The field projection is cleared after output/
artifact inspection. Control Plane, claim, request, snapshot, durable event,
trace, artifact, and the install payload never contain plaintext.

If a lease expires while this read-only invocation is running, a new Worker can
reclaim it with a strictly higher attempt. It generates a new recipient key and
re-resolves the same immutable function/invocation identity. Backend atomically
replaces the single current-attempt ciphertext row, so the old attempt cannot
complete or replay and the new Worker cannot decrypt the old envelope. A reclaimed
`running` Job skips a duplicate state transition; a reclaimed `cancelling` Job exits
before snapshot, Secret resolution, or sandbox startup.

## Rootless sandbox Gate

`pnpm run verify:g2:rootless-sandbox` is intentionally a Linux/Podman integration
Gate rather than a default local test. The dedicated
`.github/workflows/g2-rootless-sandbox.yml` workflow installs Podman on an Ubuntu
runner and executes it as the non-root runner account. It builds the sandbox from a
digest-pinned base, runs active isolation and cgroup probes, then emits the living
Golden Workspace through the strict Remote snapshot codec and performs real
dependency install, Preview, Build, canonical Test, and a workspace-owner-permission one-shot
Server Function with a transitive canonical helper module and isolated Secret
`useSecret` inside Podman. The Gate
compares strict Preview/Build file facts, verifies source trace, cancellation,
timeout, phase-network isolation and orphan cleanup, and uploads structured JSON
evidence plus the full Gate log. It builds the worker and its complete workspace
dependency graph from a clean checkout before entering Podman. Windows
contributors do not need WSL, Docker Desktop, or Podman for ordinary development.
The Terminal probe additionally verifies a real inner TTY, resize propagation,
execution-local filesystem writes, absence of host Workspace writes, and terminal
container cleanup.
