import { BUNDLED_PLUGIN_ARTIFACT } from '#mui-plugin/artifact.generated';
import { GENERATED_OFFICIAL_PLUGIN_CATALOG } from '#mui-plugin/catalog.generated';

export { BUNDLED_PLUGIN_ARTIFACT } from '#mui-plugin/artifact.generated';
export { GENERATED_OFFICIAL_PLUGIN_CATALOG } from '#mui-plugin/catalog.generated';

export const MUI_OFFICIAL_PLUGIN = Object.freeze({
  artifact: BUNDLED_PLUGIN_ARTIFACT,
  catalog: GENERATED_OFFICIAL_PLUGIN_CATALOG,
  loadHostModule: async () =>
    (await import('#mui-plugin/hostModule')).MUI_OFFICIAL_HOST_MODULE,
});
