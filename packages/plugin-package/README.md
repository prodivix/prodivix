# `@prodivix/plugin-package`

Deterministic, framework-neutral bundled plugin artifacts for Prodivix.

The package canonicalizes JSON resources, computes the framed package digest,
verifies generated artifacts, exposes immutable `PluginPackageSource` readers,
and plans bundled catalog reconciliation. It does not load framework code or
own Plugin Host lifecycle state.
