# CLAUDE.md

This file provides Claude Code-specific guidance for working in this repository.

**Primary rule source:** read `AGENTS.md` first. It contains the cross-agent project architecture, Workspace VFS write/read model, and coding rules. This file should stay complementary: Claude-specific workflow notes, command shortcuts, and implementation map only.

## Claude Operating Rules

1. Follow `AGENTS.md` for architecture and coding policy.
2. At the start of a new coding session, run `git fetch` and check whether the current branch is behind its remote before editing. Integrate remote changes non-destructively if needed.
3. Use UTF-8 for reading and writing documentation.
4. Prefer `git ls-files`, `git diff --name-only`, and `git grep` for repository discovery. Avoid broad recursive scans that enter `node_modules`.
5. Do not commit or push unless explicitly asked. When asked without a branch strategy, sync and push `main` directly; do not create a feature branch or pull request unless the user requests one.
6. If dependency installation or updates modify `pnpm-lock.yaml`, accept the package-manager-generated lockfile changes instead of manually editing the lockfile.
7. Do not force all documentation into English. Match the target audience and existing file context: root `README.md` is English, `README.zh-CN.md` is Simplified Chinese, and Chinese specs / decisions may remain Chinese.

## Project Summary

Prodivix is an industrial browser-side visual front-end development tool. The current product position is **G1 Passed / G2 Foundation**; G2 `ProductGateStatus` is **In Progress**. G1 established three visual editors, a shared **Code Authoring Environment**, and a cross-domain **Workspace Semantic Index**:

```text
Blueprint / NodeGraph / Animation
    -> Domain Command / Transaction
    -> Workspace VFS

code-owned slots / files
    -> Code Authoring Environment
    -> CodeArtifact / CodeReference / CodeSlot / Code Semantic Provider

Workspace / Route / PIR / Component / Collection / NodeGraph / Animation / Code / Token / Asset
    -> revision-bound Workspace Semantic Index
    -> WorkspaceSymbol / WorkspaceScope / Reference / Semantic Resolution
```

The durable data architecture centers on the **Canonical Workspace VFS** as the only authoring source of truth. PIR UI documents, NodeGraph documents, Animation documents, Code documents, Assets, Config, and RouteManifest remain separate domain-owned records inside that Workspace:

```text
Editors / AI / Plugins / Importers
    -> local Intent or Action Proposal planner
    -> reversible Domain Command / atomic Transaction
    -> Workspace + domain validation / local History
    -> Durable Operation or Settings Outbox
    -> strong-idempotent Atomic Commit
    -> Canonical Backend Workspace / confirmed local replica / Git projection
```

Planner intents become validated Commands or Transactions. Patch operations live inside reversible Commands, and production persistence begins at `WorkspaceOperation`. The current PIR UI write format is the normalized `ui.graph` model:

- `rootId`
- `nodesById`
- `childIdsById`
- `regionsById`

Editors and AI flows should not directly overwrite tree-shaped UI state. Tree views are temporary read models.

All G1 production consumers use the version-neutral `PIR-current` domain model and stable public names. Numeric PIR versions are confined to immutable wire schemas, generated wire contracts, codecs, migrations, transport, and persistence. A routine wire upgrade adds one immutable snapshot, advances the activation manifest, regenerates boundary artifacts, and adds a deterministic migration; Workspace, Renderer, Compiler, Semantic Index, and Web remain unchanged when domain semantics do not change.

## Workspace Semantic Index and Code Authoring Environment

