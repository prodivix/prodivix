# Prodivix

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Version](https://img.shields.io/badge/version-0.1.0--alpha-orange.svg)

Language: English | [简体中文](README.zh-CN.md)

Prodivix is an open-source, browser-based visual development environment for modern front-end applications. It combines blueprint editing, node-graph logic, animation authoring, code authoring, workspace persistence, diagnostics, preview, and production export around a canonical Workspace VFS.

The **Canonical Workspace VFS is the single source of authoring truth**. PIR owns normalized UI documents; NodeGraph and Animation use their own Workspace document types, while route manifests, code documents, assets, and configuration remain first-class records. `CodeReference` connects domain documents to code without embedding the source into a single giant JSON file.

Prodivix is in active alpha development. The current product position is **G1 Passed / G2 Foundation**: semantic visual/code hybrid authoring has a repeatable closure, while executable full-stack Workspace capabilities are now being built.

## Project Goals

Prodivix is built around several long-term constraints:

- **One canonical authoring truth**: Workspace, Route, PIR, Code, Asset, and Config documents live in the Canonical Workspace VFS rather than editor-private mirrors.
- **One durable write path**: production authoring changes are planned as Domain Commands or Transactions, persisted through the Durable Outbox, and synchronized through an Atomic `WorkspaceOperation` Commit.
- **Low-cost PIR evolution**: every G1 consumer uses the stable, version-neutral PIR-current domain model; numeric wire upgrades stay inside immutable schemas, generated boundary contracts, codecs, and deterministic migrations.
- **Visual editing without a ceiling**: visual workflows coexist with real code, external packages, diagnostics, source navigation, and production export.
- **Local-first recovery**: confirmed snapshots, pending operations, retry, conflict recovery, and offline reopening use the formal local replica and Outbox contracts.
- **Evidence-based product gates**: architecture decisions, implementation status, and product-gate status are tracked separately under `specs/`.

## Repository Layout

```text
.
├── apps/
│   ├── web/                  # Browser editor and application composition root
│   ├── backend/              # Go backend, Atomic Commit, persistence, and sync APIs
│   ├── cli/                  # Command-line tooling
│   ├── vscode/               # VS Code extension and debugger integration
│   ├── docs/                 # VitePress documentation site
│   └── plugin-sandbox/       # Browser plugin sandbox application
├── packages/
│   ├── animation/            # Animation contracts, authoring helpers, and evaluation
│   ├── authoring/            # Workspace Semantic Index kernel and code authoring contracts
│   ├── code-language/        # Revision-bound language and shader compile capabilities
│   ├── diagnostics/          # Diagnostic contracts, catalogs, and collections
│   ├── golden-conformance/   # Living Golden App and G0 conformance gate
│   ├── nodegraph/            # NodeGraph model, validation, and execution kernel
│   ├── pir/                  # PIR normalization, graph, materialization, and validation
│   ├── pir-react-renderer/   # React projection of framework-neutral PIR
│   ├── router/               # Route contracts, matching, composition, and validation
│   ├── runtime-core/         # Transport-neutral execution contracts and registries
│   ├── runtime-browser/      # Browser runtime adapters and animation projections
│   ├── workspace/            # Canonical Workspace VFS, commands, history, and projection
│   ├── workspace-sync/       # Atomic Commit planning, Outbox, conflict, and recovery
│   ├── prodivix-compiler/    # Production export and code generation
│   ├── ai/                   # Shared AI provider and runtime foundations
│   ├── i18n/                 # Internationalization resources
│   ├── shared/               # Remaining cross-domain primitives
│   ├── tokens/               # DTCG Format/Resolver current models, codecs, and semantic providers
│   ├── themes/               # Product-theme manifests and CSS variable projection
│   ├── ui/                   # Shared UI components
│   ├── vscode-debugger/      # PIR debug adapter for VS Code
│   └── plugin-*/             # Plugin contracts, hosts, tooling, and official adapters
├── scripts/                  # Repository automation and verification entry points
├── specs/                    # Decisions, contracts, roadmaps, and implementation plans
├── tests/                    # Repository-level and E2E tests
└── package.json
```

## Current Status

| Area                                     | Status                                                                                                                                                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overall product position                 | **G1 Passed / G2 Foundation**; G2 `ProductGateStatus` is `In Progress`                                                                                                                                                                      |
| Truth & Change Kernel                    | G0 passed: canonical truth, History, Atomic Commit, revision conflicts, Durable Outbox, local replica, and a single production write path are in place                                                                                      |
| Diagnostics and Issues                   | G0 passed: revision-aware aggregation, stable targets, source spans, Quick Fix boundaries, and editor navigation are covered                                                                                                                |
| Golden conformance and React/Vite export | G0 non-browser closure passed; G1 Golden covers Blueprint reuse, Public Contract props/events/slots/variants, controlled JSX/CSS round-trip, and independent generated-project install/typecheck/test/build                                 |
| Semantic visual/code authoring           | G1 passed with the revision-bound Workspace Semantic Index, TS/JS/CSS/SCSS/GLSL/WGSL capabilities, shader validation, cross-editor CodeSlots, Blueprint reuse, durable production writes, and controlled PIR-current ↔ JSX/CSS round-trip   |
| Design tokens                            | Canonical Workspace DTCG token and Resolver documents use versionless current models, reversible Commands, alias/type validation, standardized theme/variant resolution plans, shared Semantic Providers, and a Resources authoring surface |
| Blueprint, Route, and PIR authoring      | One version-independent PIR-current domain model drives Component Instance, extraction, contracts, Collection, preview, and export; numeric versions stay at the wire migration boundary                                                    |
| NodeGraph and Animation                  | Independent domain/runtime packages own their kernels; later gates complete lifecycle, composition, and end-to-end behavior verification                                                                                                    |
| AI-assisted authoring                    | Foundation only; AI may propose planner input but must use the same Command, Outbox, and Atomic Commit path as human edits                                                                                                                  |

The global phase definition and repeatable closure evidence are maintained in [`specs/roadmap/global-phases.md`](specs/roadmap/global-phases.md), [`specs/roadmap/g0-closure-evidence.md`](specs/roadmap/g0-closure-evidence.md), and [`specs/roadmap/g1-closure-evidence.md`](specs/roadmap/g1-closure-evidence.md).

## Getting Started

### Requirements

- Node.js 22 or newer
- pnpm 11.9.0 (Corepack recommended)
- Go 1.24 or newer
- Git
- PostgreSQL for backend-backed Workspace flows

### Install

```bash
git clone https://github.com/Mdr-Tutorials/prodivix.git
cd prodivix
pnpm install
```

### Run Locally

For day-to-day development, start the backend and Web editor in separate terminals:

```bash
pnpm dev:backend
pnpm dev:web
```

Backend-backed Workspace, authentication, synchronization, and project persistence require PostgreSQL. From `apps/backend`, run `docker compose up -d` to start a local database. Backend dependencies are managed by Go modules and can be preloaded with `go mod download`. See [`apps/backend/README.md`](apps/backend/README.md) for backend-specific setup.

On Windows, `scripts\start-dev.bat` can open the native PostgreSQL, backend, Web editor, and UI Storybook processes together. Copy `.env.example` to `.env.local` to override the local PostgreSQL connection or `PRODIVIX_PG_BIN`; the database and backend launchers read the same `BACKEND_DB_URL`.

Common entry points:

| Command                | Description                              |
| ---------------------- | ---------------------------------------- |
| `pnpm dev:web`         | Start the browser editor                 |
| `pnpm dev:backend`     | Start the Go backend                     |
| `pnpm dev:backend:hot` | Start the backend with Air hot reload    |
| `pnpm dev:docs`        | Start the documentation site             |
| `pnpm dev:cli`         | Start CLI development mode               |
| `pnpm dev:vscode`      | Start VS Code extension development mode |
| `pnpm storybook:ui`    | Start the UI package Storybook           |

Repository-level commands:

| Command                         | Description                                             |
| ------------------------------- | ------------------------------------------------------- |
| `pnpm build`                    | Build packages and applications through Turbo           |
| `pnpm lint`                     | Run lint and repository boundary checks                 |
| `pnpm test`                     | Run repository tests through Turbo                      |
| `pnpm test:golden`              | Run the Living Golden App conformance suite             |
| `pnpm run verify:g1:standalone` | Install, typecheck, test, and build the exported G1 app |
| `pnpm run verify:g1:browser`    | Run the exported G1 app and verify WebGL2/WebGPU        |
| `pnpm run verify:g0`            | Re-run the complete eight-stage G0 closure verification |
| `pnpm test:e2e:smoke`           | Run the smoke E2E suite                                 |
| `pnpm run format`               | Format TypeScript, Markdown, JSON, styles, and Go code  |

`pnpm run verify:g0` verifies the non-browser Truth & Change Kernel. `pnpm run verify:g1:standalone` separately verifies generated-project installation, typechecking, tests, and production build. `pnpm run verify:g1:browser` repeats the independent production build, serves it on an ephemeral local origin, verifies route and form behavior, and compiles minimal shaders through real WebGL2 and WebGPU devices. Visual regression, accessibility, performance, and formal later-phase `VerificationEvidence` remain separate gates.

## Architecture Overview

All durable authoring state belongs to the Canonical Workspace VFS. Domain planners convert user, AI, plugin, import, or recovery input into reversible Commands or Transactions. A production write then follows one durable path:

```text
Human gesture / AI proposal / plugin action
    -> local domain planner
    -> Domain Command / Transaction
    -> Durable Operation Outbox
    -> Atomic WorkspaceOperation Commit
    -> confirmed revisions and local replica
```

The planned Command or Transaction is also applied locally to the Canonical Workspace VFS and recorded in Operation History. Remote acknowledgement advances the confirmed revision without creating a second authoring truth.

`Intent` stays inside local or AI planners; production persistence begins with a validated Command or Transaction wrapped as a `WorkspaceOperation`.

The canonical VFS owns several first-class document domains and projects them into consumers without creating another authoring truth:

```text
Canonical Workspace VFS
    ├── workspace.json / route-manifest.json
    ├── PIR UI documents: page / layout / component / normalized ui.graph
    ├── NodeGraph and Animation documents: pir-graph / pir-animation
    ├── code documents and CodeReference bindings
    └── assets / configuration
            -> validation / diagnostics
            -> renderer / preview runtime
            -> production export
            -> backend / Git projections
```

PIR trees are materialized only as temporary read projections where a renderer or compiler needs them. Editors and AI do not persist a second tree-shaped source of truth.

## Documentation

The root README is the repository entry point. Current contracts and project status live in the following sources:

| Location                                                                                                                                 | Purpose                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| [`apps/docs/`](apps/docs/)                                                                                                               | User and contributor documentation site                |
| [`apps/docs/guide/getting-started.md`](apps/docs/guide/getting-started.md)                                                               | Detailed local setup                                   |
| [`specs/roadmap/global-phases.md`](specs/roadmap/global-phases.md)                                                                       | Canonical G0-G6 product phases and current gate        |
| [`specs/roadmap/g0-closure-evidence.md`](specs/roadmap/g0-closure-evidence.md)                                                           | Repeatable evidence for G0 Passed                      |
| [`specs/roadmap/g1-closure-evidence.md`](specs/roadmap/g1-closure-evidence.md)                                                           | Repeatable evidence for G1 Passed                      |
| [`specs/workspace/workspace-model.md`](specs/workspace/workspace-model.md)                                                               | Canonical Workspace model                              |
| [`specs/decisions/34.core-package-boundaries.md`](specs/decisions/34.core-package-boundaries.md)                                         | Core package ownership and dependency boundaries       |
| [`specs/decisions/35.canonical-workspace-hard-cut.md`](specs/decisions/35.canonical-workspace-hard-cut.md)                               | Canonical Workspace production boundary                |
| [`specs/decisions/36.atomic-workspace-operation-commit.md`](specs/decisions/36.atomic-workspace-operation-commit.md)                     | Atomic `WorkspaceOperation` Commit and Outbox boundary |
| [`specs/decisions/37.verified-semantic-authoring-architecture.md`](specs/decisions/37.verified-semantic-authoring-architecture.md)       | Verified semantic authoring architecture               |
| [`specs/decisions/25.authoring-symbol-environment.md`](specs/decisions/25.authoring-symbol-environment.md)                               | Workspace Semantic Index contract                      |
| [`specs/decisions/38.blueprint-component-instance-and-collection.md`](specs/decisions/38.blueprint-component-instance-and-collection.md) | Blueprint component and Collection contract            |
| [`specs/implementation/g1-semantic-component-collection.md`](specs/implementation/g1-semantic-component-collection.md)                   | Completed G1 semantic/component/Collection plan        |
| [`apps/docs/reference/pir-spec.md`](apps/docs/reference/pir-spec.md)                                                                     | PIR reference documentation                            |
| [`specs/decisions/README.md`](specs/decisions/README.md)                                                                                 | Architecture decision index                            |
| [`specs/diagnostics/README.md`](specs/diagnostics/README.md)                                                                             | Diagnostic domains and code catalogs                   |

## Development Notes

- `@prodivix/ui` styles are authored with SCSS.
- Application-level styling uses Tailwind CSS 4 conventions.
- Prefer package-local aliases such as `@/...` where they are configured.
- Code-owned capabilities connect through the Code Authoring Environment; all domains contribute to and query the revision-bound Workspace Semantic Index instead of scanning one another's private state.
- Avoid tests coupled to DOM hierarchy, internal classes, snapshots, or implementation details. Prefer user-visible behavior, public APIs, stable state results, and semantic outcomes.
- Use Git-indexed discovery commands such as `git ls-files`, `git diff --name-only`, and `git grep` when scanning repository files.

## Contributing

This alpha project implements the current target architecture directly and treats active canonical contracts as the sole production baseline. Before a large change, read the relevant product phase, architecture decision, and implementation plan.

Useful starting points:

- [`AGENTS.md`](AGENTS.md) for shared repository architecture and development rules
- [`CLAUDE.md`](CLAUDE.md) for Claude Code-specific repository notes
- [`apps/docs/community/contributing.md`](apps/docs/community/contributing.md) for contribution guidance
- [`specs/decisions/README.md`](specs/decisions/README.md) for architecture decision navigation

## License

Prodivix is released under the [MIT License](LICENSE).
