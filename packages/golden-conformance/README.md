# Prodivix Golden Conformance

This private package owns the living G0 baseline and the growing G1 Golden App
evidence. It exercises one canonical Workspace through authoring, history,
atomic-commit planning and durable projection, local-replica recovery,
revision-conflict resolution, controlled PIR/JSX/CSS round-trip,
Public Contract props/events/slots/variants with Slot Outlet projection,
full-workspace export, and an in-process Vite production build.

Run it from the repository root:

```bash
pnpm run test:golden
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
