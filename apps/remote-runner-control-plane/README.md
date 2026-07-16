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

Tokens are runtime-only secrets. They must not be written to Workspace, execution
requests, snapshots, events, diagnostics, artifacts, generated source, or logs.

Provider routing uses the three canonical identities
`prodivix.remote.preview`, `prodivix.remote.test`, and `prodivix.remote.build`.
Workers set `REMOTE_WORKER_PROVIDER_ID` to exactly one identity; deployments that
offer every profile run independently scalable worker pools for each identity.

## Endpoints

- `GET /healthz`
- `POST /v1/executions` — versioned Remote Execution envelope
- `POST /internal/v1/claims`
- `POST /internal/v1/executions/:executionId/lease`
- `POST /internal/v1/executions/:executionId/transition`
- `POST /internal/v1/executions/:executionId/snapshot`
- `POST /internal/v1/executions/:executionId/events`

Internal endpoints require a worker-bound bearer token. Snapshot materialization
also requires the current, unexpired lease token.
Event ingestion assigns the canonical cursor server-side. Worker payloads cannot
choose job ids, cursors, timestamps, provider URLs, or state transitions.
