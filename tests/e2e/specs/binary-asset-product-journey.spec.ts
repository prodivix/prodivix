import { createHash } from 'node:crypto';
import { expect, test, type Page, type Route } from '@playwright/test';

const API_ROOT = 'http://localhost:8080/api';
const PROJECT_ID = 'workspace-binary-asset-e2e';
const AUTH_TOKEN = 'binary-asset-e2e-token';
const FILE_NAME = 'catalog-photo.jpg';
const ASSET_DOCUMENT_ID = 'asset_public_catalog-photo_jpg';
const JPEG_CANARY = 'private-jpeg-canary';
const FIXED_TIMESTAMP = '2026-07-18T00:00:00.000Z';

const concatBytes = (...parts: readonly Uint8Array[]): Uint8Array => {
  const output = new Uint8Array(
    parts.reduce((total, part) => total + part.byteLength, 0)
  );
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.byteLength;
  });
  return output;
};

const jpegSegment = (marker: number, contents: Uint8Array): Uint8Array => {
  const output = new Uint8Array(contents.byteLength + 4);
  output.set([0xff, marker], 0);
  new DataView(output.buffer).setUint16(2, contents.byteLength + 2);
  output.set(contents, 4);
  return output;
};

const BASELINE_JPEG = new Uint8Array(
  Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAADAAIDAREAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDBr9mPyU//2Q==',
    'base64'
  )
);

if (BASELINE_JPEG[2] !== 0xff || BASELINE_JPEG[3] !== 0xe0) {
  throw new TypeError('The Browser Gate JPEG fixture must begin with APP0.');
}
const app0Length = ((BASELINE_JPEG[4] ?? 0) << 8) | (BASELINE_JPEG[5] ?? 0);
const SANITIZED_JPEG = concatBytes(
  BASELINE_JPEG.subarray(0, 2),
  BASELINE_JPEG.subarray(4 + app0Length)
);
const SOURCE_JPEG = concatBytes(
  BASELINE_JPEG.subarray(0, 2),
  jpegSegment(0xfe, new TextEncoder().encode(JPEG_CANARY)),
  BASELINE_JPEG.subarray(2)
);

const sha256Hex = (contents: Uint8Array): string =>
  createHash('sha256').update(contents).digest('hex');

const assetDigest = (contents: Uint8Array): string =>
  `sha256-${sha256Hex(contents)}`;

const SOURCE_DIGEST = assetDigest(SOURCE_JPEG);
const SANITIZED_DIGEST = assetDigest(SANITIZED_JPEG);
const RECIPE_DIGEST = assetDigest(
  new TextEncoder().encode('prodivix.image.jpeg-raster-reencode@1')
);
const CAPABILITY = sha256Hex(
  new TextEncoder().encode('binary-asset-product-journey-capability')
);
const E2E_PORT = Number(process.env.E2E_PORT ?? 4173);
const DELIVERY_URL = `http://${CAPABILITY}.localhost:${E2E_PORT}/asset`;

type JsonRecord = Record<string, unknown>;

type WireDocument = {
  id: string;
  type: string;
  name?: string;
  path: string;
  contentRev: number;
  metaRev: number;
  content: unknown;
  updatedAt?: string;
  capabilities?: string[];
};

type WireNode = {
  id: string;
  kind: 'dir' | 'doc';
  name: string;
  parentId: string | null;
  children?: string[];
  docId?: string;
};

type WireWorkspace = {
  id: string;
  name: string;
  workspaceRev: number;
  routeRev: number;
  opSeq: number;
  tree: {
    treeRootId: string;
    treeById: Record<string, WireNode>;
  };
  documents: WireDocument[];
  routeManifest: unknown;
  settings: Record<string, unknown>;
  activeDocumentId?: string;
  activeRouteNodeId?: string;
};

type BinaryAssetApiHarness = {
  uploadCount: number;
  settingsCommitCount: number;
  settingsConflictCount: number;
  commitCount: number;
  operationConflictCount: number;
  materializationCount: number;
  materializationCountAfterReload: number;
  deliverySessionCount: number;
  isolatedReadCount: number;
  reloadBoundaryReached: boolean;
  deliveryRequests: unknown[];
  unknownApiRequests: string[];
  canonicalWorkspace: WireWorkspace;
};

const requireRecord = (value: unknown, label: string): JsonRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value as JsonRecord;
};

const requireString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !value) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value;
};

