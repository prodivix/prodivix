import { BUNDLED_PLUGIN_ARTIFACT } from '#antd/artifact.generated';
import { GENERATED_OFFICIAL_PLUGIN_CATALOG } from '#antd/catalog.generated';

export { BUNDLED_PLUGIN_ARTIFACT } from '#antd/artifact.generated';
export { GENERATED_OFFICIAL_PLUGIN_CATALOG } from '#antd/catalog.generated';

export const ANTD_OFFICIAL_PLUGIN = Object.freeze({
  artifact: BUNDLED_PLUGIN_ARTIFACT,
  catalog: GENERATED_OFFICIAL_PLUGIN_CATALOG,
  loadHostModule: async () =>
    (await import('#antd/hostModule')).ANTD_OFFICIAL_HOST_MODULE,
});
