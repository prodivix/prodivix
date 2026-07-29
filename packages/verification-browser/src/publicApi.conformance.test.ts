import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('@prodivix/verification-browser public declarations', () => {
  const declaration = readFileSync(
    fileURLToPath(new URL('../dist/index.d.ts', import.meta.url)),
    'utf8'
  );

  it('exports the bounded first-party factory and canonical owner contracts', () => {
    expect(declaration).toContain(
      'createFirstPartyBrowserVerificationAdapterFactory'
    );
    expect(declaration).toContain('BrowserVerificationTargetLeasePort');
    expect(declaration).toContain('BrowserSecurityObservationAuthorityPort');
    expect(declaration).toContain('createBrowserScenarioProgramInputRef');
    expect(declaration).toContain('createBrowserBaselineSetInputRef');
    expect(declaration).toContain('decodeRgbaPng');
  });

  it('does not expose Playwright handles, filesystem launch paths, or private payload seams', () => {
    for (const forbidden of [
      'playwright-core',
      'BrowserTool',
      'PlaywrightBrowserPool',
      'PlaywrightBrowserTool',
      'Locator',
      'executablePath',
      'createFirstPartyBrowserVerificationAdapterFactoryInternal',
      'BrowserPrivatePayload',
      'PreparedBrowserVerificationArtifact',
      'decodeAxeAccessibilityPayload',
      'decodeBrowserOwnedSecurityPayload',
      'decodeBrowserSecurityPayload',
      'decodeKeyboardFocusPayload',
      'decodePerformancePayload',
      'createBrowserProductionProbeObservation',
      'projectBrowserVerificationAttempt',
      'Promise<unknown>',
    ]) {
      expect(declaration).not.toContain(forbidden);
    }
  });
});
