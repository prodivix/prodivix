# Ordinary Agent Task runtime

This Node application consumes durable ordinary Agent Tasks. It uses the public
AI, Workspace, Workspace Sync and Verification owners for state transitions,
context, proposals, approval preflight, exact Outbox requests and G3 closure. A
model cannot approve or commit authoring changes. The application has no
evaluation coordinator authority.

Build the workspace dependencies and this application, then run:

```sh
pnpm --filter @prodivix/agent-runtime build
node apps/agent-runtime/dist/main.js /etc/prodivix/agent-runtime.json
```

`--once` performs one polling cycle. `runtime.example.json` is a sanitized,
unconfigured example. Its `bindings: []` deliberately creates a durable blocked
result rather than inventing provider qualification, credentials or permissions.
Replace the `.invalid` backend host with the actual authenticated service.

## Worker authentication and admission

Set the backend's `BACKEND_AGENT_RUNTIME_TOKEN_ENV` to the name of a server
environment variable containing a random worker token of at least 32 bytes. Set
the worker's `bearerEnvironmentVariable` to a server environment variable holding
that same token. Environment variable names may appear in configuration; their
values must never be placed in this file, a Workspace, a browser, a command-line
argument or generated output.

The worker polls `/api/internal/agent/runtime/tasks` even when no tasks exist. A
successful recent poll advertises readiness; the production backend refuses new
tasks if no worker has polled recently. The authenticated Web/CLI user requests a
Task admission challenge before creating a Task. The backend captures the current
actor, owner, project policy, Workspace revision and provisional immutable Task.
The worker intersects configured platform/project/actor/grant policy through the
AI owner and returns a bounded grant and exact effective policy. The backend
rechecks current authorization and revision, persists the admission, and requires
its ID and digest in the subsequent Task creation request. Only `initialGrantRef`
changes during admission. Browser clients cannot mint trusted profiles or grants.

Each `bindings` entry is a trusted operator profile/template with the fields in
`AgentRuntimeBinding` (`src/config.ts`):

- `taskId` is an exact Task binding or the unique template identifier. Admission
  binds its validated profile to the backend challenge's Task; it cannot widen
  the template's subject, Workspace, target scope, capabilities, network/Secret
  references or budget.
- `catalog`, `qualification` and `inference` are complete current public AI owner
  facts. Their canonical digests must agree with provider configuration, endpoint
  profile, immutable model lineage, capability profile, effective policy, prompt
  policy and output schema. Use actual registered/probed facts and real evaluation
  evidence; changing a digest manually does not create qualification.
- `policy` is the complete validated effective intersection with its upstream
  layers and authenticated actor authorization digest. The project layer must
  match the saved Workspace Agent policy. `grant` is the bounded current grant
  template; admission produces the short grant for the immutable Task.
- `reservation` covers the complete model request's usage, cost, elapsed time and
  effect counters. `pricing` is required when a cost ceiling or cost reservation
  exists. Unknown usage is charged conservatively through the owner ledger.
- `transport` contains an HTTPS endpoint, exact POST/deny-redirect endpoint
  profile and `credentialEnvironmentVariable`. The grant and every upstream
  policy layer must permit its server-side Secret purpose and network request.
- `verification` contains current public G3 policy, checks, scenarios, adapter
  registrations and compiler/planner identities, excluding `impactSet`, which is
  rebuilt from canonical Workspace owners. All required Task checks must be
  covered by an executable Plan.
- `verificationDriver` registers the actual production driver endpoint,
  `providerId`, server `credentialEnvironmentVariable`, exact
  `adapterRegistryDigest` and bounded `maximumRuntimeMs`. Its policy and grant
  must permit the `verification-execution` Secret purpose and its network host.

An explain/plan Task needs an exact admission-qualified profile. Propose/apply
requires exact release-evaluated qualification. Missing, expired or mismatched
facts produce a durable blocked Run before provider dispatch. Deterministic
transport tests do not satisfy real-model qualification.

Explain and plan publish a separate bounded `AgentTaskOutput` before Run success.
The public codec checks its content/fact digests, Task/Run/generation, completed
invocation, context and both policy identities. User-visible text is capped at
65,536 UTF-16 units and screened for credential-like text; the credential callback
also reconstructs and decodes the complete result before checking its actual
Secret canary. The durable event contains only the sanitized invocation receipt.
A lost output-publication ACK replays the exact saved answer without calling the
model again.

## Exact writes, recovery and cancellation

Proposal inputs cross registered domain decoders and become one reversible owner
Transaction. The domain preview and G3 Plan are published before explicit human
approval. An apply Task rechecks that exact decision and current base, persists
the official Workspace Outbox entry, then submits the original request to the
backend's Atomic Commit port. The backend checks lease, generation, approval and
request digest inside the authoring transaction. A lost ACK is retried with the
same request and started receipt. Stale approval never triggers an automatic
rebase or a different authoring request.

