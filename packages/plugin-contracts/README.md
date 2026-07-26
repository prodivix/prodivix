# @prodivix/plugin-contracts

JSON-only contracts and validation for Prodivix plugins. This package has no React, DOM, editor, or application dependency.

## Source Of Truth

The manually maintained contract schemas live in `specs/plugins/`: Plugin Manifest, Palette, External Library, Codegen Policy, and Icon Provider v1, plus Render Policy v1/v2. Render Policy v1 remains an immutable historical wire schema; v2 is the current exact Host contract. Generated TypeScript types and runtime Schema modules are committed so consumers do not need a code generator at runtime.

`scripts/contractCatalog.mjs` is the single catalog used by type/runtime-Schema generation and build-time JSON Schema copying. Add each new versioned contract there once instead of maintaining divergent script lists.

```bash
pnpm --filter @prodivix/plugin-contracts generate
pnpm --filter @prodivix/plugin-contracts check:generated
```

## Public API

- `parsePluginManifest` parses size-limited, BOM-free UTF-8 strict JSON and preserves the exact source bytes.
- `validatePluginManifest` applies the recursive JSON value guard, JSON Schema, and cross-field semantic rules.
- `parseAndValidatePluginManifest` combines both stages for installation and discovery flows.
- `PLUGIN_DIAGNOSTIC_CODES` exposes stable `PLG-xxxx` codes.
- `PLUGIN_MANIFEST_V1_SCHEMA` exposes the runtime Schema object.
- `BUILT_IN_CONTRIBUTION_POINTS` exposes the current authoring catalog; well-formed future point ids remain parseable and are accepted only when the Host registers an exact point/version contract.
- `validatePaletteContribution` validates the Blueprint component Palette v1 descriptor and its stable identity semantics.
- `validateExternalLibraryContribution`, `validateRenderPolicyContribution`, `validateCodegenPolicyContribution`, and `validateIconProviderContribution` validate the current exact official component plugin contracts.
- `validateRenderPolicyContribution` validates v2 and decodes it into the version-free `RenderPolicyContribution` current model; `validateRenderPolicyContributionV1` is available only for explicit historical-wire tooling.
- `PALETTE_CONTRIBUTION_V1_SCHEMA` exposes the Palette runtime Schema object.
- Each Phase 4.5 contract exports its generated runtime Schema object and original `.json` package subpath.
- `@prodivix/plugin-contracts/schema/plugin-manifest-v1.json` exports the original JSON Schema from the built package.
- `@prodivix/plugin-contracts/schema/palette-contribution-v1.json` exports the original Palette JSON Schema.
- `@prodivix/plugin-contracts/schema/render-policy-contribution-v2.json` exports the current Render Policy JSON Schema.

Command activation references are checked only when the host supplies `knownCommandIds`. Global command identity belongs to the host command catalog and is never inferred from a contribution local id.