- Code Authoring Environment is shared infrastructure for code-owned authoring; it is not a fourth peer business editor.
- Use it for event handlers, custom executors, animation functions, mounted CSS, shaders, external-library adapters, and ordinary Workspace code files.
- Visual editors should connect to code through explicit code slots and stable `CodeReference` / `CodeArtifact` ownership, not by storing arbitrary source strings in local UI state.
- Slot-managed code documents carry explicit lifecycle metadata. External-library config owns its `external-adapter` binding; removing the owner preserves the code document as an orphan with Issues/Resources actions for rebind, module conversion, or safe deletion.
- Code Resources exposes F2 language rename through a revision-bound Workspace Transaction plus Semantic Index owner-impact preview. Named cross-domain references fail closed until their owner can be rewritten atomically. CodeArtifact path moves use the current Workspace relocation planner and preserve stable identity, source, bindings, and semantic references.
- Workspace Semantic Index is a partitioned-revision/provider-set-bound, rebuildable read projection over the Canonical Workspace. It owns cross-domain `WorkspaceSymbol`, `WorkspaceScope`, reference, visibility, definition, impact, and semantic-resolution query semantics; it is never a second source of truth.
- Language services connect through Code Semantic Contribution and Language Capability Providers. Canonical Workspace owns code documents; Code Authoring Environment owns their authoring experience, `CodeArtifact` projection, `CodeReference`, code slots, and provider lifecycle, but not global identity or visibility policy for non-code domains.
- Globally addressable symbols are not globally visible. Scope, type, and capability still constrain resolution, completion, and binding. Persist typed domain references; do not replace them with one generic symbol JSON shape.
- When an editor, Inspector, Resources, or AI needs symbols, references, resolution, or impact, use Workspace Semantic Index queries. Do not scan another editor's internal store directly.
- Semantic Index only emits semantic resolution diagnostics. Global provider snapshot lifecycle, deduplication, presentation, and Issues queries remain owned by `@prodivix/diagnostics`.
- Check `specs/decisions/28.code-authoring-environment.md` for ownership and capability boundaries, then `specs/decisions/25.authoring-symbol-environment.md` for symbol and diagnostic contracts.

## Repository Map

- `apps/web` - React editor surfaces and browser composition/adapters for Blueprint, NodeGraph, Animation, Code, Issues, plugins, and Workspace recovery.
- `apps/backend` - Go backend: auth, project metadata/publication, canonical Workspace persistence, Atomic Commit, validation, and integrations.
- `apps/cli` - CLI tooling.
- `apps/docs` - standalone VitePress documentation site. Do not use it as the root README.
- `apps/vscode` - VS Code extension for PIR language/debugging support.
- `packages/ai` - AI provider abstractions and shared AI utilities.
- `packages/workspace` / `packages/workspace-sync` - canonical Workspace semantics, History, revision/conflict, Outbox, Atomic Commit planning, and local replica.
- `packages/pir` / `packages/pir-react-renderer` - PIR domain semantics and the React read projection.
- `packages/router` - RouteManifest codec, matching, and navigation semantics.
- `packages/nodegraph` / `packages/animation` - transport-neutral domain contracts, codecs, and deterministic execution/evaluation.
- `packages/runtime-core` / `packages/runtime-browser` - runtime ports/registries and browser-specific adapters.
- `packages/authoring` / `packages/code-language` / `packages/diagnostics` - Workspace Semantic Index contracts, revision-bound TS/JS/CSS/SCSS/GLSL/WGSL language capabilities, independent shader compile contracts/providers, artifact/slot foundations, and Issues contracts.
- `packages/tokens` - canonical DTCG Format/Resolver profiles and codecs, versionless current Token/Resolver models, resolution plans, and revision-bound semantic providers.
- `packages/golden-conformance` - Living Golden App, G0 non-browser conformance, and G1 Public Contract/controlled round-trip/standalone export/browser gates.
- `packages/shared` - genuinely cross-domain types and utilities; do not move domain ownership back here.
- `packages/ui` - shared UI package, styled with SCSS.
- `packages/themes` - Prodivix product-theme manifests and CSS-variable projection.
- `packages/prodivix-compiler` - domain compilation, ExportProgram, and production export planning.
- `specs` - architecture decisions, PIR contracts, diagnostic codes, RFCs, and implementation plans.

## Common Commands

### Development

```bash
pnpm dev:web
pnpm dev:backend
pnpm dev:backend:hot
pnpm dev:docs
pnpm dev:cli
pnpm dev:vscode
pnpm storybook:ui
```

### Build and Quality

```bash
pnpm build
pnpm build:web
pnpm build:backend
pnpm build:docs
pnpm lint
pnpm test
pnpm test:web
pnpm test:e2e:smoke
pnpm format
pnpm docs:diagnostics:check
pnpm verify:g0
pnpm verify:g1:standalone
pnpm verify:g1:browser
```

### Targeted Web Checks

For the Web test suite:

```bash
pnpm --filter @prodivix/web test
```

For type checking:

```bash
pnpm --filter @prodivix/web exec tsc -b --pretty false
```