const requireInteger = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new TypeError(`${label} must be a safe integer.`);
  }
  return value;
};

const createInitialWorkspace = (): WireWorkspace => ({
  id: PROJECT_ID,
  name: 'Binary Asset Browser Gate',
  workspaceRev: 1,
  routeRev: 1,
  opSeq: 1,
  tree: {
    treeRootId: 'root',
    treeById: {
      root: {
        id: 'root',
        kind: 'dir',
        name: '/',
        parentId: null,
        children: ['node-page-root'],
      },
      'node-page-root': {
        id: 'node-page-root',
        kind: 'doc',
        name: 'page.pir.json',
        parentId: 'root',
        docId: 'page-root',
      },
    },
  },
  documents: [
    {
      id: 'page-root',
      type: 'pir-page',
      name: 'page.pir.json',
      path: '/page.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: {
        version: '1.6',
        ui: {
          graph: {
            version: 1,
            rootId: 'root',
            nodesById: {
              root: { id: 'root', kind: 'element', type: 'container' },
            },
            childIdsById: { root: [] },
            order: { strategy: 'childIdsById' },
          },
        },
      },
      updatedAt: FIXED_TIMESTAMP,
    },
  ],
  routeManifest: {
    version: '1',
    root: {
      id: 'root',
      children: [{ id: 'route-home', index: true, pageDocId: 'page-root' }],
    },
  },
  settings: { global: { eventTriggerMode: 'selected-only' } },
  activeDocumentId: 'page-root',
  activeRouteNodeId: 'route-home',
});

const copyBytes = (contents: Uint8Array): Uint8Array => {
  const copy = new Uint8Array(contents.byteLength);
  copy.set(contents);
  return copy;
};

const jsonHeaders = (route: Route): Record<string, string> => ({
  'access-control-allow-origin':
    route.request().headers().origin ?? `http://127.0.0.1:${E2E_PORT}`,
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, PUT, POST, OPTIONS',
  'content-type': 'application/json; charset=utf-8',
  vary: 'Origin',
});

const fulfillJson = (
  route: Route,
  value: unknown,
  status = 200
): Promise<void> =>
  route.fulfill({
    status,
    headers: jsonHeaders(route),
    body: JSON.stringify(value),
  });

const fulfillWorkspaceRevisionConflict = (
  route: Route,
  expectedWorkspaceRev: number,
  workspace: WireWorkspace
): Promise<void> =>
  fulfillJson(
    route,
    {
      error: {
        code: 'WKS-4001',
        message: 'Workspace revision conflict.',
        severity: 'warning',
        domain: 'workspace',
        retryable: true,
        requestId: 'binary-asset-e2e-conflict',
        details: {
          conflictType: 'WORKSPACE_CONFLICT',
          workspaceId: workspace.id,
          expected: { workspaceRev: expectedWorkspaceRev },
          current: {
            workspaceRev: workspace.workspaceRev,
            routeRev: workspace.routeRev,
            opSeq: workspace.opSeq,
          },
        },
      },
    },
    409
  );

const readWireDocument = (value: unknown): WireDocument => {
  const document = requireRecord(value, 'operation document');
  const name =
    document.name === undefined
      ? undefined
      : requireString(document.name, 'operation document.name');
  return {
    id: requireString(document.id, 'operation document.id'),
    type: requireString(document.type, 'operation document.type'),
    ...(name ? { name } : {}),
    path: requireString(document.path, 'operation document.path'),
    contentRev: requireInteger(
      document.contentRev,
      'operation document.contentRev'
    ),
    metaRev: requireInteger(document.metaRev, 'operation document.metaRev'),
    content: document.content,
    ...(Array.isArray(document.capabilities)
      ? { capabilities: document.capabilities.map(String) }
      : {}),
  };
};

const readTreeById = (value: unknown): Record<string, WireNode> => {
  const source = requireRecord(value, 'operation treeById');
  return Object.fromEntries(
    Object.entries(source).map(([nodeId, rawNode]) => {
      const node = requireRecord(rawNode, `operation treeById.${nodeId}`);
      const kind = requireString(
        node.kind,
        `operation treeById.${nodeId}.kind`
      );
      if (kind !== 'dir' && kind !== 'doc') {
        throw new TypeError(`operation treeById.${nodeId}.kind is invalid.`);
      }
      return [
        nodeId,
        {
          id: requireString(node.id, `operation treeById.${nodeId}.id`),
          kind,
          name: requireString(node.name, `operation treeById.${nodeId}.name`),
          parentId:
            node.parentId === null
              ? null
              : requireString(
                  node.parentId,
                  `operation treeById.${nodeId}.parentId`
                ),
          ...(Array.isArray(node.children)
            ? { children: node.children.map(String) }
            : {}),
          ...(node.docId === undefined
            ? {}
            : {
                docId: requireString(
                  node.docId,
                  `operation treeById.${nodeId}.docId`
                ),
              }),
        },
      ];
    })
  );
};

