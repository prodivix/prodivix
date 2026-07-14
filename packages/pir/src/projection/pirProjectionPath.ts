const encodePathSegment = (value: string): string => `${value.length}:${value}`;

/** Creates the stable execution path root for one projected PIR document. */
export const createPirProjectionRootPath = (documentId: string): string =>
  `root/${encodePathSegment(documentId)}`;

export const appendPirProjectionComponentPath = (
  parentPath: string,
  sourceDocumentId: string,
  instanceNodeId: string,
  targetDocumentId: string
): string =>
  `${parentPath}/component/${encodePathSegment(sourceDocumentId)}/${encodePathSegment(instanceNodeId)}/${encodePathSegment(targetDocumentId)}`;

export const appendPirProjectionSlotPath = (
  parentPath: string,
  consumerDocumentId: string,
  instanceNodeId: string,
  slotMemberId: string
): string =>
  `${parentPath}/slot/${encodePathSegment(consumerDocumentId)}/${encodePathSegment(instanceNodeId)}/${encodePathSegment(slotMemberId)}`;

export const appendPirProjectionCollectionItemPath = (
  parentPath: string,
  sourceDocumentId: string,
  collectionNodeId: string,
  keyIdentity: string
): string =>
  `${parentPath}/collection/${encodePathSegment(sourceDocumentId)}/${encodePathSegment(collectionNodeId)}/${encodePathSegment(keyIdentity)}`;
