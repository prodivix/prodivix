import { expect, test, type Page } from '@playwright/test';

type ConformanceSnapshot = Readonly<{
  phase: 'ready' | 'disabled' | 'shutdown';
  workspaceId: string;
  catalogIds: readonly string[];
  pluginSnapshotCount: number;
  plugins: readonly Readonly<{
    pluginId: string;
    installationId: string;
    generation: number;
    availability: string;
  }>[];
  contributionCount: number;
  implementationCount: number;
  surfaceLeaseCount: number;
  surfaceLeases: readonly Readonly<{
    pluginId: string;
    installationId: string;
    generation: number;
    leaseCount: number;
  }>[];
  paletteItemCount: number;
  templateCount: number;
  rendererComponentCount: number;
}>;

declare global {
  interface Window {
    prodivixOfficialComponentPluginConformance: {
      ready(): Promise<ConformanceSnapshot>;
      snapshot(): Promise<ConformanceSnapshot>;
      disableAll(): Promise<ConformanceSnapshot>;
      reinstallAll(): Promise<ConformanceSnapshot>;
      shutdown(): Promise<ConformanceSnapshot>;
    };
  }
}

const expectedPluginIds = [
  '@prodivix/plugin-antd',
  '@prodivix/plugin-mui',
  '@prodivix/plugin-radix',
] as const;

const openHarness = async (page: Page) => {
  await page.goto('/official-component-plugin-conformance.html');
  await page.waitForFunction(() =>
    Boolean(window.prodivixOfficialComponentPluginConformance)
  );
  const snapshot = await page.evaluate(() =>
    window.prodivixOfficialComponentPluginConformance.ready()
  );
  expect(snapshot.phase).toBe('ready');
  expect(snapshot.workspaceId).toBe('official-component-plugin-conformance');
  expect(snapshot.catalogIds).toEqual(['antd', 'mui', 'radix']);
  await expect(page.getByRole('status')).toHaveText('Ready');
  return snapshot;
};

const expectLifecycleCleanup = (snapshot: ConformanceSnapshot) => {
  expect(snapshot.contributionCount).toBe(0);
  expect(snapshot.implementationCount).toBe(0);
  expect(snapshot.surfaceLeaseCount).toBe(0);
  expect(snapshot.paletteItemCount).toBe(0);
  expect(snapshot.templateCount).toBe(0);
  expect(snapshot.rendererComponentCount).toBe(0);
};

const pluginGenerations = (snapshot: ConformanceSnapshot) =>
  new Map(
    snapshot.plugins.map((plugin) => [plugin.pluginId, plugin.generation])
  );

const readSurfacePluginIds = async (page: Page) =>
  page.evaluate(async () => {
    const snapshot =
      await window.prodivixOfficialComponentPluginConformance.snapshot();
    return snapshot.surfaceLeases.map((lease) => lease.pluginId).sort();
  });

const readSurfaceLeaseCount = async (page: Page) =>
  page.evaluate(async () => {
    const snapshot =
      await window.prodivixOfficialComponentPluginConformance.snapshot();
    return snapshot.surfaceLeaseCount;
  });

