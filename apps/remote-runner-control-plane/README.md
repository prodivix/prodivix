# Prodivix Remote Runner Control Plane

Independent G2 service that composes the versioned Remote Execution protocol,
PostgreSQL repository/snapshot adapters, authorization, quota, provider routing,
and worker lease fencing. It does not execute user code.

## Required environment

- `REMOTE_CONTROL_PLANE_DATABASE_URL`
- `REMOTE_CONTROL_PLANE_CLIENT_TOKEN`
- `REMOTE_CONTROL_PLANE_CLIENT_SUBJECT`
- `REMOTE_CONTROL_PLANE_WORKER_TOKENS_JSON`, an object mapping each worker id to its bearer token
- `REMOTE_TERMINAL_STATE_ACTIVE_KEY_ID`, the active Remote Terminal state key id
- one Terminal state provider configuration:
  - compatibility/development default: `REMOTE_TERMINAL_STATE_KEYS_JSON`, a JSON object mapping key ids to canonical base64-encoded 32-byte AES keys;
  - managed production: `REMOTE_TERMINAL_STATE_KMS_PROVIDER=aws-kms`, `REMOTE_TERMINAL_STATE_KMS_AWS_REGION`, and `REMOTE_TERMINAL_STATE_KMS_AWS_KEY_ARNS_JSON`, whose logical ids map to exact immutable KMS key ARNs

Optional:

- `REMOTE_CONTROL_PLANE_PORT`, default `4310`
- `REMOTE_CONTROL_PLANE_MAX_ACTIVE_EXECUTIONS`, default `4`
- `REMOTE_CONTROL_PLANE_MAX_WORKER_ATTEMPTS`, default `3`; an expired active Job at this limit is atomically failed with `worker-recovery-exhausted` instead of being reclaimed forever
- `REMOTE_CONTROL_PLANE_ARTIFACT_SWEEP_MS`, default `60000`
- `REMOTE_CONTROL_PLANE_ARTIFACT_SWEEP_BATCH`, default `100`
- `REMOTE_CONTROL_PLANE_SECRET_CANARIES_JSON`, a bounded JSON string array used by security Gates
- `REMOTE_CONTROL_PLANE_SECRET_BROKER_URL` and `REMOTE_CONTROL_PLANE_SECRET_BROKER_TOKEN`, configured together to enable isolated Server Function Secret resolution; the URL is the Backend service origin
- `REMOTE_CONTROL_PLANE_SECRET_BROKER_TIMEOUT_MS`, default `5000`
- `REMOTE_TERMINAL_ACCESS_TTL_MS`, default `60000`, maximum `900000`
- `REMOTE_TERMINAL_STATE_KMS_TIMEOUT_MS`, default `5000`, maximum `30000`
- in managed mode only, `REMOTE_TERMINAL_STATE_KEYS_JSON` may remain temporarily as a decrypt-only PRT1 migration source
- regional mode is optional but all-or-none: `REMOTE_CONTROL_PLANE_DEPLOYMENT_ID`,
  `REMOTE_CONTROL_PLANE_REGION_ID`, `REMOTE_CONTROL_PLANE_INITIAL_ACTIVE_REGION_ID`, and
  `REMOTE_CONTROL_PLANE_TRAFFIC_DATABASE_URL`

Tokens are runtime-only secrets. They must not be written to Workspace, execution
requests, snapshots, events, diagnostics, artifacts, generated source, or logs.
The deployable composition installs a transport-neutral output guard over the
client token, database URL, every worker token, and optional canaries. Request,
snapshot, identity/cache input, event, diagnostic, trace, test report, artifact
descriptor/content, and crash-reason ingestion is scanned before persistence.
On a hit, the original payload is discarded, the execution is failed with the
fixed `secret-material-detected` reason, and only safe `EXE-5004` evidence is
retained. The active lease token is added transiently for every worker mutation.

