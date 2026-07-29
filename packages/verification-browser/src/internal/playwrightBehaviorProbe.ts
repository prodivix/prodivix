import type { BehaviorScenarioProgram } from '@prodivix/behavior';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import { digestVerificationValue } from '@prodivix/verification';
import type { Locator, Page } from 'playwright-core';
import {
  SEMANTIC_ELEMENT_SELECTOR,
  VERIFICATION_PROBE_CANARY,
  VERIFICATION_PROBE_ENDPOINT,
} from './playwrightBrowserShared';
import {
  resolveTrustedSemanticTargetIndex,
  type TrustedPageProbeBinding,
  type TrustedSemanticTargetIdentity,
} from './playwrightTrustedPageProbe';

export type BrowserProbeTarget = Readonly<{
  targetId: string;
  ready: boolean;
  match: 'none' | 'single' | 'multiple';
  sourceTrace: Readonly<{
    workspaceDocumentId: string;
    path: string;
  }>;
  instanceScope?: Readonly<{
    kind: 'collection-item';
    id: string;
  }>;
  nodeId?: string;
  sourceTraceDigest: string;
}>;

export type SemanticTarget = BrowserProbeTarget &
  Readonly<{
    nodeId: string;
    locator: Locator;
  }>;

const decodePointerSegment = (value: string): string | undefined =>
  /~(?![01])/u.test(value)
    ? undefined
    : value.replaceAll('~1', '/').replaceAll('~0', '~');

const nodeIdForSource = (path: string): string | undefined => {
  if (!path.startsWith('/')) return undefined;
  const segments = path.slice(1).split('/');
  const encodedNodeId =
    segments[0] === 'nodesById'
      ? segments[1]
      : segments[0] === 'ui' &&
          segments[1] === 'graph' &&
          segments[2] === 'nodesById'
        ? segments[3]
        : undefined;
  return encodedNodeId === undefined
    ? undefined
    : decodePointerSegment(encodedNodeId);
};

const validProbeText = (
  value: unknown,
  maximumLength: number
): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= maximumLength &&
  value === value.trim() &&
  value === value.normalize('NFC') &&
  !Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });

export const readProbeTarget = async (
  page: Page,
  targetId: string
): Promise<BrowserProbeTarget | undefined> => {
  const candidate = await page.evaluate(
    ({ canary, endpoint, requestedTargetId }) => {
      const root = globalThis as unknown as Record<string, unknown>;
      const value = root[endpoint];
      if (typeof value !== 'object' || value === null) return undefined;
      const probe = value as {
        canary?: unknown;
        readTarget?: unknown;
      };
      if (probe.canary !== canary || typeof probe.readTarget !== 'function') {
        return undefined;
      }
      const result = (probe.readTarget as (targetIdentity: string) => unknown)(
        requestedTargetId
      );
      if (typeof result !== 'object' || result === null) return undefined;
      const record = result as Record<string, unknown>;
      const state =
        typeof record.state === 'object' && record.state !== null
          ? (record.state as Record<string, unknown>)
          : undefined;
      const sourceTrace =
        typeof record.sourceTrace === 'object' && record.sourceTrace !== null
          ? (record.sourceTrace as Record<string, unknown>)
          : undefined;
      const instanceScope =
        typeof record.instanceScope === 'object' &&
        record.instanceScope !== null
          ? (record.instanceScope as Record<string, unknown>)
          : undefined;
      return {
        targetId: record.targetId,
        ready: record.ready,
        match: state?.match,
        sourceTrace: sourceTrace
          ? {
              workspaceDocumentId: sourceTrace.workspaceDocumentId,
              path: sourceTrace.path,
            }
          : undefined,
        ...(instanceScope === undefined
          ? {}
          : {
              instanceScope: {
                kind: instanceScope.kind,
                id: instanceScope.id,
              },
            }),
      };
    },
    {
      canary: VERIFICATION_PROBE_CANARY,
      endpoint: VERIFICATION_PROBE_ENDPOINT,
      requestedTargetId: targetId,
    }
  );
  if (
    !isPlainObject(candidate) ||
    candidate.targetId !== targetId ||
    typeof candidate.ready !== 'boolean' ||
    !['none', 'single', 'multiple'].includes(String(candidate.match)) ||
    !isPlainObject(candidate.sourceTrace) ||
    !validProbeText(candidate.sourceTrace.workspaceDocumentId, 512) ||
    !validProbeText(candidate.sourceTrace.path, 2_048) ||
    (candidate.instanceScope !== undefined &&
      (!isPlainObject(candidate.instanceScope) ||
        Reflect.ownKeys(candidate.instanceScope).length !== 2 ||
        candidate.instanceScope.kind !== 'collection-item' ||
        !validProbeText(candidate.instanceScope.id, 512)))
  ) {
    return undefined;
  }
  const sourceTrace = Object.freeze({
    workspaceDocumentId: candidate.sourceTrace.workspaceDocumentId,
    path: candidate.sourceTrace.path,
  });
  const nodeId = nodeIdForSource(sourceTrace.path);
  return Object.freeze({
    targetId,
    ready: candidate.ready,
    match: candidate.match as BrowserProbeTarget['match'],
    sourceTrace,
    ...(candidate.instanceScope === undefined
      ? {}
      : {
          instanceScope: Object.freeze({
            kind: 'collection-item' as const,
            id: candidate.instanceScope.id as string,
          }),
        }),
    ...(nodeId === undefined ? {} : { nodeId }),
    sourceTraceDigest: digestVerificationValue(sourceTrace),
  });
};

