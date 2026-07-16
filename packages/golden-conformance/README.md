# Prodivix Golden Conformance

This private package owns the living G0 baseline and the growing G1 Golden App
evidence. It exercises one canonical Workspace through authoring, history,
atomic-commit planning and durable projection, local-replica recovery,
revision-conflict resolution, controlled PIR/JSX/CSS round-trip,
Public Contract props/events/slots/variants with Slot Outlet projection,
full-workspace export, and an in-process Vite production build.

The G2 Browser/Remote contract matrix compiles that same living Golden Workspace
once into a single `ExecutableProjectSnapshot`. Browser Preview and Test consume
it through one shared Browser Runtime Host; independent Remote Preview, Test,
and Build providers receive the exact same snapshot digest. The Gate compares
canonical Test semantics, validates Preview readiness and URI projection, keeps
the live Browser versus finite Remote Preview lifecycle difference explicit, and
declares Browser Build unsupported instead of inventing a provider.

The rootless isolation Gate emits that snapshot through the strict Remote wire
codec and executes real dependency install, Preview, Test, and Build commands in
rootless Podman. Its install phase uses an internal network whose only egress is
the hostname/443 allowlist proxy; the Gate actively denies a non-allowlisted
origin and requires origin-only sanitized traces for real package requests. The
worker then disconnects and verifies an empty runtime network before any project
command can start. Preview and Build bundles are strictly decoded and compared,
and the private Vitest output must become a canonical Test report with source
trace.

Run it from the repository root:

```bash
pnpm run test:golden
pnpm run verify:g2:execution-matrix
pnpm run verify:g2:rootless-sandbox
```

Run the independent generated-project gate with:

```bash
pnpm run verify:g1:standalone
```

Run the generated production bundle in a real Chrome origin with:

```bash
pnpm run verify:g1:browser
```

The default suite syntax-transforms every generated JS/TS module and
externalizes bare package imports during the in-process build. The standalone
gate consumes the generated package-manager declaration, then installs,
typechecks, tests, and builds the temporary React/Vite project. The browser gate
repeats that independent package sequence, serves only the production `dist`,
and verifies page loading, client routing, form interaction, a linked WebGL2
program, and a compiled WebGPU shader through a real adapter and device. The
ephemeral server, browser, and project directory are always closed after the
Gate. Visual regression remains a separate concern.

The fixture is a backend wire-format Workspace in
`fixtures/golden-app.base.workspace.json`. Scenario changes should be authored
through public Command, History, Workspace Sync, and Compiler APIs instead of
mutating the expected export by hand.
