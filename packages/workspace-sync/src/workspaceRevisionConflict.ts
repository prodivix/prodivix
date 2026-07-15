import type { WorkspaceDocumentType } from '@prodivix/workspace';
import { isRecord } from './jsonValue';

export type WorkspaceRevisionConflictCode =
  'WKS-4001' | 'WKS-4002' | 'WKS-4003';

export type WorkspaceRemoteConflictType =
  'WORKSPACE_CONFLICT' | 'ROUTE_CONFLICT' | 'DOCUMENT_CONFLICT';

export type WorkspaceExpectedConflictRevisions = {
  workspaceRev?: number;
  routeRev?: number;
  document?: {
    id: string;
    contentRev?: number | null;
    metaRev?: number | null;
  };
};

export type WorkspaceServerConflictDocument = {
  id: string;
  type: WorkspaceDocumentType;
  path: string;
  contentRev: number;
  metaRev: number;
  updatedAt: string;
};

export type WorkspaceServerConflictRevisions = {
  workspaceRev: number;
  routeRev: number;
  opSeq: number;
  document?: WorkspaceServerConflictDocument | null;
};

export type WorkspaceRevisionConflictResponse = {
  code: WorkspaceRevisionConflictCode;
  conflictType: WorkspaceRemoteConflictType;
  workspaceId: string;
  expectedRevisions: WorkspaceExpectedConflictRevisions;
  serverRevisions: WorkspaceServerConflictRevisions;
  message: string;
  retryable?: boolean;
  requestId?: string;
};

export type WorkspaceRevisionConflictDecodeIssue = {
  code:
    | 'WKS_SYNC_CONFLICT_ENVELOPE_INVALID'
    | 'WKS_SYNC_CONFLICT_CODE_UNSUPPORTED'
    | 'WKS_SYNC_CONFLICT_DETAILS_INVALID';
  path: string;
  message: string;
};

export type WorkspaceRevisionConflictDecodeResult =
  | { ok: true; conflict: WorkspaceRevisionConflictResponse }
  | { ok: false; issues: WorkspaceRevisionConflictDecodeIssue[] };

const DOCUMENT_TYPES: ReadonlySet<WorkspaceDocumentType> = new Set([
  'pir-page',
  'pir-layout',
  'pir-component',
  'pir-graph',
  'pir-animation',
  'design-tokens',
  'design-token-resolver',
  'code',
  'asset',
  'project-config',
]);

const CONFLICT_CODES: ReadonlySet<string> = new Set([
  'WKS-4001',
  'WKS-4002',
  'WKS-4003',
]);

const CONFLICT_TYPES: ReadonlySet<string> = new Set([
  'WORKSPACE_CONFLICT',
  'ROUTE_CONFLICT',
  'DOCUMENT_CONFLICT',
]);

const hasOnlyKeys = (
  value: Record<string, unknown>,
  allowedKeys: readonly string[]
): boolean => Object.keys(value).every((key) => allowedKeys.includes(key));

const fail = (
  code: WorkspaceRevisionConflictDecodeIssue['code'],
  path: string,
  message: string
): WorkspaceRevisionConflictDecodeResult => ({
  ok: false,
  issues: [{ code, path, message }],
});

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && Boolean(value.trim());

const parseExpectedRevisions = (
  value: unknown
): WorkspaceExpectedConflictRevisions | null => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['workspaceRev', 'routeRev', 'document'])
  ) {
    return null;
  }
  if (
    value.workspaceRev !== undefined &&
    !isPositiveInteger(value.workspaceRev)
  ) {
    return null;
  }
  if (value.routeRev !== undefined && !isPositiveInteger(value.routeRev)) {
    return null;
  }
  let document: WorkspaceExpectedConflictRevisions['document'];
  if (value.document !== undefined) {
    const hasContentRev =
      isRecord(value.document) && Object.hasOwn(value.document, 'contentRev');
    const hasMetaRev =
      isRecord(value.document) && Object.hasOwn(value.document, 'metaRev');
    if (
      !isRecord(value.document) ||
      !hasOnlyKeys(value.document, ['id', 'contentRev', 'metaRev']) ||
      !isNonEmptyString(value.document.id) ||
      (value.document.contentRev !== undefined &&
        value.document.contentRev !== null &&
        !isPositiveInteger(value.document.contentRev)) ||
      (value.document.metaRev !== undefined &&
        value.document.metaRev !== null &&
        !isPositiveInteger(value.document.metaRev)) ||
      (value.document.contentRev === null || value.document.metaRev === null
        ? !hasContentRev ||
          !hasMetaRev ||
          value.document.contentRev !== null ||
          value.document.metaRev !== null
        : !hasContentRev && !hasMetaRev)
    ) {
      return null;
    }
    document = {
      id: value.document.id,
      ...(!hasContentRev ? {} : { contentRev: value.document.contentRev }),
      ...(!hasMetaRev ? {} : { metaRev: value.document.metaRev }),
    };
  }
  return {
    ...(value.workspaceRev === undefined
      ? {}
      : { workspaceRev: value.workspaceRev }),
    ...(value.routeRev === undefined ? {} : { routeRev: value.routeRev }),
    ...(document ? { document } : {}),
  };
};

