import {
  observePlaywrightBrowserImageAuthority,
  type PlaywrightBrowserImageAuthorityReceipt,
} from '@prodivix/verification-browser';
import { chromium, firefox, webkit } from '@playwright/test';
import { describe, expect, it } from 'vitest';
import {
  createGoldenG3V6ControlledBrowserImageIdentities,
  type GoldenG3V6ControlledBrowserImageIdentity,
} from './goldenG3V6BrowserIdentityFixture';

const browserTypes = Object.freeze({
  chromium,
  firefox,
  webkit,
});

const observeLiveAuthority = async (
  expected: GoldenG3V6ControlledBrowserImageIdentity
): Promise<PlaywrightBrowserImageAuthorityReceipt> => {
  const receipt = await observePlaywrightBrowserImageAuthority({
    engine: expected.engine,
    executablePath: browserTypes[expected.engine].executablePath(),
  });
  console.info(`[g3-v6-browser-image-authority] ${JSON.stringify(receipt)}`);
  return receipt;
};

describe.runIf(
  process.env.PRODIVIX_VERIFY_G3_V6_BROWSER_IMAGE_AUTHORITY === '1'
)('Golden G3 V6 live browser image authority', () => {
  it('attests the installed Chromium, Firefox, and WebKit file sets before the matrix', async () => {
    const expectedIdentities =
      createGoldenG3V6ControlledBrowserImageIdentities();
    const receipts: PlaywrightBrowserImageAuthorityReceipt[] = [];
    for (const expected of expectedIdentities) {
      receipts.push(await observeLiveAuthority(expected));
    }
    expect(new Set(receipts.map(({ imageDigest }) => imageDigest)).size).toBe(
      3
    );
    expect(receipts).toEqual(
      expectedIdentities.map(({ authorityReceipt }) => authorityReceipt)
    );
  }, 60_000);
});