const operationCommands = (
  operation: JsonRecord
): Readonly<{ operationId: string; commands: JsonRecord[] }> => {
  if (operation.kind === 'command') {
    const command = requireRecord(operation.command, 'operation.command');
    return {
      operationId: requireString(command.id, 'operation.command.id'),
      commands: [command],
    };
  }
  if (operation.kind === 'transaction') {
    const transaction = requireRecord(
      operation.transaction,
      'operation.transaction'
    );
    if (!Array.isArray(transaction.commands)) {
      throw new TypeError('operation.transaction.commands must be an array.');
    }
    return {
      operationId: requireString(transaction.id, 'operation.transaction.id'),
      commands: transaction.commands.map((command, index) =>
        requireRecord(command, `operation.transaction.commands.${index}`)
      ),
    };
  }
  throw new TypeError('Workspace operation kind is invalid.');
};

const installBinaryAssetApiHarness = async (
  page: Page
): Promise<BinaryAssetApiHarness> => {
  const harness: BinaryAssetApiHarness = {
    uploadCount: 0,
    settingsCommitCount: 0,
    settingsConflictCount: 0,
    commitCount: 0,
    operationConflictCount: 0,
    materializationCount: 0,
    materializationCountAfterReload: 0,
    deliverySessionCount: 0,
    isolatedReadCount: 0,
    reloadBoundaryReached: false,
    deliveryRequests: [],
    unknownApiRequests: [],
    canonicalWorkspace: createInitialWorkspace(),
  };
  const blobs = new Map<
    string,
    Readonly<{ contents: Uint8Array; mediaType: string }>
  >();

  await page.route(`${API_ROOT}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname;
    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: jsonHeaders(route) });
      return;
    }

    expect(request.headers().authorization).toBe(`Bearer ${AUTH_TOKEN}`);

    if (method === 'GET' && path === '/api/auth/me') {
      await fulfillJson(route, {
        user: {
          id: 'user-binary-asset-e2e',
          email: 'binary-assets@example.test',
          name: 'Binary Asset E2E',
          createdAt: FIXED_TIMESTAMP,
        },
      });
      return;
    }

    if (method === 'GET' && path === `/api/projects/${PROJECT_ID}`) {
      await fulfillJson(route, {
        project: {
          id: PROJECT_ID,
          resourceType: 'project',
          name: 'Binary Asset Browser Gate',
          description: 'Strict JPEG product journey fixture',
          isPublic: false,
          starsCount: 0,
          createdAt: FIXED_TIMESTAMP,
          updatedAt: FIXED_TIMESTAMP,
        },
      });
      return;
    }

    if (method === 'GET' && path === `/api/workspaces/${PROJECT_ID}`) {
      await fulfillJson(route, { workspace: harness.canonicalWorkspace });
      return;
    }

    if (
      method === 'GET' &&
      path === `/api/workspaces/${PROJECT_ID}/capabilities`
    ) {
      await fulfillJson(route, {
        workspaceId: PROJECT_ID,
        capabilities: {
          'core.workspace.operation.commit@1.0': true,
          'core.workspace.document.create@1.0': true,
          'core.workspace.directory.create@1.0': true,
        },
      });
      return;
    }

    const blobMatch = new RegExp(
      `^/api/workspaces/${PROJECT_ID}/asset-blobs/(sha256-[a-f0-9]{64})$`,
      'u'
    ).exec(path);
    if (blobMatch && method === 'PUT') {
      const digest = blobMatch[1] as string;
      const body = request.postDataBuffer();
      const contents = new Uint8Array(body ?? Buffer.alloc(0));
      expect(digest).toBe(SOURCE_DIGEST);
      expect(request.headers()['content-type']).toBe('image/jpeg');
      expect(Buffer.from(contents).equals(Buffer.from(SOURCE_JPEG))).toBe(true);
      harness.uploadCount += 1;
      blobs.set(digest, {
        contents: copyBytes(contents),
        mediaType: 'image/jpeg',
      });
      await fulfillJson(route, {
        status: 'stored',
        blob: {
          kind: 'workspace-blob',
          digest,
          byteLength: contents.byteLength,
          mediaType: 'image/jpeg',
        },
      });
      return;
    }

    if (blobMatch && method === 'GET') {
      const digest = blobMatch[1] as string;
      const blob = blobs.get(digest);
      expect(digest).toBe(SOURCE_DIGEST);
      expect(blob).toBeDefined();
      expect(Buffer.from(blob!.contents).equals(Buffer.from(SOURCE_JPEG))).toBe(
        true
      );
      harness.materializationCount += 1;
      if (harness.reloadBoundaryReached) {
        harness.materializationCountAfterReload += 1;
      }
      await route.fulfill({
        status: 200,
        headers: {
          ...jsonHeaders(route),
          'content-type': blob!.mediaType,
          'cache-control': 'private, no-store',
          'x-content-type-options': 'nosniff',
        },
        body: Buffer.from(blob!.contents),
      });
      return;
    }

    if (
      method === 'POST' &&
      path === `/api/workspaces/${PROJECT_ID}/settings/commit`
    ) {
      const settingsRequest = requireRecord(
        JSON.parse(request.postData() ?? 'null'),
        'settings commit request'
      );
      const commitId = requireString(
        settingsRequest.commitId,
        'settings commit request.commitId'
      );
      const expectedWorkspaceRev = requireInteger(
        settingsRequest.expectedWorkspaceRev,
        'settings commit request.expectedWorkspaceRev'
      );
      if (expectedWorkspaceRev !== harness.canonicalWorkspace.workspaceRev) {
        expect(expectedWorkspaceRev).toBeLessThan(
          harness.canonicalWorkspace.workspaceRev
        );
        harness.settingsConflictCount += 1;
        await fulfillWorkspaceRevisionConflict(
          route,
          expectedWorkspaceRev,
          harness.canonicalWorkspace
        );
        return;
      }
      const settings = requireRecord(
        settingsRequest.settings,
        'settings commit request.settings'
      );
      const previous = harness.canonicalWorkspace;
      harness.canonicalWorkspace = {
        ...previous,
        workspaceRev: previous.workspaceRev + 1,
        opSeq: previous.opSeq + 1,
        settings: structuredClone(settings),
      };
      harness.settingsCommitCount += 1;
      await fulfillJson(route, {
        workspaceId: PROJECT_ID,
        workspaceRev: harness.canonicalWorkspace.workspaceRev,
        routeRev: harness.canonicalWorkspace.routeRev,
        opSeq: harness.canonicalWorkspace.opSeq,
        settings: harness.canonicalWorkspace.settings,
        acceptedMutationId: commitId,
      });
      return;
    }

    if (
      method === 'POST' &&
      path === `/api/workspaces/${PROJECT_ID}/operations/commit`
    ) {
      const requestBody = requireRecord(
        JSON.parse(request.postData() ?? 'null'),
        'commit request'
      );
      const expected = requireRecord(requestBody.expected, 'commit expected');
      const expectedWorkspaceRev = requireInteger(
        expected.workspaceRev,
        'commit expected.workspaceRev'
      );
      expect(expected).not.toHaveProperty('routeRev');
      expect(expected.documents).toEqual([
        { id: ASSET_DOCUMENT_ID, contentRev: null, metaRev: null },
      ]);
      if (expectedWorkspaceRev !== harness.canonicalWorkspace.workspaceRev) {
        expect(expectedWorkspaceRev).toBeLessThan(
          harness.canonicalWorkspace.workspaceRev
        );
        harness.operationConflictCount += 1;
        await fulfillWorkspaceRevisionConflict(
          route,
          expectedWorkspaceRev,
          harness.canonicalWorkspace
        );
        return;
      }

      const operation = requireRecord(
        requestBody.operation,
        'commit operation'
      );
      const { operationId, commands } = operationCommands(operation);
      const patches = commands.flatMap((command, commandIndex) => {
        if (!Array.isArray(command.forwardOps)) {
          throw new TypeError(
            `commit command ${commandIndex}.forwardOps must be an array.`
          );
        }
        return command.forwardOps.map((patch, patchIndex) =>
          requireRecord(
            patch,
            `commit command ${commandIndex}.forwardOps.${patchIndex}`
          )
        );
      });
      const documentPatch = patches.find(
        (patch) =>
          patch.op === 'add' && patch.path === `/docsById/${ASSET_DOCUMENT_ID}`
      );
      const treePatch = patches.find(
        (patch) => patch.op === 'replace' && patch.path === '/treeById'
      );
      if (!documentPatch || !treePatch) {
        throw new TypeError(
          'Asset authoring commit must contain one document add and exact tree replacement.'
        );
      }
      const operationDocument = readWireDocument(documentPatch.value);
      const operationContent = requireRecord(
        operationDocument.content,
        'asset document content'
      );
      expect(operationDocument).toMatchObject({
        id: ASSET_DOCUMENT_ID,
        type: 'asset',
        name: FILE_NAME,
        path: `/public/${FILE_NAME}`,
        contentRev: 1,
        metaRev: 1,
      });
      expect(operationContent).toEqual({
        kind: 'asset',
        category: 'image',
        mime: 'image/jpeg',
        size: SOURCE_JPEG.byteLength,
        blob: {
          kind: 'workspace-blob',
          digest: SOURCE_DIGEST,
          byteLength: SOURCE_JPEG.byteLength,
          mediaType: 'image/jpeg',
        },
        metadata: { originalFileName: FILE_NAME },
      });

      const committedDocument: WireDocument = {
        ...operationDocument,
        updatedAt: FIXED_TIMESTAMP,
      };
      const nextTreeById = readTreeById(treePatch.value);
      const previous = harness.canonicalWorkspace;
      harness.canonicalWorkspace = {
        ...previous,
        workspaceRev: previous.workspaceRev + 1,
        opSeq: previous.opSeq + 1,
        tree: {
          treeRootId: previous.tree.treeRootId,
          treeById: nextTreeById,
        },
        documents: [...previous.documents, committedDocument],
      };
      harness.commitCount += 1;
      await fulfillJson(route, {
        workspaceId: PROJECT_ID,
        workspaceRev: harness.canonicalWorkspace.workspaceRev,
        routeRev: harness.canonicalWorkspace.routeRev,
        opSeq: harness.canonicalWorkspace.opSeq,
        tree: harness.canonicalWorkspace.tree,
        updatedDocuments: [committedDocument],
        acceptedMutationId: operationId,
      });
      return;
    }

    const deliveryMatch = new RegExp(
      `^/api/workspaces/${PROJECT_ID}/asset-blobs/(sha256-[a-f0-9]{64})/delivery-sessions$`,
      'u'
    ).exec(path);
    if (deliveryMatch && method === 'POST') {
      expect(deliveryMatch[1]).toBe(SOURCE_DIGEST);
      expect(blobs.has(SOURCE_DIGEST)).toBe(true);
      const deliveryRequest = JSON.parse(request.postData() ?? 'null');
      harness.deliveryRequests.push(deliveryRequest);
      harness.deliverySessionCount += 1;
      await fulfillJson(route, {
        deliveryUrl: DELIVERY_URL,
        expiresAt: Date.now() + 60_000,
        digest: SANITIZED_DIGEST,
        mediaType: 'image/jpeg',
        byteLength: SANITIZED_JPEG.byteLength,
        disposition: 'inline',
        deliveryClass: 'static',
        recipeDigest: RECIPE_DIGEST,
        metadata: { width: 2, height: 3 },
        cacheStatus: 'transformed',
      });
      return;
    }

    harness.unknownApiRequests.push(`${method} ${path}`);
    await fulfillJson(
      route,
      {
        error: {
          code: 'E2E_UNKNOWN_API',
          message: `Unexpected E2E API request: ${method} ${path}`,
        },
      },
      404
    );
  });

  await page.route(DELIVERY_URL, async (route) => {
    expect(route.request().method()).toBe('GET');
    harness.isolatedReadCount += 1;
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'image/jpeg',
        'content-length': String(SANITIZED_JPEG.byteLength),
        'cache-control': 'private, no-store',
        'content-security-policy': "default-src 'none'; sandbox",
        'x-content-type-options': 'nosniff',
      },
      body: Buffer.from(SANITIZED_JPEG),
    });
  });

  return harness;
};

test.describe('Binary Asset product journey', () => {
  test('uploads, durably reloads, raster re-encodes, and isolates a JPEG @binary-assets', async ({
    page,
  }) => {
    expect(Buffer.from(SOURCE_JPEG).includes(Buffer.from(JPEG_CANARY))).toBe(
      true
    );
    expect(Buffer.from(SANITIZED_JPEG).includes(Buffer.from(JPEG_CANARY))).toBe(
      false
    );
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const harness = await installBinaryAssetApiHarness(page);
    await page.addInitScript(
      ({ token, user, expiresAt }) => {
        window.localStorage.setItem(
          'prodivix-auth-session',
          JSON.stringify({
            state: { token, user, expiresAt },
            version: 0,
          })
        );
      },
      {
        token: AUTH_TOKEN,
        user: {
          id: 'user-binary-asset-e2e',
          email: 'binary-assets@example.test',
          name: 'Binary Asset E2E',
          createdAt: FIXED_TIMESTAMP,
        },
        expiresAt: '2099-01-01T00:00:00.000Z',
      }
    );

    await page.goto(`/editor/project/${PROJECT_ID}/resources`);
    await page.getByRole('button', { name: 'Public', exact: true }).click();
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: FILE_NAME,
      mimeType: 'image/jpeg',
      buffer: Buffer.from(SOURCE_JPEG),
    });

    await expect(
      page.getByRole('heading', { name: FILE_NAME, exact: true })
    ).toBeVisible();
    let image = page.getByRole('img', { name: FILE_NAME, exact: true });
    await expect(image).toHaveAttribute('src', /^blob:/u);
    await expect
      .poll(() => harness.uploadCount, { message: 'bytes-first upload' })
      .toBe(1);
    await expect
      .poll(() => harness.commitCount, { message: 'durable outbox commit' })
      .toBe(1);
    await expect
      .poll(() => harness.materializationCount, {
        message: 'authorized exact-byte materialization',
      })
      .toBeGreaterThanOrEqual(1);
    await expect
      .poll(() =>
        image.evaluate((node) => ({
          complete: (node as HTMLImageElement).complete,
          width: (node as HTMLImageElement).naturalWidth,
          height: (node as HTMLImageElement).naturalHeight,
        }))
      )
      .toEqual({ complete: true, width: 2, height: 3 });

    harness.reloadBoundaryReached = true;
    await page.reload();
    await expect(
      page.getByRole('heading', { name: FILE_NAME, exact: true })
    ).toBeVisible();
    image = page.getByRole('img', { name: FILE_NAME, exact: true });
    await expect(image).toHaveAttribute('src', /^blob:/u);
    await expect
      .poll(() => harness.materializationCountAfterReload, {
        message: 'reload rematerializes canonical blob reference',
      })
      .toBeGreaterThanOrEqual(1);

    await page
      .getByRole('button', { name: 'Re-encode & isolate', exact: true })
      .click();
    await expect(
      page.getByText('Isolated delivery ready · transformed', { exact: false })
    ).toBeVisible();
    await expect(image).toHaveAttribute('src', DELIVERY_URL);
    await expect
      .poll(() => harness.isolatedReadCount, {
        message: 'capability-origin image fetch',
      })
      .toBeGreaterThanOrEqual(1);
    await expect
      .poll(() =>
        image.evaluate((node) => ({
          complete: (node as HTMLImageElement).complete,
          width: (node as HTMLImageElement).naturalWidth,
          height: (node as HTMLImageElement).naturalHeight,
        }))
      )
      .toEqual({ complete: true, width: 2, height: 3 });

    expect(harness.deliverySessionCount).toBe(1);
    expect(harness.settingsCommitCount).toBe(1);
    expect(harness.settingsConflictCount).toBeLessThanOrEqual(1);
    expect(harness.operationConflictCount).toBeLessThanOrEqual(1);
    expect(
      harness.settingsConflictCount + harness.operationConflictCount
    ).toBeLessThanOrEqual(1);
    expect(harness.deliveryRequests).toEqual([
      { transform: 'jpeg-raster-reencode', disposition: 'inline' },
    ]);
    expect(harness.canonicalWorkspace.workspaceRev).toBe(3);
    expect(harness.canonicalWorkspace.opSeq).toBe(3);
    expect(
      harness.canonicalWorkspace.documents.find(
        (document) => document.id === ASSET_DOCUMENT_ID
      )?.content
    ).toMatchObject({
      kind: 'asset',
      blob: {
        digest: SOURCE_DIGEST,
        byteLength: SOURCE_JPEG.byteLength,
        mediaType: 'image/jpeg',
      },
    });
    expect(harness.unknownApiRequests).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