Remote Terminal uses a separate, short-lived recovery protocol. Open/resume requires the
client credential, while read/write/resize/signal/close requires only a rotated,
short-lived execution token. The broker stores its digest, never the plaintext.
Raw stdin exists only in the bounded unacknowledged worker mailbox and is deleted
after cursor acknowledgement. The complete bounded checkpoint is AES-256-GCM sealed
with execution/session/revision authenticated data before PostgreSQL storage; the
database sees only opaque bytes and routing/expiry metadata. stdout/stderr are
independently streaming-redacted, and their possible Secret-prefix suffix is restored
inside the same encrypted envelope before bounded cursor replay.

Static PRT1 envelopes directly use a versioned AES key ring and remain the local compatibility
mode. Managed PRT2 envelopes generate a fresh 256-bit data key for every state revision,
encrypt the checkpoint locally, and send only that data key to AWS KMS for wrapping. KMS
encryption context contains a fixed purpose and SHA-256 of the exact AAD; execution/session
identity never enters CloudTrail-visible context. The local envelope binds provider, logical
key id, KMS wrapper metadata, execution/session, revision, and expiry. A KMS timeout or
retryable service failure leaves the PostgreSQL revision untouched and returns retryable
`unavailable`; authenticated envelope drift continues to fail closed.

Every client and worker operation reloads and strictly decodes the state, rechecks the
exact current worker lease, and persists `revision + 1` with compare-and-swap. Any
Control Plane replica can therefore continue the same token, mailbox, output cursor,
and resume rotation after another replica disappears. CAS retries preserve stdin and
worker-output idempotency. A sweep first observes lease renewal; worker generation loss
or execution termination revokes the token, clears the mailbox, closes the state, and
deletes it behind the exact revision fence. Static rotation keeps old and new entries in
`REMOTE_TERMINAL_STATE_KEYS_JSON`; managed rotation keeps old and new exact ARNs while
changing the active logical id. New revisions naturally use the active managed key, and an
optional static ring allows an old PRT1 row to be read once and rewritten as PRT2 by the next
CAS mutation.

Cross-Region recovery is restricted to related AWS multi-Region keys. Each deployment uses
its local region and exact local MRK ARN under the same logical key id. PRT2 binds the stable
partition/account/`mrk-*` identity, so a related replica can unwrap the copied authority row
without a cross-Region KMS call; an unrelated MRK, a single-Region ARN in the wrong region,
or response-key drift is rejected before state plaintext is released.

Regional execution DR uses a separate shared PostgreSQL traffic authority. Every public/internal
request and background artifact/Terminal sweep in the active region holds a deployment-scoped
shared advisory transaction lock. Cutover takes the exclusive lock, drains accepted requests,
rechecks an exact repeatable-read source/target checkpoint, then advances one durable epoch and
writes immutable cutover evidence. Standby or authority-outage requests fail closed; they never
fall back to local writes. The traffic database must be one strongly consistent coordination
domain shared by every region, not an asynchronously replicated per-region table.

An unexpired exact Worker lease can continue against the target Control Plane. An expired lease
uses the existing bounded attempt reclaim; its old Terminal row is closed and revision-fenced out
before attempt+1 can create a new session/PTY generation. Application code does not copy execution
rows and does not migrate PTY processes: database replication/promotion and external DNS/Anycast
routing remain infrastructure/runbook responsibilities.

The protected recovery operator is a separate one-shot process, never an HTTP endpoint:

```bash
pnpm --filter @prodivix/remote-runner-control-plane regional-recovery
```

It accepts a strict credential-free request for 1-128 executions and callback-bound signed proof
files through the independent `REMOTE_DR_*` configuration surface. Planned recovery requires exact
source/target checkpoints. Source-unavailable recovery never queries the source, but additionally
requires role-separated Ed25519 authorization, infrastructure-fence and exact target replication
attestation proofs, an accepted RPO upper bound, and expiry of every old worker lease. Authorization
proof digests are consumed once in PostgreSQL. Output is a create-new, mode-0600, self-digesting
sanitized evidence file with no raw execution ids, credentials, ARNs, database locations, Terminal
ids or application payloads. Schema migration and traffic initialization are deployment-time tasks;
the operator does not run DDL or reset epochs. See
[`docs/operations/regional-recovery.md`](../../docs/operations/regional-recovery.md) for the exact
request, proof and failure procedure.

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
- `GET /readyz` — active-region readiness; standby and authority outage return `503`
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
