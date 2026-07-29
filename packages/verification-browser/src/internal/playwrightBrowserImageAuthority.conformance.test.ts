import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { BrowserToolPoolAcquireInput } from '../browserVerificationPort';
import { assertPlaywrightBrowserImageAuthorityReceipt } from '../browserImageAuthority';
import { observePlaywrightBrowserImageAuthority } from './playwrightBrowserImageAuthority';
import { PlaywrightBrowserPool } from './playwrightBrowserPool';

const cleanupRoots: string[] = [];

const createFakeChromiumImage = async (): Promise<{
  rootPath: string;
  executablePath: string;
  resourcePath: string;
}> => {
  const parentPath = await mkdtemp(join(tmpdir(), 'prodivix-browser-image-'));
  cleanupRoots.push(parentPath);
  const rootPath = join(parentPath, 'chromium-999');
  const executablePath = join(rootPath, 'chrome-fake', 'chrome.exe');
  const resourcePath = join(
    rootPath,
    'chrome-fake',
    'resources',
    'catalog.bin'
  );
  await mkdir(join(rootPath, 'chrome-fake', 'resources'), {
    recursive: true,
  });
  await writeFile(executablePath, 'same-version-browser-binary', 'utf8');
  await writeFile(resourcePath, 'controlled-resource-v1', 'utf8');
  await writeFile(join(rootPath, 'INSTALLATION_COMPLETE'), '', 'utf8');
  await writeFile(join(rootPath, 'DEPENDENCIES_VALIDATED'), '', 'utf8');
  return { rootPath, executablePath, resourcePath };
};

afterEach(async () => {
  const roots = cleanupRoots.splice(0);
  await Promise.all(
    roots.map((rootPath) =>
      rm(rootPath, {
        recursive: true,
        force: true,
      })
    )
  );
});

describe('Playwright browser image authority', () => {
  it('binds the executable and stable related file set, not install markers or version metadata', async () => {
    const image = await createFakeChromiumImage();
    const initial = await observePlaywrightBrowserImageAuthority({
      engine: 'chromium',
      executablePath: image.executablePath,
    });
    expect(initial.executableRelativePath).toBe('chrome-fake/chrome.exe');
    expect(JSON.stringify(initial)).not.toContain(image.rootPath);

    await writeFile(
      join(image.rootPath, 'INSTALLATION_COMPLETE'),
      'local installer state',
      'utf8'
    );
    const markerMutation = await observePlaywrightBrowserImageAuthority({
      engine: 'chromium',
      executablePath: image.executablePath,
    });
    expect(markerMutation).toEqual(initial);

    await writeFile(image.resourcePath, 'controlled-resource-v2', 'utf8');
    const resourceMutation = await observePlaywrightBrowserImageAuthority({
      engine: 'chromium',
      executablePath: image.executablePath,
    });
    expect(resourceMutation.executableContentDigest).toBe(
      initial.executableContentDigest
    );
    expect(resourceMutation.fileSetDigest).not.toBe(initial.fileSetDigest);
    expect(resourceMutation.imageDigest).not.toBe(initial.imageDigest);
    expect(() =>
      assertPlaywrightBrowserImageAuthorityReceipt(
        resourceMutation,
        initial.imageDigest
      )
    ).toThrow(/browser image authority mismatch/u);

    await writeFile(
      image.executablePath,
      'same-version-replaced-binary',
      'utf8'
    );
    const executableMutation = await observePlaywrightBrowserImageAuthority({
      engine: 'chromium',
      executablePath: image.executablePath,
    });
    expect(executableMutation.executableContentDigest).not.toBe(
      resourceMutation.executableContentDigest
    );
    expect(executableMutation.imageDigest).not.toBe(
      resourceMutation.imageDigest
    );
  });

  it('rejects a same-version replacement before attempting to launch it', async () => {
    const image = await createFakeChromiumImage();
    const adopted = await observePlaywrightBrowserImageAuthority({
      engine: 'chromium',
      executablePath: image.executablePath,
    });
    await writeFile(
      image.executablePath,
      'same-version-replaced-binary',
      'utf8'
    );
    const pool = new PlaywrightBrowserPool();
    const acquireInput = {
      engine: 'chromium',
      runtimeIdentity: {
        browserImageDigest: adopted.imageDigest,
      },
      launch: {
        headless: true,
        executablePath: image.executablePath,
      },
    } as unknown as BrowserToolPoolAcquireInput;
    try {
      await expect(pool.acquire(acquireInput)).rejects.toThrow(
        /browser image authority mismatch/u
      );
    } finally {
      await pool.dispose();
    }
  });
});