test.describe('official component plugin browser conformance @smoke', () => {
  test('renders all three libraries and preserves Radix keyboard behavior', async ({
    page,
  }) => {
    const snapshot = await openHarness(page);
    expect(snapshot.contributionCount).toBeGreaterThan(0);
    expect(snapshot.implementationCount).toBeGreaterThan(0);
    expect(snapshot.paletteItemCount).toBe(109);
    expect(snapshot.templateCount).toBe(9);
    expect(snapshot.rendererComponentCount).toBe(138);
    await expect.poll(() => readSurfaceLeaseCount(page)).toBeGreaterThan(0);
    const mountedSurfaceLeaseCount = await readSurfaceLeaseCount(page);

    await expect(
      page.getByRole('button', { name: 'Ant Design action' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Material UI action' })
    ).toBeVisible();

    const accordionTrigger = page.getByRole('button', {
      name: 'Accordion item',
    });
    const accordionContent = page.getByText('Accordion content', {
      exact: true,
    });
    await expect(accordionTrigger).toHaveAttribute('aria-expanded', 'true');
    await expect(accordionContent).toBeVisible();
    await accordionTrigger.press('Enter');
    await expect(accordionTrigger).toHaveAttribute('aria-expanded', 'false');
    await expect(accordionContent).toBeHidden();
    await accordionTrigger.press('Space');
    await expect(accordionTrigger).toHaveAttribute('aria-expanded', 'true');
    await expect(accordionContent).toBeVisible();

    const firstTab = page.getByRole('tab', { name: 'First' });
    const secondTab = page.getByRole('tab', { name: 'Second' });
    await expect(firstTab).toHaveAttribute('aria-selected', 'true');
    await firstTab.focus();
    await page.keyboard.press('ArrowRight');
    await expect(secondTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).toHaveText('Second tab content');

    const dialogTrigger = page.getByRole('button', { name: 'Open dialog' });
    await dialogTrigger.click();
    await expect(
      page.getByRole('dialog', { name: 'Dialog title' })
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('dialog', { name: 'Dialog title' })
    ).toBeHidden();
    await expect(dialogTrigger).toBeFocused();
    await expect
      .poll(() => readSurfaceLeaseCount(page))
      .toBe(mountedSurfaceLeaseCount);
    await dialogTrigger.click();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Dialog title' })
    ).toBeHidden();
    await expect(dialogTrigger).toBeFocused();
    await expect
      .poll(() => readSurfaceLeaseCount(page))
      .toBe(mountedSurfaceLeaseCount);

    const tooltipTrigger = page.getByRole('button', {
      name: 'Hover for help',
    });
    await page.keyboard.press('Tab');
    await expect(tooltipTrigger).toBeFocused();
    await expect(page.getByRole('tooltip')).toBeVisible();
    await expect(page.getByRole('tooltip')).toHaveText('Helpful information');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toBeHidden();
    await expect(tooltipTrigger).toBeFocused();
    await expect
      .poll(() => readSurfaceLeaseCount(page))
      .toBe(mountedSurfaceLeaseCount);
  });

  test('disable cleans owned surfaces and all three libraries reinstall into fresh generations', async ({
    page,
  }) => {
    const initial = await openHarness(page);
    const initialGenerations = pluginGenerations(initial);
    expect(initial.plugins.map((plugin) => plugin.pluginId).sort()).toEqual(
      expectedPluginIds
    );
    await expect
      .poll(() => readSurfacePluginIds(page))
      .toEqual(expectedPluginIds);

    await page.getByRole('button', { name: 'Open dialog' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Dialog title' })
    ).toBeVisible();
    await expect
      .poll(async () =>
        page.evaluate(
          async () =>
            (await window.prodivixOfficialComponentPluginConformance.snapshot())
              .surfaceLeaseCount
        )
      )
      .toBeGreaterThan(0);

    const cleanup = await page.evaluate(() =>
      window.prodivixOfficialComponentPluginConformance.disableAll()
    );
    expect(cleanup.phase).toBe('disabled');
    expect(cleanup.pluginSnapshotCount).toBe(3);
    expect(
      cleanup.plugins.every((plugin) => plugin.availability === 'disabled')
    ).toBe(true);
    expectLifecycleCleanup(cleanup);
    await expect(page.getByRole('status')).toHaveText('Disabled');
    await expect(
      page.getByRole('dialog', { name: 'Dialog title' })
    ).toBeHidden();
    await expect(
      page.getByRole('button', { name: 'Ant Design action' })
    ).toBeHidden();
    await expect(
      page.getByRole('button', { name: 'Material UI action' })
    ).toBeHidden();

    const reinstalled = await page.evaluate(() =>
      window.prodivixOfficialComponentPluginConformance.reinstallAll()
    );
    const reinstalledGenerations = pluginGenerations(reinstalled);
    expect(reinstalled.phase).toBe('ready');
    expect(reinstalled.pluginSnapshotCount).toBe(3);
    expect(reinstalled.contributionCount).toBeGreaterThan(0);
    expect(reinstalled.implementationCount).toBeGreaterThan(0);
    expect(reinstalled.paletteItemCount).toBe(109);
    expect(reinstalled.templateCount).toBe(9);
    expect(reinstalled.rendererComponentCount).toBe(138);
    for (const pluginId of expectedPluginIds) {
      expect(reinstalledGenerations.get(pluginId)).toBeGreaterThan(
        initialGenerations.get(pluginId) ?? 0
      );
    }
    await expect(page.getByRole('status')).toHaveText('Ready');
    await expect(
      page.getByRole('button', { name: 'Ant Design action' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Material UI action' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Accordion item' })
    ).toBeVisible();
    await expect
      .poll(() => readSurfacePluginIds(page))
      .toEqual(expectedPluginIds);
    const settled = await page.evaluate(() =>
      window.prodivixOfficialComponentPluginConformance.snapshot()
    );
    expect(
      settled.surfaceLeases.every(
        (lease) =>
          lease.generation === reinstalledGenerations.get(lease.pluginId)
      )
    ).toBe(true);
  });

  test('shutdown releases live portal state and the full owner graph', async ({
    page,
  }) => {
    await openHarness(page);
    await page.getByRole('button', { name: 'Open dialog' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Dialog title' })
    ).toBeVisible();

    const cleanup = await page.evaluate(() =>
      window.prodivixOfficialComponentPluginConformance.shutdown()
    );
    expect(cleanup.phase).toBe('shutdown');
    expect(cleanup.pluginSnapshotCount).toBe(0);
    expectLifecycleCleanup(cleanup);
    await expect(page.getByRole('status')).toHaveText('Shutdown');
    await expect(
      page.getByRole('dialog', { name: 'Dialog title' })
    ).toBeHidden();
  });
});