export const collectionItemPathSuffix = (id: string): string => {
  const keyIdentity = `key/6:string/${id.length}:${id}`;
  return `/${keyIdentity.length}:${keyIdentity}`;
};

export const listProbeTargets = async (
  page: Page
): Promise<readonly BrowserProbeTarget[]> => {
  const targetIds = await page.evaluate(
    ({ canary, endpoint }) => {
      const root = globalThis as unknown as Record<string, unknown>;
      const value = root[endpoint];
      if (typeof value !== 'object' || value === null) return [];
      const probe = value as {
        canary?: unknown;
        listTargets?: unknown;
      };
      if (probe.canary !== canary || typeof probe.listTargets !== 'function') {
        return [];
      }
      const entries = (probe.listTargets as () => unknown)();
      if (!Array.isArray(entries) || entries.length > 2_048) return [];
      return entries.flatMap((entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as Record<string, unknown>).targetId === 'string'
          ? [(entry as Record<string, unknown>).targetId as string]
          : []
      );
    },
    {
      canary: VERIFICATION_PROBE_CANARY,
      endpoint: VERIFICATION_PROBE_ENDPOINT,
    }
  );
  const uniqueTargetIds = [...new Set(targetIds)].sort(
    compareUnicodeCodePoints
  );
  const targets = await Promise.all(
    uniqueTargetIds.map((targetId) => readProbeTarget(page, targetId))
  );
  return Object.freeze(
    targets.filter(
      (target): target is BrowserProbeTarget => target !== undefined
    )
  );
};

export const semanticTargetIdentity = (
  targetManifest: BehaviorScenarioProgram['targetManifest'],
  targetId: string
):
  | Readonly<{
      target: BrowserProbeTarget;
      identity: TrustedSemanticTargetIdentity;
    }>
  | undefined => {
  const entry = targetManifest.find(
    (candidate) => candidate.targetId === targetId
  );
  if (
    entry === undefined ||
    !validProbeText(entry.source.workspaceDocumentId, 512) ||
    !validProbeText(entry.source.path, 2_048) ||
    (entry.instanceScope !== undefined &&
      (entry.instanceScope.kind !== 'collection-item' ||
        !validProbeText(entry.instanceScope.id, 512)))
  ) {
    return undefined;
  }
  const nodeId = nodeIdForSource(entry.source.path);
  if (nodeId === undefined || !validProbeText(nodeId, 512)) return undefined;
  const sourceTrace = Object.freeze({ ...entry.source });
  const instanceScope =
    entry.instanceScope === undefined
      ? undefined
      : Object.freeze({
          kind: 'collection-item' as const,
          id: entry.instanceScope.id,
        });
  return Object.freeze({
    target: Object.freeze({
      targetId,
      ready: true,
      match: 'single' as const,
      sourceTrace,
      ...(instanceScope === undefined ? {} : { instanceScope }),
      nodeId,
      sourceTraceDigest: digestVerificationValue(sourceTrace),
    }),
    identity: Object.freeze({
      targetId,
      documentId: sourceTrace.workspaceDocumentId,
      nodeId,
      ...(instanceScope === undefined
        ? {}
        : { instancePathSuffix: collectionItemPathSuffix(instanceScope.id) }),
    }),
  });
};

export const semanticLocator = async (
  page: Page,
  targetId: string,
  targetManifest: BehaviorScenarioProgram['targetManifest'],
  trustedProbe: TrustedPageProbeBinding
): Promise<SemanticTarget | undefined> => {
  const resolved = semanticTargetIdentity(targetManifest, targetId);
  if (resolved === undefined) return undefined;
  const index = await resolveTrustedSemanticTargetIndex(
    page,
    trustedProbe,
    resolved.identity
  );
  if (index === undefined) return undefined;
  return Object.freeze({
    ...resolved.target,
    nodeId: resolved.identity.nodeId,
    locator: page.locator(SEMANTIC_ELEMENT_SELECTOR).nth(index),
  });
};
