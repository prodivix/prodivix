# Prodivix Golden Conformance

This private package owns the living G0 Golden App baseline. It exercises one
canonical Workspace through authoring, history, atomic-commit planning and
durable projection, local-replica recovery semantics, explicit
revision-conflict resolution, full-workspace export, and an in-process Vite
production build.

Run it from the repository root:

```bash
pnpm run test:golden
```

The suite intentionally avoids browser, server, and visual checks. It
syntax-transforms every generated JS/TS module and externalizes bare package
imports during the in-process build. Dependency installation,
generated-project typechecking, runtime behavior, browser behavior, and visual
regression remain later conformance gates rather than claims of this baseline.

The fixture is a backend wire-format Workspace in
`fixtures/golden-app.base.workspace.json`. Scenario changes should be authored
through public Command, History, Workspace Sync, and Compiler APIs instead of
mutating the expected export by hand.
