import { validatePirDocument } from '@prodivix/pir';
import type {
  WorkspaceDocument,
  WorkspaceDocumentType,
  WorkspaceValidationIssue,
} from './types';
import { isWorkspaceCodeDocumentContent } from './workspaceCodeDocument';
import {
  isWorkspaceAssetDocumentContent,
  isWorkspaceProjectConfigDocumentContent,
} from './workspaceResourceDocument';
import { isCanonicalWorkspaceAnimationDocumentContent } from './workspaceAnimationDocument';
import { isCanonicalWorkspaceNodeGraphDocumentContent } from './workspaceNodeGraphDocument';
import { tryNormalizeWorkspacePirContent } from './workspacePirContent';

const WORKSPACE_DOCUMENT_TYPES: ReadonlySet<WorkspaceDocumentType> = new Set([
  'pir-page',
  'pir-layout',
  'pir-component',
  'pir-graph',
  'pir-animation',
  'code',
  'asset',
  'project-config',
]);

const PIR_DOCUMENT_TYPES: ReadonlySet<WorkspaceDocumentType> = new Set([
  'pir-page',
  'pir-layout',
  'pir-component',
]);

const WORKSPACE_DOCUMENT_FIELDS = new Set([
  'id',
  'type',
  'name',
  'path',
  'contentRev',
  'metaRev',
  'content',
  'updatedAt',
  'capabilities',
]);

const escapePointerSegment = (segment: string): string =>
  segment.replaceAll('~', '~0').replaceAll('/', '~1');

export const isPlainWorkspaceRecord = (
  value: unknown
): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const isCanonicalWorkspaceDocumentPath = (
  value: unknown
): value is string => {
  if (
    typeof value !== 'string' ||
    value !== value.trim() ||
    value === '/' ||
    !value.startsWith('/') ||
    value.includes('\\')
  ) {
    return false;
  }
  return value
    .slice(1)
    .split('/')
    .every(
      (segment) => segment.length > 0 && segment !== '.' && segment !== '..'
    );
};

const RFC3339_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/;

const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const daysInMonth = (year: number, month: number): number =>
  [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
    month - 1
  ] ?? 0;

export const isValidWorkspaceDocumentName = (value: unknown): value is string =>
  typeof value === 'string' && Boolean(value.trim());

export const isCanonicalWorkspaceDocumentUpdatedAt = (
  value: unknown
): value is string => {
  if (typeof value !== 'string' || value !== value.trim()) return false;
  const match = RFC3339_TIMESTAMP.exec(value);
  if (!match) return false;
  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw, secondRaw] = match;
  const offsetHourRaw = match[8];
  const offsetMinuteRaw = match[9];
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  const second = Number(secondRaw);
  const offsetHour = offsetHourRaw === undefined ? 0 : Number(offsetHourRaw);
  const offsetMinute =
    offsetMinuteRaw === undefined ? 0 : Number(offsetMinuteRaw);
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month) &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 23 &&
    offsetMinute <= 59
  );
};

const compareUnicodeCodePoints = (left: string, right: string): number => {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0) ?? 0);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftPoints[index]! - rightPoints[index]!;
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
};

export const isCanonicalPirDocumentContent = (content: unknown): boolean => {
  const decoded = tryNormalizeWorkspacePirContent(content);
  return decoded.ok && validatePirDocument(decoded.value).valid;
};

const isValidDocumentContent = (
  document: Record<string, unknown>,
  documentType: WorkspaceDocumentType
): boolean => {
  if (!Object.hasOwn(document, 'content') || document.content === undefined) {
    return false;
  }
  if (PIR_DOCUMENT_TYPES.has(documentType)) {
    return isCanonicalPirDocumentContent(document.content);
  }
  if (documentType === 'pir-animation') {
    return isCanonicalWorkspaceAnimationDocumentContent(document.content);
  }
  if (documentType === 'pir-graph') {
    return isCanonicalWorkspaceNodeGraphDocumentContent(document.content);
  }
  if (documentType === 'asset') {
    return isWorkspaceAssetDocumentContent(document.content);
  }
  if (documentType === 'project-config') {
    return isWorkspaceProjectConfigDocumentContent(document.content);
  }
  if (documentType !== 'code') return true;
  if (!isWorkspaceCodeDocumentContent(document.content)) return false;
  const content = document.content as unknown as Record<string, unknown>;
  return (
    Boolean((content.language as string).trim()) &&
    (content.metadata === undefined || isPlainWorkspaceRecord(content.metadata))
  );
};

