/** Generates the standalone document-instance Data lifecycle projection. */
export const createPirDataOperationRuntimeSource =
  (): string => `type __PdxDataLifecycleSnapshotRequest = Readonly<{
  documentId: string;
  instancePath: string;
  dataId: string;
  binding: __PdxDataOperationBinding;
}>;

type __PdxDataBindingsActivationRequest = Readonly<{
  documentId: string;
  instancePath: string;
  currentRouteId?: string;
  bindingsByDataId: Readonly<Record<string, __PdxDataOperationBinding>>;
  runtimeValuesById: Readonly<Record<string, unknown>>;
}>;

type __PdxDocumentDataLifecycleProjection =
  | Readonly<{
      status: 'ready';
      dataById: Readonly<Record<string, unknown>>;
      lifecycleByDataId: Readonly<Record<string, __PdxDataLifecycleSnapshot>>;
    }>
  | Readonly<{
      status: 'blocked';
      issues: readonly __PdxCollectionProjectionIssue[];
    }>;

const __pdxProjectDocumentDataLifecycle = (
  runtime: __PdxRuntimePort,
  documentId: string,
  instancePath: string,
  bindingsByDataId: Readonly<Record<string, __PdxDataOperationBinding>>
): __PdxDocumentDataLifecycleProjection => {
  const dataById: Record<string, unknown> = {};
  const lifecycleByDataId: Record<string, __PdxDataLifecycleSnapshot> = {};
  const issues: __PdxCollectionProjectionIssue[] = [];
  for (const [dataId, binding] of Object.entries(bindingsByDataId).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
    const snapshot = runtime.resolveDataLifecycleSnapshot({
      documentId,
      instancePath,
      dataId,
      binding,
    });
    if (!snapshot) {
      issues.push(__pdxCollectionIssue(
        'PIR_DATA_LIFECYCLE_SNAPSHOT_UNAVAILABLE',
        \`/logic/dataById/\${dataId}\`,
        \`Data lifecycle snapshot is unavailable for local data binding "\${dataId}".\`
      ));
      continue;
    }
    if (
      snapshot.operation.documentId !== binding.operation.documentId ||
      snapshot.operation.operationId !== binding.operation.operationId
    ) {
      issues.push(__pdxCollectionIssue(
        'PIR_COLLECTION_DATA_OPERATION_MISMATCH',
        \`/logic/dataById/\${dataId}\`,
        \`Data lifecycle snapshot for "\${dataId}" does not match its durable operation reference.\`
      ));
      continue;
    }
    lifecycleByDataId[dataId] = snapshot;
    if (snapshot.status === 'success') dataById[dataId] = snapshot.value;
  }
  return issues.length > 0
    ? { status: 'blocked', issues }
    : { status: 'ready', dataById, lifecycleByDataId };
};`;
