import { realpathSync } from 'node:fs';
import type { VerificationBrowserEngine } from '@prodivix/verification';
import { chromium, firefox, webkit, type Browser } from 'playwright-core';
import type {
  BrowserToolPool,
  BrowserToolPoolAcquireInput,
  BrowserToolSession,
} from '../browserVerificationPort';
import { assertPlaywrightBrowserImageAuthorityReceipt } from '../browserImageAuthority';
import { observePlaywrightBrowserImageAuthority } from './playwrightBrowserImageAuthority';
import { PlaywrightBrowserTool } from './playwrightBrowserSession';

type BrowserEntry = Readonly<{
  executablePath: string;
  browserImageDigest: string;
  browser: Promise<Browser>;
}>;

export const launchNetworkIsolatedBrowser = (
  input: BrowserToolPoolAcquireInput,
  executablePath: string
): Promise<Browser> => {
  const exactExecutablePath = realpathSync(executablePath);
  const proxy = Object.freeze({
    server: 'http://127.0.0.1:9',
    bypass: 'localhost,127.0.0.1,::1',
  });
  if (input.engine === 'chromium') {
    const customExecutablePath =
      exactExecutablePath === realpathSync(chromium.executablePath())
        ? undefined
        : exactExecutablePath;
    return chromium.launch({
      headless: input.launch.headless,
      ...(customExecutablePath ? { executablePath: customExecutablePath } : {}),
      proxy,
      args: [
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-domain-reliability',
        // Playwright owns the canonical --disable-features switch. Adding a
        // second value replaces its defaults instead of extending them.
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1, EXCLUDE ::1',
        '--webrtc-ip-handling-policy=disable_non_proxied_udp',
      ],
    });
  }
  if (input.engine === 'firefox') {
    const customExecutablePath =
      exactExecutablePath === realpathSync(firefox.executablePath())
        ? undefined
        : exactExecutablePath;
    return firefox.launch({
      headless: input.launch.headless,
      ...(customExecutablePath ? { executablePath: customExecutablePath } : {}),
      proxy,
      firefoxUserPrefs: {
        'media.peerconnection.enabled': false,
        'network.dns.disablePrefetch': true,
        'network.dns.disablePrefetchFromHTTPS': true,
        'network.http.speculative-parallel-limit': 0,
        'network.prefetch-next': false,
      },
    });
  }
  const customExecutablePath =
    exactExecutablePath === realpathSync(webkit.executablePath())
      ? undefined
      : exactExecutablePath;
  return webkit.launch({
    headless: input.launch.headless,
    ...(customExecutablePath ? { executablePath: customExecutablePath } : {}),
    proxy,
  });
};

const bundledExecutablePath = (engine: VerificationBrowserEngine): string => {
  if (engine === 'chromium') return chromium.executablePath();
  if (engine === 'firefox') return firefox.executablePath();
  return webkit.executablePath();
};

export class PlaywrightBrowserPool implements BrowserToolPool {
  readonly #browsers = new Map<VerificationBrowserEngine, BrowserEntry>();
  #disposed = false;

  async #browserFor(input: BrowserToolPoolAcquireInput): Promise<Browser> {
    if (this.#disposed) {
      throw new Error('Playwright browser pool is disposed.');
    }
    const executablePath = realpathSync(
      input.launch.executablePath ?? bundledExecutablePath(input.engine)
    );
    const existing = this.#browsers.get(input.engine);
    if (
      existing !== undefined &&
      (existing.executablePath !== executablePath ||
        existing.browserImageDigest !==
          input.runtimeIdentity.browserImageDigest)
    ) {
      throw new Error(
        'One Playwright engine cannot use multiple executable paths or image authorities in the same pool.'
      );
    }
    if (existing !== undefined) {
      const browser = await existing.browser;
      if (browser.isConnected()) return browser;
      if (this.#browsers.get(input.engine) === existing) {
        this.#browsers.delete(input.engine);
      }
      return this.#browserFor(input);
    }
    const entry: BrowserEntry = Object.freeze({
      executablePath,
      browserImageDigest: input.runtimeIdentity.browserImageDigest,
      browser: (async () => {
        const authority = await observePlaywrightBrowserImageAuthority({
          engine: input.engine,
          executablePath,
        });
        assertPlaywrightBrowserImageAuthorityReceipt(
          authority,
          input.runtimeIdentity.browserImageDigest
        );
        return launchNetworkIsolatedBrowser(input, executablePath);
      })(),
    });
    this.#browsers.set(input.engine, entry);
    try {
      const browser = await entry.browser;
      if (this.#disposed) {
        await browser.close();
        throw new Error('Playwright browser pool was disposed during launch.');
      }
      return browser;
    } catch (error) {
      if (this.#browsers.get(input.engine) === entry) {
        this.#browsers.delete(input.engine);
      }
      throw error;
    }
  }

  async acquire(
    input: BrowserToolPoolAcquireInput
  ): Promise<BrowserToolSession> {
    const browser = await this.#browserFor(input);
    return PlaywrightBrowserTool.create(browser, input);
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    const entries = [...this.#browsers.values()];
    this.#browsers.clear();
    await Promise.all(
      entries.map(async ({ browser }) => {
        const instance = await browser.catch(() => undefined);
        if (instance?.isConnected()) await instance.close();
      })
    );
  }
}

export const createPlaywrightBrowserToolPool = (): BrowserToolPool =>
  new PlaywrightBrowserPool();
