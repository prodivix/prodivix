# Prodivix Remote Runner Control Plane

Independent G2 service that composes the versioned Remote Execution protocol,
PostgreSQL repository/snapshot adapters, authorization, quota, provider routing,
and worker lease fencing. It does not execute user code.

## Required environment

- `REMOTE_CONTROL_PLANE_DATABASE_URL`
- `REMOTE_CONTROL_PLANE_CLIENT_TOKEN`
- `REMOTE_CONTROL_PLANE_CLIENT_SUBJECT`
- `REMOTE_CONTROL_PLANE_WORKER_TOKENS_JSON`, an object mapping each worker id to its bearer token

Optional:

- `REMOTE_CONTROL_PLANE_PORT`, default `4310`
- `REMOTE_CONTROL_PLANE_MAX_ACTIVE_EXECUTIONS`, default `4`
- `REMOTE_CONTROL_PLANE_ARTIFACT_SWEEP_MS`, default `60000`
- `REMOTE_CONTROL_PLANE_ARTIFACT_SWEEP_BATCH`, default `100`
- `REMOTE_CONTROL_PLANE_SECRET_CANARIES_JSON`, a bounded JSON string array used by security Gates
- `REMOTE_CONTROL_PLANE_SECRET_BROKER_URL` and `REMOTE_CONTROL_PLANE_SECRET_BROKER_TOKEN`, configured together to enable isolated Server Function Secret resolution; the URL is the Backend service origin
- `REMOTE_CONTROL_PLANE_SECRET_BROKER_TIMEOUT_MS`, default `5000`
- `REMOTE_TERMINAL_ACCESS_TTL_MS`, default `60000`, maximum `900000`

Tokens are runtime-only secrets. They must not be written to Workspace, execution
requests, snapshots, events, diagnostics, artifacts, generated source, or logs.
The deployable composition installs a transport-neutral output guard over the
client token, database URL, every worker token, and optional canaries. Request,
snapshot, identity/cache input, event, diagnostic, trace, test report, artifact
descriptor/content, and crash-reason ingestion is scanned before persistence.
On a hit, the original payload is discarded, the execution is failed with the
fixed `secret-material-detected` reason, and only safe `EXE-5004` evidence is
retained. The active lease token is added transiently for every worker mutation.

Remote Terminal uses a separate, non-durable protocol. Open/resume requires the
client credential, while read/write/resize/signal/close requires only a rotated,
short-lived execution token. The broker stores its digest, never the plaintext.
Raw stdin exists only in the bounded unacknowledged worker mailbox and is deleted
after cursor acknowledgement. stdout/stderr are independently streaming-redacted
before bounded cursor replay. Execution terminal state, worker lease loss, and TTL
sweeps revoke the token, clear the mailbox, and close the session.

The current broker is process-local ephemeral state. Deploy this first vertical
with a single Control Plane replica or terminal-session sticky routing. A shared
ephemeral broker and cross-replica failover/resume path remain part of the full
Remote recovery milestone.

Provider routing uses four canonical identities: `prodivix.remote.preview`,
`prodivix.remote.test`, `prodivix.remote.build`, and the networkless one-shot
`prodivix.remote.server-function` production profile. Workers set
`REMOTE_WORKER_PROVIDER_ID` to exactly one identity; deployments that offer every
profile run independently scalable worker pools for each identity. The Server
Function pool accepts only an exact isolated production plan and never executes
project source in the Control Plane process.

Backend-authenticated create requests may carry the internal
`X-Prodivix-Execution-Server-Authority` base64url attestation. The HTTP boundary
strictly decodes its exact principal/sorted-permission/workspace/snapshot/expiry
shape, enforces a
five-minute maximum lifetime, and stores it outside request/snapshot JSON in the
same PostgreSQL transaction as execution creation. Public execution responses and
repository records do not expose it. The idempotency identity includes the permission
grant. Only an unexpired worker claim receives a
projection additionally fenced to execution id, worker id, and lease attempt;
the lease token and product session are never copied. Terminal transition deletes
the durable authority row.

Secret-backed isolated code exports use a separate worker-only endpoint. After
worker-token authentication, the composition verifies the current execution
lease, attempt, snapshot digest, production plan, and `environment-binding`
requirement. It forwards only immutable execution/function identity and the
Worker's ephemeral X25519 public key to the Backend broker. The response is a
strict short-lived AES-GCM ciphertext envelope sealed directly to that key; the
Control Plane never receives plaintext and includes the broker token in its
output leak guard. The Backend response must be JSON with no-store/nosniff
hardening and is cut off while streaming past 768 KiB. Only an initial `starting`
Job or a reclaimed `running` Job with the exact active positive-attempt lease can
resolve it; `cancelling`, expired, stale-worker, and stale-token requests are denied.

## Endpoints

- `GET /healthz`
- `POST /v1/executions` — versioned Remote Execution envelope
- `POST /v1/executions/:executionId/terminal-sessions`
- `POST /v1/executions/:executionId/terminal-sessions/:terminalSessionId/resume`
- `POST /v1/executions/:executionId/terminal-sessions/:terminalSessionId/{read,write,resize,signal,close}`
- `POST /internal/v1/claims`
- `POST /internal/v1/executions/:executionId/lease`
- `POST /internal/v1/executions/:executionId/transition`
- `POST /internal/v1/executions/:executionId/snapshot`
- `POST /internal/v1/executions/:executionId/server-function-secrets`
- `POST /internal/v1/executions/:executionId/events`
- `POST /internal/v1/executions/:executionId/terminal/commands`
- `POST /internal/v1/executions/:executionId/terminal/output`
- `POST /internal/v1/executions/:executionId/terminal/close`

Internal endpoints require a worker-bound bearer token. Snapshot materialization
also requires the current, unexpired lease token.
Event ingestion assigns the canonical cursor server-side. Worker payloads cannot
choose job ids, cursors, timestamps, provider URLs, or state transitions.