## Frontend Conventions

- Use `@/...` imports inside packages where the alias is configured; avoid deep relative imports when a package-local alias exists.
- `@prodivix/ui` styles use SCSS.
- Other app-level styles use Tailwind CSS 4 conventions.
- Use Tailwind custom-property shorthand such as `text-(--text-primary)` and `bg-(--bg-raised)`, not `text-[var(--text-primary)]`.
- Keep the monochrome-ui design direction. UI and UX may reference Figma and Dify while staying consistent with the existing product surface.
- Add documentation comments only before core methods/components in important modules when they clarify call-chain logic.
- Split files that become too long.

## Testing Policy

Do not add coupled tests. Avoid assertions that depend on:

- DOM hierarchy
- internal class names
- exact tag structure
- `querySelector`
- `closest`
- `parentElement`
- snapshots
- implementation details

Prefer tests around user-visible behavior, public APIs, state outcomes, and stable semantics. If a brittle test blocks a focused change, deletion can be the right answer when the covered behavior is not stable or meaningful.

## Architecture Notes

### Web Editor Areas

- `apps/web/src/editor/features/blueprint` - Blueprint editor: canvas, component tree, sidebar, inspector, palette data, external libraries, layout patterns.
- `apps/web/src/editor/features/development` - Node Graph editor.
- `apps/web/src/editor/features/animation` - Animation editor.
- `apps/web/src/editor/features/issues` - revision-aware Issues composition, providers, navigation, and Quick Fix wiring.
- `apps/web/src/editor/workspaceSync` - browser IndexedDB adapters, outbox executors, local replica adoption, and recovery effects.
- `apps/web/src/editor/store` - editor and supporting Zustand stores.
- `apps/web/src/pir` - Web-only PIR actions and AST/conversion adapters; PIR domain semantics live in `@prodivix/pir`, rendering in `@prodivix/pir-react-renderer`.
- Authoring contracts live in `@prodivix/authoring`; TS/JS/CSS/SCSS/GLSL/WGSL language engines and target-neutral shader compile providers live in `@prodivix/code-language`; Web composes their registries and owns only browser WebGL2/WebGPU backends, not private semantic or language-service state.

### Backend Areas

- `apps/backend/internal/modules/auth` - auth and session behavior.
- `apps/backend/internal/modules/project` - project metadata and explicit publication projection; never an authoring PIR mirror.
- `apps/backend/internal/modules/workspace` - canonical Workspace snapshots, Atomic Operation/Settings Commit, routes, validation, and atomic project/workspace import.
- `apps/backend/internal/modules/integrations` - third-party integrations such as GitHub App work.

### Specs to Check First

- `specs/roadmap/global-phases.md` for the only global product phase and gate definitions.
- `specs/roadmap/g0-closure-evidence.md` for the verified G0 boundary and reproduction command.
- `specs/roadmap/g1-closure-evidence.md` for the verified G1 boundary and reproduction commands.
- `specs/pir/PIR-current.json` and `specs/decisions/39.pir-current-evolution.md` for the active PIR wire contract and evolution boundary.
- `specs/decisions/README.md` for architecture decision navigation.
- `specs/decisions/37.verified-semantic-authoring-architecture.md` for the current seven-plane architecture and G1 closure.
- `specs/decisions/28.code-authoring-environment.md` for code-owned ownership, code slots, library capability levels, and shared authoring boundaries.
- `specs/decisions/25.authoring-symbol-environment.md` for Workspace Semantic Index, symbols, scopes, references, visibility, and diagnostic contracts.
- `specs/decisions/38.blueprint-component-instance-and-collection.md` for Component Definition/Instance, atomic extraction, and Collection semantics.
- `specs/implementation/g1-semantic-component-collection.md` for the completed G1 implementation sequence.
- `specs/diagnostics/README.md` for diagnostic namespaces and code definitions.

## Documentation Boundaries

- Root `README.md` is the repository entry point.
- `README.zh-CN.md` is the Simplified Chinese version of the root README.
- `apps/docs` is the standalone documentation site.
- `apps/docs/README.md` explains how to work on the docs site itself.
- `specs/` is for durable engineering contracts, ADRs, RFCs, and implementation plans.

When editing documentation, avoid duplicating the same authoritative content in multiple places. Link to the owner document instead.
