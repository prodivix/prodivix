import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPirProjectionRootPath } from '@prodivix/pir';
import type { PIRCollectionProjectionLocation } from '@prodivix/pir';
import { PIRDocumentProjection } from './document/PIRDocumentProjection';
import type {
  PIRRendererBlockingIssue,
  PIRRendererProps,
} from './PIRRenderer.types';
import {
  createPirCollectionLocationIdentity,
  type PIRProjectionRuntime,
} from './runtime/pirProjectionRuntime';
import { resolvePirRendererHost } from './host/pirRendererHost';

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const compareBlockingIssues = (
  left: PIRRendererBlockingIssue,
  right: PIRRendererBlockingIssue
): number =>
  compareText(left.path, right.path) ||
  compareText(left.instancePath ?? '', right.instancePath ?? '') ||
  compareText(left.code, right.code) ||
  compareText(left.causeCode ?? '', right.causeCode ?? '') ||
  compareText(left.message, right.message);

const haveSameBlockingIssues = (
  left: readonly PIRRendererBlockingIssue[] | undefined,
  right: readonly PIRRendererBlockingIssue[]
): boolean =>
  left?.length === right.length &&
  left.every(
    (issue, index) =>
      issue.code === right[index]?.code &&
      issue.causeCode === right[index]?.causeCode &&
      issue.path === right[index]?.path &&
      issue.message === right[index]?.message &&
      issue.documentId === right[index]?.documentId &&
      issue.nodeId === right[index]?.nodeId &&
      issue.instancePath === right[index]?.instancePath
  );

/**
 * Projects a revision-bound Workspace PIR plan into React.
 * Workspace owns resolution/validation; this adapter owns only runtime scope
 * isolation, host projection, events, and source locations.
 */
export const PIRRenderer: React.FC<PIRRendererProps> = ({
  plan,
  host,
  rootParamsById,
  rootStateById,
  rootDataById,
  rootComponentPropsById,
  rootComponentVariantsById,
  resolveCollectionPreviewState,
  dispatchTrigger,
  selectedLocation,
  hiddenLocations,
  onNodeSelect,
  onBlockingIssues,
}) => {
  const hostResolution = useMemo(
    () => resolvePirRendererHost(plan, host),
    [host, plan]
  );
  const [collectionIssueState, setCollectionIssueState] = useState<{
    plan: PIRRendererProps['plan'];
    byLocation: Readonly<Record<string, readonly PIRRendererBlockingIssue[]>>;
  }>({ plan, byLocation: {} });
  const reportCollectionBlockingIssues = useCallback(
    (
      location: PIRCollectionProjectionLocation,
      issues: readonly PIRRendererBlockingIssue[]
    ) => {
      const identity = createPirCollectionLocationIdentity(location);
      const sorted = [...issues].sort(compareBlockingIssues);
      setCollectionIssueState((current) => {
        const byLocation = current.plan === plan ? current.byLocation : {};
        if (sorted.length === 0) {
          if (!Object.hasOwn(byLocation, identity)) {
            return current.plan === plan ? current : { plan, byLocation };
          }
          const next = { ...byLocation };
          delete next[identity];
          return { plan, byLocation: next };
        }
        if (haveSameBlockingIssues(byLocation[identity], sorted)) {
          return current.plan === plan ? current : { plan, byLocation };
        }
        return {
          plan,
          byLocation: { ...byLocation, [identity]: sorted },
        };
      });
    },
    [plan]
  );
  const blockingIssues = useMemo(
    () =>
      hostResolution.status === 'blocked'
        ? hostResolution.issues
        : collectionIssueState.plan === plan
          ? Object.values(collectionIssueState.byLocation)
              .flat()
              .sort(compareBlockingIssues)
          : [],
    [collectionIssueState, hostResolution, plan]
  );
  useEffect(() => {
    onBlockingIssues(blockingIssues);
  }, [blockingIssues, onBlockingIssues]);
  const runtime = useMemo<PIRProjectionRuntime | null>(
    () =>
      hostResolution.status === 'ready'
        ? {
            plan,
            host: hostResolution.host,
            dispatchTrigger,
            reportCollectionBlockingIssues,
            ...(resolveCollectionPreviewState
              ? { resolveCollectionPreviewState }
              : {}),
            ...(selectedLocation ? { selectedLocation } : {}),
            ...(hiddenLocations?.length ? { hiddenLocations } : {}),
            ...(onNodeSelect ? { onNodeSelect } : {}),
          }
        : null,
    [
      dispatchTrigger,
      hiddenLocations,
      hostResolution,
      onNodeSelect,
      plan,
      reportCollectionBlockingIssues,
      resolveCollectionPreviewState,
      selectedLocation,
    ]
  );
  if (!runtime) return null;
  return (
    <PIRDocumentProjection
      document={plan.entryDocument}
      instancePath={createPirProjectionRootPath(plan.entryDocumentId)}
      role={
        plan.entryDocument.type === 'pir-component' ? 'definition' : 'source'
      }
      rootParamsById={rootParamsById}
      rootStateById={rootStateById}
      rootDataById={rootDataById}
      rootComponentPropsById={rootComponentPropsById}
      rootComponentVariantsById={rootComponentVariantsById}
      runtime={runtime}
    />
  );
};
