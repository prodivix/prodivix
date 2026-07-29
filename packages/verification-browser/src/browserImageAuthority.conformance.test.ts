import { describe, expect, it } from 'vitest';
import {
  assertPlaywrightBrowserImageAuthorityReceipt,
  createPlaywrightBrowserImageAuthorityReceipt,
  type PlaywrightBrowserImageAuthorityReceipt,
} from './browserImageAuthority';

const digest = (hexDigit: string): string => `sha256-${hexDigit.repeat(64)}`;

describe('Playwright browser image authority receipt', () => {
  it('recomputes the image digest from the exact bounded receipt fields', () => {
    const receipt = createPlaywrightBrowserImageAuthorityReceipt({
      engine: 'chromium',
      executableRelativePath: 'chrome-linux64/chrome',
      executableContentDigest: digest('1'),
      fileSetDigest: digest('2'),
      fileCount: 303,
      totalByteLength: 396_335_288,
    });

    expect(
      assertPlaywrightBrowserImageAuthorityReceipt(receipt, receipt.imageDigest)
    ).toEqual(receipt);
    expect(JSON.stringify(receipt)).not.toMatch(
      /(?:[A-Za-z]:\\|\/home\/|\/Users\/|chromium-[0-9]+)/u
    );
  });

  it('rejects a handwritten digest, field drift, and unbounded host paths', () => {
    const receipt = createPlaywrightBrowserImageAuthorityReceipt({
      engine: 'webkit',
      executableRelativePath: 'pw_run.sh',
      executableContentDigest: digest('3'),
      fileSetDigest: digest('4'),
      fileCount: 54,
      totalByteLength: 303_750_926,
    });

    expect(() =>
      assertPlaywrightBrowserImageAuthorityReceipt(
        {
          ...receipt,
          fileSetDigest: digest('5'),
        },
        receipt.imageDigest
      )
    ).toThrow(/authority mismatch/u);
    expect(() =>
      assertPlaywrightBrowserImageAuthorityReceipt(
        {
          ...receipt,
          imageDigest: digest('6'),
        },
        digest('6')
      )
    ).toThrow(/authority mismatch/u);
    expect(() =>
      assertPlaywrightBrowserImageAuthorityReceipt({
        ...receipt,
        executableRelativePath: 'C:/browsers/Playwright.exe',
      })
    ).toThrow(/normalized and relative/u);
    expect(() =>
      assertPlaywrightBrowserImageAuthorityReceipt({
        ...receipt,
        absoluteHostPath: 'C:\\browsers',
      } as PlaywrightBrowserImageAuthorityReceipt)
    ).toThrow(/fields are invalid/u);
  });
});
