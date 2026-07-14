# @prodivix/plugin-host

Transport-neutral Plugin Host core for Prodivix. The package owns permission resolution, contribution transactions, plugin lifecycle, cleanup, and audit events without depending on React, DOM, application state, or a concrete sandbox transport.

Implemented boundaries:

- immutable, revisioned permission snapshots with deny-wins and no-overgrant validation;
- exact contribution contract lookup, strict resource JSON, limits, and SHA-256 integrity;
- owner/generation/lifetime-aware registry with staged atomic transactions and deterministic cleanup;
- separate availability and runtime state axes with serialized operations, revocation, crash handling, and late-session cleanup;
- verified runtime artifact loading with an independent byte limit, SHA-256 identity, package digest binding, and explicit adapter input;
- idempotent Host shutdown that aborts discovery/activation, deactivates runtimes, clears owner leases, and closes subscribers;
- injected package reader, policy, runtime adapter, integrity service, audit sink, clock, and ID factory ports.

Browser sandbox transport, Host Gateway adapters, concrete contribution payload contracts, and editor surface integration are intentionally outside this package. Palette v1 is implemented by `@prodivix/plugin-contracts` plus the Blueprint web composition root while reusing this package without adding React or editor dependencies.

Implementation contracts are documented in:

- `specs/decisions/29.plugin-extension-points.md`
- `specs/implementation/plugin-host-lifecycle-and-permissions.md`
- `specs/implementation/plugin-host-contribution-registry.md`
- `specs/implementation/plugin-browser-sandbox-phase4.md`

Run package validation with:

```bash
pnpm --filter @prodivix/plugin-host test
pnpm --filter @prodivix/plugin-host build
```
