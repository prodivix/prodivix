import { expect as expectPage } from '@playwright/test';
import { describe, expect, it } from 'vitest';
import { createGoldenG2VueCatalogRemoteProjectedBundle } from './goldenG2VueCatalogFixture';
import { verifyGoldenBrowserProject } from './generatedProjectHarness';

type CatalogBridgeEvidence = Readonly<{
  dataOperations: readonly string[];
  serverFunctions: readonly string[];
  networkOperations: readonly string[];
  serializedMessages: string;
}>;

declare global {
  interface Window {
    __prodivixCatalogBridgeEvidence?: CatalogBridgeEvidence;
  }
}

describe.runIf(process.env.PRODIVIX_VERIFY_G2_VUE_PRODUCT === '1')(
  'Golden G2 authenticated Vue Catalog Remote iframe Gate',
  () => {
    it('runs live guard/loader and CRUD through strict parent bridges with correlated Network traces', async () => {
      const bundle = createGoldenG2VueCatalogRemoteProjectedBundle();
      const evidence = await verifyGoldenBrowserProject(bundle, {
        routePath: '/',
        browserChannel: process.env.E2E_BROWSER_CHANNEL,
        preparePage: async (page, projectUrl) => {
          const browserErrors: string[] = [];
          page.on('pageerror', (error) => browserErrors.push(error.message));
          page.on('console', (message) => {
            if (message.type() === 'error') browserErrors.push(message.text());
          });
          await page.goto(
            new URL('/__prodivix-golden-host.html', projectUrl).href,
            { waitUntil: 'networkidle' }
          );
          await page.setContent(
            '<main><iframe id="project" title="Remote Catalog"></iframe></main>'
          );
          await page.evaluate((url) => {
            type Product = Readonly<{ id: string; name: string }>;
            const products: Product[] = [{ id: 'p1', name: 'Alpha' }];
            const dataOperations: string[] = [];
            const serverFunctions: string[] = [];
            const networkOperations: string[] = [];
            const serializedMessages: string[] = [];
            const methodsByOperation: Readonly<Record<string, string>> = {
              'list-products': 'GET',
              'create-product': 'POST',
              'get-product': 'GET',
              'update-product': 'PUT',
              'delete-product': 'DELETE',
            };
            const publishEvidence = () => {
              window.__prodivixCatalogBridgeEvidence = Object.freeze({
                dataOperations: Object.freeze([...dataOperations]),
                serverFunctions: Object.freeze([...serverFunctions]),
                networkOperations: Object.freeze([...networkOperations]),
                serializedMessages: serializedMessages.join('\n'),
              });
            };
            window.addEventListener(
              'message',
              (event: MessageEvent<unknown>) => {
                const frame =
                  document.querySelector<HTMLIFrameElement>('#project');
                if (
                  !frame?.contentWindow ||
                  event.source !== frame.contentWindow
                )
                  return;
                if (
                  !event.data ||
                  typeof event.data !== 'object' ||
                  Array.isArray(event.data)
                )
                  return;
                const request = event.data as Record<string, unknown>;
                serializedMessages.push(JSON.stringify(request));
                if (request.type === 'prodivix.execution-network-bridge.v1') {
                  const trace = request.trace as
                    | Readonly<{
                        correlation?: Readonly<{ operationId?: string }>;
                      }>
                    | undefined;
                  if (trace?.correlation?.operationId)
                    networkOperations.push(trace.correlation.operationId);
                  publishEvidence();
                  return;
                }
                if (
                  request.type ===
                  'prodivix.execution-server-function-gateway-request.v1'
                ) {
                  const reference = request.functionRef as
                    Readonly<{ exportName?: string }> | undefined;
                  const exportName = reference?.exportName ?? '';
                  serverFunctions.push(exportName);
                  const result =
                    exportName === 'requireCatalogOwner'
                      ? { kind: 'allow' }
                      : exportName === 'loadCatalogPrincipal'
                        ? {
                            kind: 'value',
                            value: {
                              providerId: 'prodivix-product-session',
                              principalId: 'catalog-golden-owner',
                            },
                          }
                        : {
                            kind: 'value',
                            value: {
                              key: 'catalog-last-action',
                              value: true,
                              revision: 1,
                            },
                          };
                  frame.contentWindow.postMessage(
                    {
                      type: 'prodivix.execution-server-function-gateway-response.v1',
                      requestId: request.requestId,
                      ok: true,
                      result,
                    },
                    '*'
                  );
                  publishEvidence();
                  return;
                }
                if (
                  request.type !== 'prodivix.execution-data-gateway-request.v1'
                )
                  return;
                const operationId = String(request.operationId ?? '');
                const input = request.input as
                  | Readonly<{
                      id?: string;
                      product?: Product;
                      patch?: Readonly<{ name?: string }>;
                    }>
                  | undefined;
                dataOperations.push(operationId);
                let value: unknown;
                if (operationId === 'list-products') value = [...products];
                else if (operationId === 'create-product' && input?.product) {
                  products.push({ ...input.product });
                  value = { ...input.product };
                } else if (operationId === 'get-product') {
                  value = products.find(({ id }) => id === input?.id) ?? null;
                } else if (operationId === 'update-product') {
                  const index = products.findIndex(
                    ({ id }) => id === input?.id
                  );
                  if (index >= 0) {
                    products[index] = {
                      ...products[index]!,
                      ...(input?.patch?.name ? { name: input.patch.name } : {}),
                    };
                  }
                  value = index >= 0 ? { ...products[index]! } : null;
                } else if (operationId === 'delete-product') {
                  const index = products.findIndex(
                    ({ id }) => id === input?.id
                  );
                  value = index >= 0 ? products.splice(index, 1)[0] : null;
                } else value = null;
                const startedAt = Date.now();
                frame.contentWindow.postMessage(
                  {
                    type: 'prodivix.execution-data-gateway-response.v1',
                    requestId: request.requestId,
                    ok: true,
                    result: {
                      value,
                      empty: false,
                      network: {
                        format: 'prodivix.execution-network-trace.v1',
                        requestId: request.requestId,
                        phase: 'runtime',
                        runtimeZone: 'server',
                        mode: 'live',
                        adapter: 'core.http',
                        method: methodsByOperation[operationId] ?? 'GET',
                        sanitizedUrl: 'https://catalog.example.test/',
                        protocol: 'https',
                        startedAt,
                        completedAt: startedAt,
                        durationMs: 0,
                        outcome: 'allowed',
                        status: operationId === 'create-product' ? 201 : 200,
                        correlation: {
                          kind: 'data-operation',
                          documentId: request.documentId,
                          operationId,
                          invocationId: request.invocationId,
                          sequence: request.sequence,
                          attempt: request.attempt,
                        },
                        redacted: true,
                        sourceTrace: [
                          {
                            sourceRef: {
                              kind: 'data-operation',
                              documentId: request.documentId,
                              operationId,
                            },
                            label: 'Authenticated Catalog operation',
                          },
                        ],
                      },
                    },
                  },
                  '*'
                );
                publishEvidence();
              }
            );
            publishEvidence();
            const frame = document.querySelector<HTMLIFrameElement>('#project');
            if (!frame) throw new Error('Remote Catalog frame is unavailable.');
            frame.src = url;
          }, projectUrl);
          try {
            await page
              .frameLocator('#project')
              .getByRole('heading', { name: 'Authenticated Catalog' })
              .waitFor({ state: 'visible', timeout: 15_000 });
          } catch (error) {
            const diagnostics = await page.evaluate(() => ({
              evidence: window.__prodivixCatalogBridgeEvidence,
              frameSource:
                document.querySelector<HTMLIFrameElement>('#project')?.src,
            }));
            const frame = page
              .frames()
              .find((candidate) => candidate.url() === projectUrl);
            const frameContent = await frame?.content();
            throw new Error(
              `Remote Catalog frame did not become ready: ${JSON.stringify({ ...diagnostics, browserErrors, frameContent: frameContent?.slice(0, 2_000) })}`,
              { cause: error }
            );
          }
        },
        verifyPage: async (page) => {
          const project = page.frameLocator('#project');
          await expectPage(project.getByTestId('catalog-shell')).toBeVisible();
          await expectPage(project.getByTestId('catalog-main')).toBeVisible();
          await expectPage(
            project.getByTestId('catalog-sidebar-page')
          ).toHaveText('Featured products');
          await expectPage(project.getByText('Catalog Shell')).toBeVisible();
          await expectPage(project.getByText('Catalog fallback')).toHaveCount(
            0
          );
          await expectPage(project.getByText('Sidebar fallback')).toHaveCount(
            0
          );
          await expectPage(
            project.getByRole('heading', { name: 'Authenticated Catalog' })
          ).toBeVisible();
          await expectPage
            .poll(() =>
              project.getByTestId('catalog-image').evaluate((node) => ({
                complete: (node as HTMLImageElement).complete,
                width: (node as HTMLImageElement).naturalWidth,
                height: (node as HTMLImageElement).naturalHeight,
              }))
            )
            .toEqual({ complete: true, width: 1, height: 1 });
          await expectPage(project.getByTestId('product-card')).toContainText(
            'Alpha'
          );
          await expectPage(
            project.locator('[data-prodivix-route-loader]')
          ).toContainText('catalog-golden-owner');

          await project.getByTestId('create-product').click();
          await expectPage(project.getByTestId('product-card')).toHaveCount(2);
          await expectPage(project.getByTestId('catalog')).toContainText(
            'Beta'
          );

          await project.getByTestId('update-product').click();
          await expectPage(project.getByTestId('catalog')).toContainText(
            'Beta Updated'
          );

          await project.getByTestId('delete-product').click();
          await expectPage(project.getByTestId('product-card')).toHaveCount(1);
          await expectPage(project.getByTestId('catalog')).not.toContainText(
            'Beta Updated'
          );

          const bridge = await page.evaluate(
            () => window.__prodivixCatalogBridgeEvidence
          );
          expect(bridge?.serverFunctions).toEqual(
            expect.arrayContaining([
              'requireCatalogOwner',
              'loadCatalogPrincipal',
            ])
          );
          expect(bridge?.dataOperations).toEqual(
            expect.arrayContaining([
              'list-products',
              'create-product',
              'update-product',
              'delete-product',
            ])
          );
          expect(bridge?.networkOperations).toEqual(
            expect.arrayContaining([
              'list-products',
              'create-product',
              'update-product',
              'delete-product',
            ])
          );
          expect(bridge?.serializedMessages).not.toContain(
            'vue-catalog-server-source-must-never-enter-client-output'
          );
          expect(bridge?.serializedMessages).not.toContain('authorization');
          expect(bridge?.serializedMessages).not.toContain('cookie');
        },
      });
      expect(evidence.completedCommands).toEqual([
        'install',
        'typecheck',
        'test',
        'build',
        'browser-smoke',
      ]);
      expect(evidence.bundleFileCount).toBe(bundle.files.length);
    }, 600_000);
  }
);
