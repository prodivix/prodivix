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

Provider routing uses the three canonical identities
`prodivix.remote.preview`, `prodivix.remote.test`, and `prodivix.remote.build`.
Workers set `REMOTE_WORKER_PROVIDER_ID` to exactly one identity; deployments that
offer every profile run independently scalable worker pools for each identity.

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
- `POST /internal/v1/executions/:executionId/events`
- `POST /internal/v1/executions/:executionId/terminal/commands`
- `POST /internal/v1/executions/:executionId/terminal/output`
- `POST /internal/v1/executions/:executionId/terminal/close`

Internal endpoints require a worker-bound bearer token. Snapshot materialization
also requires the current, unexpired lease token.
Event ingestion assigns the canonical cursor server-side. Worker payloads cannot
choose job ids, cursors, timestamps, provider URLs, or state transitions.
