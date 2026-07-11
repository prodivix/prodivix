# `@prodivix/plugin-mui`

Official bundled Material UI integration for Prodivix Blueprint.

The package publishes one deterministic plugin artifact containing six static
contributions: external-library metadata, an 18-item Palette, the Accordion
Blueprint template, render and React codegen policies, and the Material Icons
provider. `AccordionSummary` and `AccordionDetails` are runtime-only template
components and do not add Palette entries.

The privileged React Host Module statically binds Material UI 7.3.2 to the
official Host ABI. Theme, Emotion style insertion, Dialog/Snackbar overlays,
and cleanup stay scoped to the current Prodivix surface.

Run `pnpm generate` after changing package JSON resources, then
`pnpm check:generated` to verify artifact, catalog, descriptor, support-matrix,
and implementation-reference closure.
