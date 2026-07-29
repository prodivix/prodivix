import { describe, expect, it } from 'vitest';
import { readInstalledVitestVersion } from './vitestExecutionIdentity';

describe('Vitest execution identity', () => {
  it('reads one exact provider-installed version', () => {
    expect(
      readInstalledVitestVersion(
        new TextEncoder().encode(
          JSON.stringify({ name: 'vitest', version: '4.1.9' })
        )
      )
    ).toBe('4.1.9');
  });

  it.each([
    [{ name: 'vitest', version: '^4.1.9' }],
    [{ name: 'other-tool', version: '4.1.9' }],
    [{ name: 'vitest' }],
  ])('rejects a non-exact installed identity: %j', (manifest) => {
    expect(() => readInstalledVitestVersion(JSON.stringify(manifest))).toThrow(
      /exact Vitest version/u
    );
  });
});
