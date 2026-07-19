import { encodePirDocument, type PIRDocument } from '@prodivix/pir';
import { apiBinaryRequest, apiRequest } from '@/infra/api';
import {
  classifyBinaryAssetDelivery,
  createBinaryAssetBlobReference,
  createBinaryAssetMaterialization,
  isBinaryAssetDigest,
  normalizeBinaryAssetMediaType,
  readBinaryAssetBlobReference,
  type BinaryAssetBlobReference,
  type BinaryAssetBlobUploadResult,
  type BinaryAssetDeliveryClass,
  type BinaryAssetDeliveryRequest,
  type BinaryAssetMaterialization,
} from '@prodivix/assets';
import {
  decodeWorkspaceMutation,
  decodeWorkspaceSnapshot,
  encodeWorkspaceSnapshot,
  isWorkspaceAssetDocumentContent,
  type WorkspaceOperation,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  decodeWorkspaceOperationCommitResponse,
  type WorkspaceOperationCommitRequest,
  type WorkspaceSettingsCommitRequest,
} from '@prodivix/workspace-sync';

export type ProjectResourceType = 'project' | 'component' | 'nodegraph';

export type ProjectSummary = {
  id: string;
  resourceType: ProjectResourceType;
  name: string;
  description?: string;
  isPublic: boolean;
  starsCount: number;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceCapabilitiesResponse = {
  workspaceId: string;
  capabilities: Record<string, boolean>;
};

export type WorkspaceExecutionRole = 'viewer' | 'editor';

export type WorkspaceExecutionRoleGrant = Readonly<{
  principalId: string;
  principalEmail: string;
  principalName: string;
  role: WorkspaceExecutionRole;
  grantedAt: string;
}>;

export type WorkspaceAssetDeliveryRequest = BinaryAssetDeliveryRequest;

const workspaceAssetSanitizedMediaType = (
  transform: string
): 'image/png' | 'image/jpeg' | undefined => {
  if (transform === 'png-sanitize' || transform === 'png-raster-reencode') {
    return 'image/png';
  }
  if (transform === 'jpeg-sanitize' || transform === 'jpeg-raster-reencode') {
    return 'image/jpeg';
  }
  return undefined;
};

export type WorkspaceAssetDeliverySession = Readonly<{
  deliveryUrl: string;
  expiresAt: number;
  digest: string;
  mediaType: string;
  byteLength: number;
  disposition: 'attachment' | 'inline';
  deliveryClass: BinaryAssetDeliveryClass;
  recipeDigest: string | null;
  metadata: Readonly<{ width: number; height: number }> | null;
  cacheStatus: 'cache-hit' | 'not-applicable' | 'transformed';
}>;

export type ImportLocalProjectRequest = {
  name: string;
  description?: string;
  resourceType: ProjectResourceType;
  workspace: WorkspaceSnapshot;
  settings: Record<string, unknown>;
  assetMaterializations?: readonly BinaryAssetMaterialization[];
};

const LOCAL_PROJECT_IMPORT_LIMITS = Object.freeze({
  maxManifestBytes: 4 * 1024 * 1024,
  maxAssetBlobs: 256,
  maxAssetBytes: 128 * 1024 * 1024,
});

const JSON_HEADERS = {
  'Content-Type': 'application/json',
} as const;

const copyToArrayBuffer = (contents: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(contents.byteLength);
  copy.set(contents);
  return copy.buffer;
};

const bytesEqual = (left: Uint8Array, right: Uint8Array): boolean =>
  left.byteLength === right.byteLength &&
  left.every((value, index) => value === right[index]);

const prepareLocalProjectAssetUploads = (
  workspace: WorkspaceSnapshot,
  materializations: readonly BinaryAssetMaterialization[] | undefined
): readonly BinaryAssetMaterialization[] => {
  const assetDocuments = Object.values(workspace.docsById)
    .filter((document) => document.type === 'asset')
    .sort(
      (left, right) =>
        left.path.localeCompare(right.path) || left.id.localeCompare(right.id)
    );
  if (!assetDocuments.length) {
    if (materializations?.length) {
      throw new TypeError(
        'AST-2001: Local project import contains unreferenced asset bytes.'
      );
    }
    return Object.freeze([]);
  }

  const referencesByDocumentId = new Map<string, BinaryAssetBlobReference>();
  assetDocuments.forEach((document) => {
    if (!isWorkspaceAssetDocumentContent(document.content)) {
      throw new TypeError(
        `AST-2001: Asset document ${document.id} is invalid.`
      );
    }
    referencesByDocumentId.set(document.id, document.content.blob);
  });

  const coveredDocumentIds = new Set<string>();
  const uploadsByDigest = new Map<string, BinaryAssetMaterialization>();
  let totalBytes = 0;
  for (const candidate of materializations ?? []) {
    const expected = referencesByDocumentId.get(candidate.assetDocumentId);
    if (!expected) {
      throw new TypeError(
        `AST-2001: Asset materialization ${candidate.assetDocumentId} is not referenced by the Workspace.`
      );
    }
    if (coveredDocumentIds.has(candidate.assetDocumentId)) {
      throw new TypeError(
        `AST-2003: Asset document ${candidate.assetDocumentId} was materialized more than once.`
      );
    }
    const materialization = createBinaryAssetMaterialization(candidate);
    if (
      materialization.reference.digest !== expected.digest ||
      materialization.reference.byteLength !== expected.byteLength ||
      materialization.reference.mediaType !== expected.mediaType
    ) {
      throw new TypeError(
        `AST-2003: Asset materialization ${candidate.assetDocumentId} drifted from its Workspace reference.`
      );
    }
    coveredDocumentIds.add(candidate.assetDocumentId);

    const existing = uploadsByDigest.get(materialization.reference.digest);
    if (existing) {
      if (
        existing.reference.byteLength !==
          materialization.reference.byteLength ||
        existing.reference.mediaType !== materialization.reference.mediaType ||
        !bytesEqual(existing.contents, materialization.contents)
      ) {
        throw new TypeError(
          `AST-2003: Asset digest ${materialization.reference.digest} has conflicting materializations.`
        );
      }
      continue;
    }
    uploadsByDigest.set(materialization.reference.digest, materialization);
    totalBytes += materialization.contents.byteLength;
    if (
      uploadsByDigest.size > LOCAL_PROJECT_IMPORT_LIMITS.maxAssetBlobs ||
      totalBytes > LOCAL_PROJECT_IMPORT_LIMITS.maxAssetBytes
    ) {
      throw new TypeError(
        'AST-2001: Local project asset import exceeds its bounded upload budget.'
      );
    }
  }

  const missing = assetDocuments.find(
    (document) => !coveredDocumentIds.has(document.id)
  );
  if (missing) {
    throw new TypeError(
      `AST-2002: Asset ${missing.id} is unavailable for local project import.`
    );
  }
  return Object.freeze(
    [...uploadsByDigest.values()].sort((left, right) =>
      left.reference.digest.localeCompare(right.reference.digest)
    )
  );
};

const encodeLocalProjectImportManifest = (
  data: Omit<ImportLocalProjectRequest, 'assetMaterializations'>
): string => {
  const { workspace, settings, ...project } = data;
  const manifest = JSON.stringify({
    ...project,
    workspace: encodeWorkspaceSnapshot(workspace, settings),
  });
  if (
    new TextEncoder().encode(manifest).byteLength >
    LOCAL_PROJECT_IMPORT_LIMITS.maxManifestBytes
  ) {
    throw new TypeError(
      'Local project import manifest exceeds its byte limit.'
    );
  }
  return manifest;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const exactKeys = (
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[]
): boolean => {
  const actual = Object.keys(value).sort();
  const normalizedExpected = [...expected].sort();
  return (
    actual.length === normalizedExpected.length &&
    actual.every((key, index) => key === normalizedExpected[index])
  );
};

const readWorkspaceExecutionRoleGrant = (
  value: unknown
): WorkspaceExecutionRoleGrant => {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'principalId',
      'principalEmail',
      'principalName',
      'role',
      'grantedAt',
    ]) ||
    typeof value.principalId !== 'string' ||
    !value.principalId ||
    value.principalId !== value.principalId.trim() ||
    typeof value.principalEmail !== 'string' ||
    !value.principalEmail.includes('@') ||
    value.principalEmail !== value.principalEmail.trim().toLowerCase() ||
    typeof value.principalName !== 'string' ||
    value.principalName !== value.principalName.trim() ||
    (value.role !== 'viewer' && value.role !== 'editor') ||
    typeof value.grantedAt !== 'string' ||
    !value.grantedAt ||
    Number.isNaN(Date.parse(value.grantedAt))
  ) {
    throw new TypeError('Workspace execution role grant is invalid.');
  }
  return Object.freeze({
    principalId: value.principalId,
    principalEmail: value.principalEmail,
    principalName: value.principalName,
    role: value.role,
    grantedAt: value.grantedAt,
  });
};

