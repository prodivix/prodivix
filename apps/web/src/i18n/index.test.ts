import { describe, expect, it } from 'vitest';
import { initI18n, loadAppNamespaces } from './index';

describe('app i18n namespace loading', () => {
  it('keeps route-specific resources out of the initial homepage load', async () => {
    const instance = await initI18n();

    for (const language of ['en', 'zh-CN']) {
      expect(instance.hasResourceBundle(language, 'home')).toBe(true);
      expect(instance.hasResourceBundle(language, 'routes')).toBe(true);
      expect(instance.hasResourceBundle(language, 'auth')).toBe(false);
      expect(instance.hasResourceBundle(language, 'editor')).toBe(false);
    }

    await loadAppNamespaces(instance, ['auth']);

    for (const language of ['en', 'zh-CN']) {
      expect(instance.hasResourceBundle(language, 'auth')).toBe(true);
      expect(instance.hasResourceBundle(language, 'editor')).toBe(false);
    }
  });
});