const parseServerDocument = (
  value: unknown
): WorkspaceServerConflictDocument | null => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'id',
      'type',
      'path',
      'contentRev',
      'metaRev',
      'updatedAt',
    ]) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.type) ||
    !DOCUMENT_TYPES.has(value.type as WorkspaceDocumentType) ||
    !isNonEmptyString(value.path) ||
    !isPositiveInteger(value.contentRev) ||
    !isPositiveInteger(value.metaRev) ||
    !isNonEmptyString(value.updatedAt) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value.updatedAt
    ) ||
    Number.isNaN(Date.parse(value.updatedAt))
  ) {
    return null;
  }
  return {
    id: value.id,
    type: value.type as WorkspaceDocumentType,
    path: value.path,
    contentRev: value.contentRev,
    metaRev: value.metaRev,
    updatedAt: value.updatedAt,
  };
};

const parseServerRevisions = (
  value: unknown
): WorkspaceServerConflictRevisions | null => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['workspaceRev', 'routeRev', 'opSeq', 'document']) ||
    !isPositiveInteger(value.workspaceRev) ||
    !isPositiveInteger(value.routeRev) ||
    !isPositiveInteger(value.opSeq)
  ) {
    return null;
  }
  const hasDocument = Object.hasOwn(value, 'document');
  const document = !hasDocument
    ? undefined
    : value.document === null
      ? null
      : parseServerDocument(value.document);
  if (hasDocument && value.document !== null && !document) return null;
  return {
    workspaceRev: value.workspaceRev,
    routeRev: value.routeRev,
    opSeq: value.opSeq,
    ...(hasDocument ? { document } : {}),
  };
};

const conflictCodeMatchesType = (
  code: WorkspaceRevisionConflictCode,
  conflictType: WorkspaceRemoteConflictType
): boolean =>
  (conflictType === 'WORKSPACE_CONFLICT' && code === 'WKS-4001') ||
  (conflictType === 'ROUTE_CONFLICT' && code === 'WKS-4002') ||
  (conflictType === 'DOCUMENT_CONFLICT' && code === 'WKS-4003');

const documentConflictHasMismatch = (
  expected: NonNullable<WorkspaceExpectedConflictRevisions['document']>,
  current: WorkspaceServerConflictDocument | null
): boolean => {
  const expectsAbsence =
    expected.contentRev === null && expected.metaRev === null;
  if (current === null) return !expectsAbsence;
  if (expectsAbsence) return true;
  return (
    (typeof expected.contentRev === 'number' &&
      expected.contentRev !== current.contentRev) ||
    (typeof expected.metaRev === 'number' &&
      expected.metaRev !== current.metaRev)
  );
};

