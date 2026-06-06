# Prodivix

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Version](https://img.shields.io/badge/version-0.1.0--alpha-orange.svg)

Language: English | [简体中文](README.zh-CN.md)

Prodivix is an open-source, browser-based visual development environment for modern front-end applications. It combines a visual blueprint editor, node-graph logic editing, animation authoring, workspace persistence, and code generation around a shared intermediate representation: **PIR**.

The project is still in active alpha development. The repository is the source code workspace for the editor, backend service, CLI, VS Code extension, shared packages, architecture decisions, and implementation specifications.

## Project Goals

Prodivix is built around several long-term constraints:

- **PIR as the source of truth**: UI, logic, animation, routing, and code generation should converge on a validated intermediate representation.
- **Visual editing without a ceiling**: visual workflows should support direct code, external packages, diagnostics, and generated production code.
- **Local-first engineering**: the editor should remain useful in local development while still supporting backend-backed workspaces, sync, and future collaboration.
- **Explicit architecture**: durable contracts are captured in `specs/` before they become hard-to-change implementation details.

## Repository Layout

```text
.
├── apps/
│   ├── web/          # Browser editor: blueprint, inspector, PIR runtime, code authoring
│   ├── backend/      # Go backend: auth, projects, workspace sync, PIR validation
│   ├── cli/          # Command-line tooling
│   ├── vscode/       # VS Code extension and PIR debugging support
│   └── docs/         # Standalone VitePress documentation site
├── packages/
│   ├── ai/           # AI provider abstractions and shared AI utilities
│   ├── i18n/         # Internationalization resources
│   ├── pir-compiler/ # PIR code generation package
│   ├── shared/       # Shared types, schemas, and validation utilities
│   ├── themes/       # Theme manifests and semantic design tokens
│   ├── ui/           # Shared UI components
│   └── vscode-debugger/
├── scripts/          # Repository automation and generated documentation scripts
├── specs/            # Architecture decisions, contracts, RFCs, and implementation plans
├── tests/            # Repository-level tests
└── package.json
```

## Current Status

| Area                                | Status                                       |
| ----------------------------------- | -------------------------------------------- |
| Blueprint editor                    | Active development                           |
| PIR v1.3 graph model and validation | Active development                           |
| Workspace VFS and backend sync      | Active development                           |
| External library runtime            | Active development                           |
| AI-assisted authoring               | Foundation in place                          |
| Node graph editor                   | Early implementation                         |
| Animation editor                    | Planned / early implementation               |
| Multi-framework code generation     | Incremental; React path is the current focus |

For detailed plans and architectural decisions, see `specs/`.

## Getting Started

### Requirements

- Node.js 22 or newer
- pnpm 10 or newer
- Go 1.22 or newer
- Git
- PostgreSQL for backend-backed workspace flows

### Install

```bash
git clone https://github.com/Prodivix/prodivix.git
cd prodivix
pnpm install
```

### Run Locally

For day-to-day development, start the backend and web editor in separate terminals:

```bash
pnpm dev:backend
pnpm dev:web
```

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

| Command                       | Description                                            |
| ----------------------------- | ------------------------------------------------------ |
| `pnpm build`                  | Build all packages and applications through Turbo      |
| `pnpm lint`                   | Run lint tasks                                         |
| `pnpm test`                   | Run repository tests through Turbo                     |
| `pnpm test:e2e:smoke`         | Run the smoke E2E suite                                |
| `pnpm format`                 | Format TypeScript, Markdown, JSON, styles, and Go code |
| `pnpm docs:diagnostics:check` | Check generated diagnostic documentation               |

## Documentation

The root README is only the repository entry point. Detailed documentation lives in dedicated locations:

| Location                             | Audience                                 | Purpose                                 |
| ------------------------------------ | ---------------------------------------- | --------------------------------------- |
| `apps/docs/`                         | Users and ecosystem contributors         | Standalone VitePress documentation site |
| `apps/docs/guide/getting-started.md` | New local developers                     | Detailed local setup guide              |
| `apps/docs/reference/pir-spec.md`    | PIR readers                              | Current PIR reference documentation     |
| `specs/decisions/`                   | Core maintainers                         | Architecture decision records           |
| `specs/pir/`                         | Runtime and codegen maintainers          | Versioned PIR contracts and schemas     |
| `specs/diagnostics/`                 | Editor, backend, and docs maintainers    | Diagnostic code definitions             |
| `specs/implementation/`              | Contributors working on planned features | Implementation plans and task backlogs  |

## Architecture Overview

At a high level, the editor writes user actions as commands, intents, or patches. Those changes update the normalized PIR graph. The graph is validated, persisted through workspace storage, and materialized into temporary structures only when a renderer or code generator needs a tree-shaped view.

```text
Editors / AI
    -> Command / Intent / Patch
    -> PIR ui.graph
    -> Schema and graph validation
    -> Workspace VFS / Backend / Git
    -> Renderer / Preview / Code Generator
```

The durable architectural records are maintained under `specs/decisions/`. The current PIR schema and contracts are maintained under `specs/pir/`.

## Development Notes

- `@prodivix/ui` styles are authored with SCSS.
- Application-level styling uses Tailwind CSS 4 conventions.
- Prefer package-local aliases such as `@/...` where they are configured.
- Avoid tests coupled to DOM hierarchy, internal classes, snapshots, or implementation details. Prefer user-visible behavior, public APIs, stable state results, and semantic outcomes.
- Use Git-indexed discovery commands such as `git ls-files`, `git diff --name-only`, and `git grep` when scanning repository files.

## Contributing

This project is evolving quickly. Before contributing a large change, read the relevant architecture decision or implementation plan in `specs/`, then keep the change scoped to the contract being implemented.

Useful starting points:

- `AGENTS.md` for repository development guidance
- `apps/docs/community/contributing.md` for contribution notes
- `specs/decisions/README.md` for architecture decision navigation

## License

Prodivix is released under the [MIT License](LICENSE).