export const validateWorkspaceDocumentRecord = (
  documentId: string,
  value: WorkspaceDocument
): WorkspaceValidationIssue[] => {
  const issues: WorkspaceValidationIssue[] = [];
  const path = `/docsById/${escapePointerSegment(documentId)}`;
  if (!isPlainWorkspaceRecord(value)) {
    return [
      {
        code: 'WKS_DOCUMENT_TYPE_INVALID',
        path,
        message: 'Workspace documents must be objects with a supported type.',
        documentId,
      },
    ];
  }

  const unknownField = Object.keys(value).find(
    (field) => !WORKSPACE_DOCUMENT_FIELDS.has(field)
  );
  if (unknownField) {
    issues.push({
      code: 'WKS_DOCUMENT_FIELD_INVALID',
      path: `${path}/${escapePointerSegment(unknownField)}`,
      message: `Workspace document field ${unknownField} is not part of the canonical wire model.`,
      documentId,
    });
  }
  if (
    typeof value.id !== 'string' ||
    !value.id ||
    value.id !== value.id.trim() ||
    value.id !== documentId
  ) {
    issues.push({
      code: 'WKS_DOCUMENT_ID_MISMATCH',
      path: `${path}/id`,
      message: 'docsById key must match a non-empty canonical document.id.',
      documentId,
    });
  }
  if (value.name !== undefined && !isValidWorkspaceDocumentName(value.name)) {
    issues.push({
      code: 'WKS_DOCUMENT_NAME_INVALID',
      path: `${path}/name`,
      message:
        'Workspace document name must be a non-empty string when present.',
      documentId,
    });
  }

  const documentType = value.type;
  if (
    typeof documentType !== 'string' ||
    !WORKSPACE_DOCUMENT_TYPES.has(documentType as WorkspaceDocumentType)
  ) {
    issues.push({
      code: 'WKS_DOCUMENT_TYPE_INVALID',
      path: `${path}/type`,
      message: 'Workspace document type is not supported.',
      documentId,
    });
  } else if (!isValidDocumentContent(value, documentType)) {
    issues.push({
      code: 'WKS_DOCUMENT_CONTENT_INVALID',
      path: `${path}/content`,
      message: 'Workspace document content does not match its document type.',
      documentId,
    });
  }

  if (
    !Number.isSafeInteger(value.contentRev) ||
    (value.contentRev as number) <= 0 ||
    !Number.isSafeInteger(value.metaRev) ||
    (value.metaRev as number) <= 0
  ) {
    issues.push({
      code: 'WKS_DOCUMENT_REVISION_INVALID',
      path,
      message: 'Workspace document revisions must be positive safe integers.',
      documentId,
    });
  }
  if (!isCanonicalWorkspaceDocumentPath(value.path)) {
    issues.push({
      code: 'WKS_DOCUMENT_PATH_INVALID',
      path: `${path}/path`,
      message:
        'Workspace document path must be an absolute canonical VFS path.',
      documentId,
    });
  }
  if (
    value.updatedAt !== undefined &&
    !isCanonicalWorkspaceDocumentUpdatedAt(value.updatedAt)
  ) {
    issues.push({
      code: 'WKS_DOCUMENT_UPDATED_AT_INVALID',
      path: `${path}/updatedAt`,
      message:
        'Workspace document updatedAt must be an RFC3339 timestamp when present.',
      documentId,
    });
  }

  const capabilities = value.capabilities;
  if (capabilities === undefined) return issues;
  const canonicalCapabilities = Array.isArray(capabilities)
    ? [...capabilities].sort(compareUnicodeCodePoints)
    : [];
  if (
    !Array.isArray(capabilities) ||
    capabilities.length === 0 ||
    capabilities.some(
      (capability) =>
        typeof capability !== 'string' ||
        !capability ||
        capability !== capability.trim()
    ) ||
    new Set(capabilities).size !== capabilities.length ||
    capabilities.some(
      (capability, index) => capability !== canonicalCapabilities[index]
    )
  ) {
    issues.push({
      code: 'WKS_DOCUMENT_CAPABILITIES_INVALID',
      path: `${path}/capabilities`,
      message:
        'Workspace document capabilities must be non-empty trimmed unique strings sorted by Unicode code point; omit an empty list.',
      documentId,
    });
  }
  return issues;
};