`stateDirectory` must be persistent storage shared with a restarting instance
of the same worker. Journal records are bounded, digest checked and immutable:
exclusive temporary creation, file fsync, atomic no-replace hard link, published
file fsync, and POSIX directory fsync. Windows uses NTFS atomic links and file
flush; Node does not expose a portable directory flush there. Validate the actual
filesystem and power-loss guarantees before a Windows production deployment;
local deterministic tests prove process restart/replay, not storage hardware
durability. Do not delete the directory to recover an uncertain commit.

Active external awaits renew the existing lease and observe durable user cancel
commands. A pending cancel or generation drift aborts the callback transport;
the worker never claims a new generation to redispatch an uncertain model call.
Queued cancellation has a dedicated command-bound, lease-free owner path.
Verification cancellation additionally requires real driver termination and
canonical cleanup facts before clean terminal acknowledgment.

## G3 execution and evidence

The production driver receives exact public Workspace/Plan/Run wires and a short
callback lease bound to the ordinary Agent Run. It must independently validate
the backend-linked context, execute registered production adapters, obtain public
AttemptGrants, stage bounded artifacts, and promote reports through the backend
Evidence owner. The driver returns only a digest-bound transport acknowledgment.
The consumer subsequently reads canonical promoted Evidence, the verified
retention/provenance view and durable G3 Runs; it uses the public Closure evaluator
and apply success proof owner. A queued run or accepted dispatch is never success.

Before the first authoring write, the worker reserves the sum of the required
cells' registered adapter artifact limits under the shared Task budget. A Plan's
estimated cost does not authorize larger artifacts. The Task's whole elapsed
time includes approval waiting, execution and every Closure owner round trip;
the final ledger settlement occurs after the Closure ACK. The latest lease,
abort state and hard budget are checked again before success. AttemptGrant
expiry is also bounded by the original Task deadline.

Before the first Outbox write, the worker sends the projected final Workspace and
Plan to the real driver's `prodivix.agent-runtime-g3-preflight` endpoint. An exact
ACK must confirm the adapter registry, every selected check kind and ready
resources. The same check runs against the actual ACK snapshot before dispatch.
The separately deployed production driver entry point is `dist/driver-main.js`;
its startup configuration and registered Linux/rootless/browser resources are
described with that service's sanitized example. Both services need an operator
profile matching the Workspace's policy, control profiles, fixtures and baseline
documents; installing binaries alone does not admit a Task.

Use `g3-driver.example.json` for the driver configuration, replace its service
host and absolute Linux paths, and run `pnpm --filter @prodivix/agent-runtime
start:driver -- /etc/prodivix/g3-driver.json`. The service binds only loopback;
deploy an authenticated HTTPS reverse proxy for the worker endpoint. The driver
requires Node 22.23.1, a rootless Podman host and an already adopted content
addressed image in `PRODIVIX_CONTROLLED_STATIC_SANDBOX_IMAGE`. Its Ed25519 private
key environment reference resolves a base64url encoded PKCS8 DER key, with no
padding. Register the matching public key and issuer/audience/subject/policy
generation in Backend attestation policy before admitting writes. A missing or
malformed key blocks startup and preflight.

The example enables the four first party static adapters. Browser checks also
require the current `ProductionChromiumRuntimeAuthorityInput` under `chromium`:
an observed executable and image digest, browser version, OS/font identities,
renderer generation and normalizer. Re-observation rejects changed executable
bytes. Saved ControlProfile and FixtureSet documents supply deterministic inputs;
the adopted Browser fixture transport supports no requests or one exact Auth
session result. Other fixture transports fail preflight. Visual checks require a
canonical BaselineSet and owner authorized, digest checked PNG asset bytes.
Each selected cell executes one fresh attempt. Policies requiring automatic
retry or multiple stability samples fail preflight until that physical attempt
coordination is adopted.
Accessibility, visual, performance and security policy profiles resolve from the
exact Config document's `verification.browserProfiles` entries, keyed by
`checkId` and `scenarioId`, with the public authored profile codec. Security
observations come from inspected build bytes and compiler probe scanning.

Every attempt records a cryptographic resource scope before starting its
toolchain, then removes only Podman containers carrying that scope's label and
checks that the query is empty. Browser and preview retirement must also return
clean owner receipts. Shutdown preserves uncertain scope records; a restarted
driver accepts the command bound cancellation/cleanup path before dispatch
replay. A residual Browser owner remains blocked instead of attesting cleanup.

The current backend admits exact projected/ACK Plan identity. A different
compatible Plan needs its formal owner compatibility proof before it can run.
Unsupported adapters, missing resources, expiry, absent required cells or evidence
keep completion blocked/incomplete. Runtime deadlines request real driver cleanup;
a timeout is not a cleanup receipt.

Package tests cover owner state transitions, admission drift, exact ACK replay,
unconfigured blocking, bounded transports and journal recovery. Paid provider and
production rootless/browser qualification remain separate external evidence Gates.
