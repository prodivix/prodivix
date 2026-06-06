# CLAUDE.md

This file provides Claude Code-specific guidance for working in this repository.

**Primary rule source:** read `AGENTS.md` first. It contains the cross-agent project architecture, PIR write/read model, and coding rules. This file should stay complementary: Claude-specific workflow notes, command shortcuts, and implementation map only.

## Claude Operating Rules

1. Follow `AGENTS.md` for architecture and coding policy.
2. At the start of a new coding session, run `git fetch` and check whether the current branch is behind its remote before editing. Integrate remote changes non-destructively if needed.
3. Before writing code, load relevant Trellis project guidance:

   ```bash
   python ./.trellis/scripts/get_context.py --mode packages
   ```

   Then read the relevant `.trellis/spec/<package>/<layer>/index.md` files and `.trellis/spec/guides/index.md`.

4. Use UTF-8 for reading and writing documentation.
5. Prefer `git ls-files`, `git diff --name-only`, and `git grep` for repository discovery. Avoid broad recursive scans that enter `node_modules`.
6. Do not commit or push unless explicitly asked.
7. If dependency installation or updates modify `pnpm-lock.yaml`, accept the package-manager-generated lockfile changes instead of manually editing the lockfile.
8. Do not force all documentation into English. Match the target audience and existing file context: root `README.md` is English, `README.zh-CN.md` is Simplified Chinese, and Chinese specs / decisions may remain Chinese.

## Project Summary

Prodivix is an industrial browser-side visual front-end development tool. The product shape is three visual editors plus a shared **Code Authoring Environment**:

```text
Blueprint / NodeGraph / Animation / Inspector / Resources / AI / Issues
    -> Code Authoring Environment
    -> Workspace VFS
    -> CodeArtifact / CodeSymbol / CodeScope / Diagnostics
```

The durable data architecture centers on **PIR** as the validated source of truth:

```text
Editors / AI
    -> Command / Intent / Patch
    -> PIR ui.graph
    -> Schema + graph semantic validation
    -> Workspace VFS / Backend / Git
    -> materializeUiTree when Renderer or Code Generator needs a tree view
```

The current PIR write format is the normalized `ui.graph` model:

- `rootId`
- `nodesById`
- `childIdsById`
- `regionsById`

Editors and AI flows should not directly overwrite tree-shaped UI state. Tree views are temporary read models.

## Code Authoring Environment

- Code Authoring Environment is shared infrastructure for code-owned authoring; it is not a fourth peer business editor.
- Use it for event handlers, custom executors, animation functions, mounted CSS, shaders, external-library adapters, and ordinary Workspace code files.
- Visual editors should connect to code through explicit code slots and stable `CodeReference` / `CodeArtifact` ownership, not by storing arbitrary source strings in local UI state.
- Authoring Symbol Environment is the shared index/query layer inside Code Authoring Environment. It owns `CodeArtifact`, `CodeSymbol`, `CodeScope`, `DiagnosticTargetRef`, `SourceSpan`, reference, completion, and diagnostic semantics.
- When Blueprint, NodeGraph, Animation, Inspector, Resources, AI, or Issues need symbols or diagnostics, use the Code Authoring Environment or stable authoring queries. Do not scan another editor's internal store directly.
- Check `specs/decisions/28.code-authoring-environment.md` for ownership and capability boundaries, then `specs/decisions/25.authoring-symbol-environment.md` for symbol and diagnostic contracts.

## Repository Map

- `apps/web` - primary browser editor: Blueprint, Node Graph, Animation, Code Authoring Environment, Inspector, PIR runtime, external library runtime.
- `apps/backend` - Go backend: auth, projects, Workspace VFS, sync, backend PIR validation, integrations.
- `apps/cli` - CLI tooling.
- `apps/docs` - standalone VitePress documentation site. Do not use it as the root README.
- `apps/vscode` - VS Code extension for PIR language/debugging support.
- `packages/ai` - AI provider abstractions and shared AI utilities.
- `packages/shared` - shared types, schemas, and validation utilities.
- `packages/ui` - shared UI package, styled with SCSS.
- `packages/themes` - theme manifests and semantic design tokens.
- `packages/pir-compiler` - PIR code generation package.
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
```

### Targeted Web Checks

If the local `pnpm --filter @prodivix/web test` shim fails because `apps/web/node_modules/vitest/vitest.mjs` is missing, use the workspace Vitest entrypoint from `apps/web`:

```bash
node ..\..\node_modules\vitest\vitest.mjs --config vitest.config.ts --run --maxWorkers=1
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

- `apps/web/src/editor/features/design` - Blueprint editor, palette, tree, canvas, inspector, resources, external libraries.
- `apps/web/src/editor/features/development` - Node Graph editor.
- `apps/web/src/editor/features/animation` - Animation editor.
- `apps/web/src/editor/store` - editor and supporting Zustand stores.
- `apps/web/src/pir` - PIR schema, validation, rendering, and generation.
- `apps/web/src/authoring` - stable Authoring Symbol Environment primitives and provider registries used by Code Authoring Environment.

### Backend Areas

- `apps/backend/internal/modules/auth` - auth and session behavior.
- `apps/backend/internal/modules/project` - project metadata.
- `apps/backend/internal/modules/workspace` - Workspace VFS, routes, intents, patches, PIR validation.
- `apps/backend/internal/modules/integrations` - third-party integrations such as GitHub App work.

### Specs to Check First

- `specs/pir/pir-contract-v1.3.md` for current PIR graph contract.
- `specs/decisions/README.md` for architecture decision navigation.
- `specs/decisions/28.code-authoring-environment.md` for code-owned ownership, code slots, library capability levels, and shared authoring boundaries.
- `specs/decisions/25.authoring-symbol-environment.md` for authoring symbols, scopes, references, and diagnostic contracts.
- `specs/implementation/authoring-symbol-environment-phase1.md` for Phase 1 authoring contracts.
- `specs/diagnostics/README.md` for diagnostic namespaces and code definitions.

## Documentation Boundaries

- Root `README.md` is the repository entry point.
- `README.zh-CN.md` is the Simplified Chinese version of the root README.
- `apps/docs` is the standalone documentation site.
- `apps/docs/README.md` explains how to work on the docs site itself.
- `specs/` is for durable engineering contracts, ADRs, RFCs, and implementation plans.

When editing documentation, avoid duplicating the same authoritative content in multiple places. Link to the owner document instead.