const readWorkspaceExecutionRoleList = (
  value: unknown
): readonly WorkspaceExecutionRoleGrant[] => {
  if (
    !isRecord(value) ||
    !exactKeys(value, ['roles']) ||
    !Array.isArray(value.roles) ||
    value.roles.length > 256
  ) {
    throw new TypeError('Workspace execution role list is invalid.');
  }
  const roles = value.roles.map(readWorkspaceExecutionRoleGrant);
  const identities = new Set(roles.map((role) => role.principalId));
  if (identities.size !== roles.length) {
    throw new TypeError('Workspace execution role list is invalid.');
  }
  return Object.freeze(roles);
};

const isCapabilityDeliveryUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    const loopback =
      ['localhost', '127.0.0.1', '::1'].includes(url.hostname) ||
      url.hostname.endsWith('.localhost');
    const capability = url.hostname.split('.', 1)[0] ?? '';
    return (
      (url.protocol === 'https:' || (url.protocol === 'http:' && loopback)) &&
      !url.username &&
      !url.password &&
      url.pathname === '/asset' &&
      !url.search &&
      !url.hash &&
      /^[a-f0-9]{64}$/u.test(capability)
    );
  } catch {
    return false;
  }
};

const readWorkspaceAssetDeliverySession = (
  value: unknown,
  source: BinaryAssetBlobReference,
  request: WorkspaceAssetDeliveryRequest
): WorkspaceAssetDeliverySession => {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'deliveryUrl',
      'expiresAt',
      'digest',
      'mediaType',
      'byteLength',
      'disposition',
      'deliveryClass',
      'recipeDigest',
      'metadata',
      'cacheStatus',
    ]) ||
    typeof value.deliveryUrl !== 'string' ||
    !isCapabilityDeliveryUrl(value.deliveryUrl) ||
    typeof value.expiresAt !== 'number' ||
    !Number.isSafeInteger(value.expiresAt) ||
    value.expiresAt <= Date.now() ||
    typeof value.digest !== 'string' ||
    !isBinaryAssetDigest(value.digest) ||
    typeof value.mediaType !== 'string' ||
    typeof value.byteLength !== 'number' ||
    !Number.isSafeInteger(value.byteLength) ||
    value.byteLength < 0 ||
    (value.disposition !== 'inline' && value.disposition !== 'attachment') ||
    (value.deliveryClass !== 'static' &&
      value.deliveryClass !== 'download-only' &&
      value.deliveryClass !== 'active-content') ||
    (value.cacheStatus !== 'cache-hit' &&
      value.cacheStatus !== 'not-applicable' &&
      value.cacheStatus !== 'transformed')
  ) {
    throw new TypeError('Workspace asset delivery session is invalid.');
  }
  const mediaType = normalizeBinaryAssetMediaType(value.mediaType);
  if (
    mediaType !== value.mediaType ||
    classifyBinaryAssetDelivery(mediaType) !== value.deliveryClass ||
    value.disposition !== request.disposition ||
    (value.disposition === 'inline' && value.deliveryClass !== 'static')
  ) {
    throw new TypeError('Workspace asset delivery policy drifted.');
  }
  let recipeDigest: string | null = null;
  let metadata: Readonly<{ width: number; height: number }> | null = null;
  const sanitizedMediaType = workspaceAssetSanitizedMediaType(
    request.transform
  );
  if (sanitizedMediaType) {
    if (
      mediaType !== sanitizedMediaType ||
      value.byteLength < 1 ||
      typeof value.recipeDigest !== 'string' ||
      !isBinaryAssetDigest(value.recipeDigest) ||
      !isRecord(value.metadata) ||
      !exactKeys(value.metadata, ['width', 'height']) ||
      typeof value.metadata.width !== 'number' ||
      typeof value.metadata.height !== 'number' ||
      !Number.isSafeInteger(value.metadata.width) ||
      !Number.isSafeInteger(value.metadata.height) ||
      value.metadata.width < 1 ||
      value.metadata.height < 1 ||
      value.metadata.width > 8_192 ||
      value.metadata.height > 8_192 ||
      value.metadata.width * value.metadata.height > 32 * 1024 * 1024 ||
      value.cacheStatus === 'not-applicable'
    ) {
      throw new TypeError('Workspace asset transform result is invalid.');
    }
    recipeDigest = value.recipeDigest;
    metadata = Object.freeze({
      width: value.metadata.width,
      height: value.metadata.height,
    });
  } else if (
    value.digest !== source.digest ||
    value.byteLength !== source.byteLength ||
    mediaType !== source.mediaType ||
    value.recipeDigest !== null ||
    value.metadata !== null ||
    value.cacheStatus !== 'not-applicable'
  ) {
    throw new TypeError('Workspace original asset delivery identity drifted.');
  }
  return Object.freeze({
    deliveryUrl: value.deliveryUrl,
    expiresAt: value.expiresAt,
    digest: value.digest,
    mediaType,
    byteLength: value.byteLength,
    disposition: value.disposition,
    deliveryClass: value.deliveryClass,
    recipeDigest,
    metadata,
    cacheStatus: value.cacheStatus,
  });
};

