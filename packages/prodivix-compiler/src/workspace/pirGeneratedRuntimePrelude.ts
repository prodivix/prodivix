import { createPirCollectionRuntimeSource } from '#src/workspace/pirCollectionRuntime';
import { createPirDataOperationRuntimeSource } from '#src/workspace/pirDataOperationRuntime';
import { PIR_PROJECTION_PATH_RUNTIME_SOURCE } from '#src/workspace/pirProjectionPathRuntime';

/**
 * The generated runtime prelude every compiled PIR module shares.
 *
 * It is plain TypeScript — scope shape, runtime port, path reader, collection
 * and data-operation runtimes — so both framework targets emit byte-identical
 * semantics. The one framework-shaped piece is the Collection issue reporter,
 * which is an actual component and therefore supplied by the target's shell.
 */
export const createPirGeneratedRuntimePrelude = (
  collectionIssueReporterSource: string
): string =>
  `type __PdxScope = Readonly<{
  paramsById: Readonly<Record<string, unknown>>;
  stateById: Readonly<Record<string, unknown>>;
  dataById: Readonly<Record<string, unknown>>;
  dataLifecycleById: Readonly<Record<string, __PdxDataLifecycleSnapshot>>;
  collectionSymbolsById: Readonly<Record<string, unknown>>;
  componentPropsById: Readonly<Record<string, unknown>>;
  componentVariantsById: Readonly<Record<string, unknown>>;
  slotPropsById: Readonly<Record<string, unknown>>;
}>;

type __PdxSourceSpan = Readonly<{
  artifactId: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}>;

type __PdxCodeReference = Readonly<{
  artifactId: string;
  exportName?: string;
  symbolId?: string;
  sourceSpan?: __PdxSourceSpan;
}>;

type __PdxRuntimePort = Readonly<{
  dispatchTrigger(input: Readonly<{ binding: unknown; payload: unknown; scope: __PdxScope; runtimeValuesById: Readonly<Record<string, unknown>>; setStateById: __PdxStateUpdater; source: Readonly<{ documentId: string; nodeId: string; eventName: string; instancePath: string }> }>): void;
  resolveCollectionPreviewState?(location: __PdxCollectionLocation): __PdxCollectionPreviewInput | undefined;
  reportCollectionProjectionIssues?(input: Readonly<{ location: __PdxCollectionLocation; issues: readonly __PdxCollectionProjectionIssue[] }>): void;
  resolveDataLifecycleSnapshot(request: __PdxDataLifecycleSnapshotRequest): __PdxDataLifecycleSnapshot | undefined;
  activateDataBindings?(request: __PdxDataBindingsActivationRequest): void | Promise<void>;
  subscribeDataLifecycle?(listener: () => void): () => void;
  resolveCodeValue(reference: __PdxCodeReference, scope: __PdxScope): unknown;
}>;

type __PdxStateUpdater = (stateId: string, value: unknown) => void;

type __PdxSlotRenderer = (
  slotPropsById: Readonly<Record<string, unknown>>,
  outletInstancePath: string
) => any;

type __PdxRouteOutletRenderer = (outletInstancePath: string) => any;

type __PdxModuleProps = Readonly<{
  __pdxRuntime: __PdxRuntimePort;
  __pdxInstancePath?: string;
  __pdxRouteId?: string;
  __pdxParamsById?: Readonly<Record<string, unknown>>;
  __pdxPropsById?: Readonly<Record<string, unknown>>;
  __pdxEventsById?: Readonly<Record<string, (payload: unknown) => void>>;
  __pdxVariantsById?: Readonly<Record<string, string | undefined>>;
  __pdxSlotsById?: Readonly<Record<string, __PdxSlotRenderer>>;
  __pdxRouteOutletsById?: Readonly<Record<string, __PdxRouteOutletRenderer>>;
}>;

const __pdxReadPath = (source: unknown, path: string): unknown => {
  const tokens = Array.from(path.trim().matchAll(/[^.[\\]]+|\\[(\\d+)\\]/g)).map((token) => token[1] ?? token[0]);
  let cursor = source;
  for (const token of tokens) {
    if (cursor === null || cursor === undefined) return undefined;
    if (Array.isArray(cursor)) {
      const index = Number(token);
      if (!Number.isInteger(index)) return undefined;
      cursor = cursor[index];
      continue;
    }
    if (typeof cursor !== 'object' || Array.isArray(cursor)) return undefined;
    cursor = (cursor as Record<string, unknown>)[token];
  }
  return cursor;
};

const __pdxMergeData = (base: unknown, extension: Readonly<Record<string, unknown>>): unknown => ({
  ...(base && typeof base === 'object' && !Array.isArray(base) ? base as Record<string, unknown> : {}),
  ...extension,
});

const __pdxRenderValue = (value: unknown): any => value;

${createPirCollectionRuntimeSource()}

${collectionIssueReporterSource}

${createPirDataOperationRuntimeSource()}

${PIR_PROJECTION_PATH_RUNTIME_SOURCE}`;
