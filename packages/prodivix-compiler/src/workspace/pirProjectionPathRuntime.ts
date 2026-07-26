import {
  appendPirProjectionComponentPath,
  appendPirProjectionSlotPath,
  createPirProjectionRootPath,
} from '@prodivix/pir';

const PARENT_PATH_MARKER = '__PRODIVIX_PARENT_PROJECTION_PATH__';

const toJson = (value: unknown): string => JSON.stringify(value) ?? 'null';

const compileStaticAppend = (
  parentPathExpression: string,
  append: (parentPath: string) => string
): string => {
  const projected = append(PARENT_PATH_MARKER);
  if (!projected.startsWith(PARENT_PATH_MARKER)) {
    throw new Error('PIR projection path helper changed its append ABI.');
  }
  return `(${parentPathExpression} + ${toJson(projected.slice(PARENT_PATH_MARKER.length))})`;
};

export const compilePirRootProjectionPath = (documentId: string): string =>
  toJson(createPirProjectionRootPath(documentId));

export const compilePirComponentProjectionPath = (
  parentPathExpression: string,
  sourceDocumentId: string,
  instanceNodeId: string,
  targetDocumentId: string
): string =>
  compileStaticAppend(parentPathExpression, (parentPath) =>
    appendPirProjectionComponentPath(
      parentPath,
      sourceDocumentId,
      instanceNodeId,
      targetDocumentId
    )
  );

export const compilePirSlotProjectionPath = (
  parentPathExpression: string,
  sourceDocumentId: string,
  instanceNodeId: string,
  slotMemberId: string
): string =>
  compileStaticAppend(parentPathExpression, (parentPath) =>
    appendPirProjectionSlotPath(
      parentPath,
      sourceDocumentId,
      instanceNodeId,
      slotMemberId
    )
  );

/** Standalone runtime mirror; conformance tests bind it to the canonical PIR ABI. */
export const PIR_PROJECTION_PATH_RUNTIME_SOURCE = `const __pdxEncodeProjectionPathSegment = (value: string): string => \`${'${value.length}:${value}'}\`;

const __pdxAppendCollectionItemPath = (
  instancePath: string,
  sourceDocumentId: string,
  collectionNodeId: string,
  keyIdentity: string
): string => \`${'${instancePath}/collection/${__pdxEncodeProjectionPathSegment(sourceDocumentId)}/${__pdxEncodeProjectionPathSegment(collectionNodeId)}/${__pdxEncodeProjectionPathSegment(keyIdentity)}'}\`;`;
