# `@prodivix/plugin-radix`

Bundled official Radix UI plugin for Prodivix Blueprint and React Vite export.

The package entrypoint exports `RADIX_OFFICIAL_PLUGIN`, which binds the
deterministic artifact, generated catalog, and build-attested React Host loader
from one definition.

The package owns the exact Radix dependency set, ten Palette recipes, 37 real
primitive runtime types, compound Blueprint templates, composition rules,
canvas-safe portal wrappers, and namespace-based React codegen policies. It
does not provide a Radix icon provider because Radix UI does not publish an
official icon runtime as part of this primitive package set.

## Commands

```bash
pnpm --filter @prodivix/plugin-radix generate
pnpm --filter @prodivix/plugin-radix check:generated
pnpm --filter @prodivix/plugin-radix test
pnpm --filter @prodivix/plugin-radix build
```

`plugin/support-matrix.json` is the package source of truth. The shared
artifact generator validates its package coordinates, contribution closure,
Palette/template recipes, Host implementation declarations, and generated
catalog before emitting deterministic artifact bytes.

Portal implementations never fall back to `document.body`. Canvas portals
only render when an `OfficialReactSurfaceHost` supplies an owner-scoped overlay
container, and their cleanup lease is released on React unmount or plugin
owner cleanup.