const request = async <T>(
  token: string,
  path: string,
  options: RequestInit = {}
): Promise<T> =>
  apiRequest<T>(path, {
    ...options,
    token,
    defaultHeaders: JSON_HEADERS,
  });

export const editorApi = {
  listProjects: async (token: string, options: RequestInit = {}) =>
    request<{ projects: ProjectSummary[] }>(token, '/projects', options),

  createProject: async (
    token: string,
    data: {
      name: string;
      description?: string;
      resourceType: ProjectResourceType;
      isPublic?: boolean;
      initialPir?: PIRDocument;
    }
  ) => {
    const { initialPir, ...project } = data;
    return request<{ project: ProjectSummary }>(token, '/projects', {
      method: 'POST',
      body: JSON.stringify({
        ...project,
        ...(initialPir
          ? { pir: JSON.parse(encodePirDocument(initialPir)) }
          : {}),
      }),
    });
  },

  importLocalProject: async (
    token: string,
    data: ImportLocalProjectRequest
  ) => {
    const { assetMaterializations, ...manifestInput } = data;
    const assetUploads = prepareLocalProjectAssetUploads(
      data.workspace,
      assetMaterializations
    );
    const manifest = encodeLocalProjectImportManifest(manifestInput);
    const requestOptions: RequestInit & { token?: string } = assetUploads.length
      ? (() => {
          const body = new FormData();
          body.append(
            'manifest',
            new Blob([manifest], { type: 'application/json' }),
            'manifest.json'
          );
          assetUploads.forEach((materialization) => {
            body.append(
              'asset',
              new Blob([copyToArrayBuffer(materialization.contents)], {
                type: materialization.reference.mediaType,
              }),
              materialization.reference.digest
            );
          });
          return { method: 'POST', body, token };
        })()
      : { method: 'POST', body: manifest };
    const response = assetUploads.length
      ? await apiRequest<{
          project: ProjectSummary;
          workspace: unknown;
        }>('/workspaces/import-local-project', requestOptions)
      : await request<{
          project: ProjectSummary;
          workspace: unknown;
        }>(token, '/workspaces/import-local-project', requestOptions);
    const decoded = decodeWorkspaceSnapshot(response.workspace);
    return {
      project: response.project,
      ...decoded,
    };
  },

  getProject: async (
    token: string,
    projectId: string,
    options: RequestInit = {}
  ) =>
    request<{ project: ProjectSummary }>(
      token,
      `/projects/${encodeURIComponent(projectId)}`,
      options
    ),

  updateProject: async (
    token: string,
    projectId: string,
    data: {
      name?: string;
      description?: string;
    }
  ) =>
    request<{ project: ProjectSummary }>(
      token,
      `/projects/${encodeURIComponent(projectId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      }
    ),

  getWorkspace: async (
    token: string,
    workspaceId: string,
    options: RequestInit = {}
  ) => {
    const response = await request<{ workspace: unknown }>(
      token,
      `/workspaces/${encodeURIComponent(workspaceId)}`,
      options
    );
    return decodeWorkspaceSnapshot(response.workspace);
  },

  getWorkspaceCapabilities: async (
    token: string,
    workspaceId: string,
    options: RequestInit = {}
  ) =>
    request<WorkspaceCapabilitiesResponse>(
      token,
      `/workspaces/${encodeURIComponent(workspaceId)}/capabilities`,
      options
    ),

  listWorkspaceExecutionRoles: async (
    token: string,
    workspaceId: string,
    options: RequestInit = {}
  ): Promise<readonly WorkspaceExecutionRoleGrant[]> =>
    readWorkspaceExecutionRoleList(
      await request<unknown>(
        token,
        `/workspaces/${encodeURIComponent(workspaceId)}/execution-roles`,
        options
      )
    ),

  putWorkspaceExecutionRole: async (
    token: string,
    workspaceId: string,
    principalEmail: string,
    role: WorkspaceExecutionRole
  ): Promise<void> => {
    const email = principalEmail.trim().toLowerCase();
    if (!email || email.length > 320 || !email.includes('@')) {
      throw new TypeError('Workspace collaborator email is invalid.');
    }
    await request<void>(
      token,
      `/workspaces/${encodeURIComponent(workspaceId)}/execution-roles`,
      {
        method: 'PUT',
        body: JSON.stringify({ principalEmail: email, role }),
      }
    );
  },

  deleteWorkspaceExecutionRole: async (
    token: string,
    workspaceId: string,
    principalId: string
  ): Promise<void> => {
    const identity = principalId.trim();
    if (!identity || identity !== principalId || identity.length > 255) {
      throw new TypeError('Workspace collaborator identity is invalid.');
    }
    await request<void>(
      token,
      `/workspaces/${encodeURIComponent(workspaceId)}/execution-roles/${encodeURIComponent(identity)}`,
      { method: 'DELETE' }
    );
  },

  putWorkspaceAssetBlob: async (
    token: string,
    workspaceId: string,
    contents: Uint8Array,
    mediaType: string
  ): Promise<BinaryAssetBlobUploadResult> => {
    const expected = createBinaryAssetBlobReference({ contents, mediaType });
    const response = await request<{
      status: unknown;
      blob: unknown;
    }>(
      token,
      `/workspaces/${encodeURIComponent(workspaceId)}/asset-blobs/${encodeURIComponent(expected.digest)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': expected.mediaType },
        body: copyToArrayBuffer(contents),
      }
    );
    if (response.status !== 'stored' && response.status !== 'existing') {
      throw new TypeError('Workspace asset upload returned an invalid status.');
    }
    const reference = readBinaryAssetBlobReference(response.blob);
    if (
      reference.digest !== expected.digest ||
      reference.byteLength !== expected.byteLength ||
      reference.mediaType !== expected.mediaType
    ) {
      throw new TypeError('Workspace asset upload identity drifted.');
    }
    return Object.freeze({ kind: response.status, reference });
  },

  getWorkspaceAssetBlob: async (
    token: string,
    workspaceId: string,
    assetDocumentId: string,
    reference: BinaryAssetBlobReference,
    options: RequestInit = {}
  ): Promise<BinaryAssetMaterialization> => {
    const response = await apiBinaryRequest(
      `/workspaces/${encodeURIComponent(workspaceId)}/asset-blobs/${encodeURIComponent(reference.digest)}`,
      { ...options, token }
    );
    if (response.mediaType !== reference.mediaType) {
      throw new TypeError('Workspace asset response media type drifted.');
    }
    return createBinaryAssetMaterialization({
      assetDocumentId,
      reference,
      contents: response.contents,
    });
  },

  createWorkspaceAssetDeliverySession: async (
    token: string,
    workspaceId: string,
    source: BinaryAssetBlobReference,
    deliveryRequest: WorkspaceAssetDeliveryRequest,
    options: RequestInit = {}
  ): Promise<WorkspaceAssetDeliverySession> => {
    const reference = readBinaryAssetBlobReference(source);
    const sanitizedMediaType = workspaceAssetSanitizedMediaType(
      deliveryRequest.transform
    );
    if (
      (sanitizedMediaType !== undefined &&
        (reference.mediaType !== sanitizedMediaType ||
          deliveryRequest.disposition !== 'inline')) ||
      (sanitizedMediaType === undefined &&
        deliveryRequest.transform !== 'original') ||
      (deliveryRequest.disposition !== 'inline' &&
        deliveryRequest.disposition !== 'attachment')
    ) {
      throw new TypeError('Workspace asset delivery request is invalid.');
    }
    const response = await request<unknown>(
      token,
      `/workspaces/${encodeURIComponent(workspaceId)}/asset-blobs/${encodeURIComponent(reference.digest)}/delivery-sessions`,
      {
        ...options,
        method: 'POST',
        body: JSON.stringify(deliveryRequest),
      }
    );
    return readWorkspaceAssetDeliverySession(
      response,
      reference,
      deliveryRequest
    );
  },

  commitWorkspaceOperation: async (
    token: string,
    workspace: WorkspaceSnapshot,
    data: WorkspaceOperationCommitRequest,
    domainOperation: WorkspaceOperation
  ) => {
    const response = await request<unknown>(
      token,
      `/workspaces/${encodeURIComponent(workspace.id)}/operations/commit`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return decodeWorkspaceOperationCommitResponse(
      response,
      workspace,
      domainOperation
    );
  },

  commitWorkspaceSettings: async (
    token: string,
    workspace: WorkspaceSnapshot,
    data: WorkspaceSettingsCommitRequest
  ) => {
    const response = await request<unknown>(
      token,
      `/workspaces/${encodeURIComponent(workspace.id)}/settings/commit`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return decodeWorkspaceMutation(response, workspace);
  },

  publishProject: async (token: string, projectId: string) =>
    request<{ project: ProjectSummary }>(
      token,
      `/projects/${encodeURIComponent(projectId)}/publish`,
      {
        method: 'POST',
      }
    ),

  deleteProject: async (token: string, projectId: string) =>
    request<void>(token, `/projects/${encodeURIComponent(projectId)}`, {
      method: 'DELETE',
    }),
};
