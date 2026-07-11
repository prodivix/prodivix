import { BUNDLED_PLUGIN_ARTIFACT } from '#radix/artifact.generated';
import { GENERATED_OFFICIAL_PLUGIN_CATALOG } from '#radix/catalog.generated';

export { BUNDLED_PLUGIN_ARTIFACT } from '#radix/artifact.generated';
export { GENERATED_OFFICIAL_PLUGIN_CATALOG } from '#radix/catalog.generated';

export const RADIX_OFFICIAL_PLUGIN = Object.freeze({
  artifact: BUNDLED_PLUGIN_ARTIFACT,
  catalog: GENERATED_OFFICIAL_PLUGIN_CATALOG,
  loadHostModule: async () =>
    (await import('#radix/hostModule')).RADIX_OFFICIAL_HOST_MODULE,
});
