# @prodivix/vscode-debugger

Read-only VS Code DAP adapter for canonical NodeGraph wire documents. Public contracts and execution semantics belong to `@prodivix/nodegraph`; this package translates DAP requests, source locations and bounded values.

`launch` requires a `program` file and accepts a positive `documentRevision` (default `1`) and `stopOnEntry` (default `true`). The compiled Program is immutable. Its document revision and digest join the domain controller's job, attempt, generation, lease and command sequence. Execution commands check the source byte projection before proceeding; source changes or removal cancel the active session and require a fresh launch.

The adapter implements node breakpoints, continue, next, step in/out, pause/cancel, threads, stack frames, scopes and bounded node outputs. Node locations come from the decoded JSON source and typed node identity. Only first-party client programs with no required capabilities compile; no external gateways or arbitrary CodeSlot source are provided. Runtime state remains temporary and never writes Workspace.

Run `pnpm --filter @prodivix/vscode-debugger test` for typecheck/build and protocol tests. `pnpm --filter @prodivix/vscode-debugger start` starts the bundled stdio adapter. The library entry exports `NodeGraphDebugSession` and `startDebugAdapter` without starting a process during import.