/** Strictly decodes the canonical backend ErrorEnvelope for revision conflicts. */
export const decodeWorkspaceRevisionConflict = (
  input: unknown
): WorkspaceRevisionConflictDecodeResult => {
  if (
    !isRecord(input) ||
    !hasOnlyKeys(input, ['error']) ||
    !isRecord(input.error)
  ) {
    return fail(
      'WKS_SYNC_CONFLICT_ENVELOPE_INVALID',
      '/error',
      'Expected the canonical Backend ErrorEnvelope.'
    );
  }
  const error = input.error;
  if (!isNonEmptyString(error.code) || !CONFLICT_CODES.has(error.code)) {
    return fail(
      'WKS_SYNC_CONFLICT_CODE_UNSUPPORTED',
      '/error/code',
      'Expected a WKS-4001, WKS-4002, or WKS-4003 revision conflict code.'
    );
  }
  if (!isNonEmptyString(error.message)) {
    return fail(
      'WKS_SYNC_CONFLICT_ENVELOPE_INVALID',
      '/error/message',
      'Conflict envelopes must include a non-empty message.'
    );
  }
  if (!isRecord(error.details)) {
    return fail(
      'WKS_SYNC_CONFLICT_DETAILS_INVALID',
      '/error/details',
      'Conflict envelopes must include structured revision details.'
    );
  }
  const details = error.details;
  if (
    !hasOnlyKeys(details, [
      'conflictType',
      'workspaceId',
      'expected',
      'current',
    ])
  ) {
    return fail(
      'WKS_SYNC_CONFLICT_DETAILS_INVALID',
      '/error/details',
      'Conflict details contain unsupported fields.'
    );
  }
  if (
    !isNonEmptyString(details.conflictType) ||
    !CONFLICT_TYPES.has(details.conflictType)
  ) {
    return fail(
      'WKS_SYNC_CONFLICT_DETAILS_INVALID',
      '/error/details/conflictType',
      'Conflict type is missing or unsupported.'
    );
  }
  if (!isNonEmptyString(details.workspaceId)) {
    return fail(
      'WKS_SYNC_CONFLICT_DETAILS_INVALID',
      '/error/details/workspaceId',
      'Conflict workspaceId is required.'
    );
  }
  const expectedRevisions = parseExpectedRevisions(details.expected);
  if (!expectedRevisions) {
    return fail(
      'WKS_SYNC_CONFLICT_DETAILS_INVALID',
      '/error/details/expected',
      'Expected revision details are invalid.'
    );
  }
  const serverRevisions = parseServerRevisions(details.current);
  if (!serverRevisions) {
    return fail(
      'WKS_SYNC_CONFLICT_DETAILS_INVALID',
      '/error/details/current',
      'Current server revision details are invalid.'
    );
  }
  const code = error.code as WorkspaceRevisionConflictCode;
  const conflictType = details.conflictType as WorkspaceRemoteConflictType;
  if (!conflictCodeMatchesType(code, conflictType)) {
    return fail(
      'WKS_SYNC_CONFLICT_DETAILS_INVALID',
      '/error/details/conflictType',
      'Conflict code and conflictType do not describe the same partition.'
    );
  }
  if (conflictType === 'WORKSPACE_CONFLICT') {
    if (expectedRevisions.workspaceRev === undefined) {
      return fail(
        'WKS_SYNC_CONFLICT_DETAILS_INVALID',
        '/error/details/expected',
        'Expected revisions must include the conflicted partition.'
      );
    }
    if (expectedRevisions.workspaceRev === serverRevisions.workspaceRev) {
      return fail(
        'WKS_SYNC_CONFLICT_DETAILS_INVALID',
        '/error/details/current/workspaceRev',
        'Workspace conflict revisions must differ.'
      );
    }
  }
  if (conflictType === 'ROUTE_CONFLICT') {
    if (
      expectedRevisions.workspaceRev === undefined ||
      expectedRevisions.routeRev === undefined
    ) {
      return fail(
        'WKS_SYNC_CONFLICT_DETAILS_INVALID',
        '/error/details/expected',
        'Route conflicts require workspace and route revision baselines.'
      );
    }
    if (expectedRevisions.routeRev === serverRevisions.routeRev) {
      return fail(
        'WKS_SYNC_CONFLICT_DETAILS_INVALID',
        '/error/details/current/routeRev',
        'Route conflict revisions must differ.'
      );
    }
  }
  if (conflictType === 'DOCUMENT_CONFLICT') {
    const hasCurrentDocument = Object.hasOwn(serverRevisions, 'document');
    if (
      !expectedRevisions.document ||
      (!Object.hasOwn(expectedRevisions.document, 'contentRev') &&
        !Object.hasOwn(expectedRevisions.document, 'metaRev')) ||
      !hasCurrentDocument
    ) {
      return fail(
        'WKS_SYNC_CONFLICT_DETAILS_INVALID',
        '/error/details/current/document',
        'Document conflicts must include expected and current document revisions.'
      );
    }
    if (
      serverRevisions.document &&
      expectedRevisions.document.id !== serverRevisions.document.id
    ) {
      return fail(
        'WKS_SYNC_CONFLICT_DETAILS_INVALID',
        '/error/details/current/document/id',
        'Expected and current document ids must match.'
      );
    }
    if (
      !documentConflictHasMismatch(
        expectedRevisions.document,
        serverRevisions.document ?? null
      )
    ) {
      return fail(
        'WKS_SYNC_CONFLICT_DETAILS_INVALID',
        '/error/details/current/document',
        'Document conflict revisions must differ.'
      );
    }
  } else if (
    expectedRevisions.document !== undefined ||
    Object.hasOwn(serverRevisions, 'document')
  ) {
    return fail(
      'WKS_SYNC_CONFLICT_DETAILS_INVALID',
      '/error/details/current/document',
      'Only document conflicts may include document revisions.'
    );
  }
  if (error.domain !== undefined && error.domain !== 'workspace') {
    return fail(
      'WKS_SYNC_CONFLICT_ENVELOPE_INVALID',
      '/error/domain',
      'Workspace revision conflicts must use the workspace domain.'
    );
  }
  if (
    error.severity !== undefined &&
    !['info', 'warning', 'error', 'fatal'].includes(String(error.severity))
  ) {
    return fail(
      'WKS_SYNC_CONFLICT_ENVELOPE_INVALID',
      '/error/severity',
      'severity is invalid.'
    );
  }
  if (error.retryable !== undefined && typeof error.retryable !== 'boolean') {
    return fail(
      'WKS_SYNC_CONFLICT_ENVELOPE_INVALID',
      '/error/retryable',
      'retryable must be a boolean when present.'
    );
  }
  if (error.requestId !== undefined && !isNonEmptyString(error.requestId)) {
    return fail(
      'WKS_SYNC_CONFLICT_ENVELOPE_INVALID',
      '/error/requestId',
      'requestId must be a non-empty string when present.'
    );
  }
  return {
    ok: true,
    conflict: {
      code,
      conflictType,
      workspaceId: details.workspaceId,
      expectedRevisions,
      serverRevisions,
      message: error.message,
      ...(error.retryable === undefined ? {} : { retryable: error.retryable }),
      ...(error.requestId === undefined ? {} : { requestId: error.requestId }),
    },
  };
};
