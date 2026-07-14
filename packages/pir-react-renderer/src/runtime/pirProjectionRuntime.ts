import type React from 'react';
import type {
  PIRCollectionPreviewInput,
  PIRCollectionProjectionLocation,
} from '@prodivix/pir';
import type { WorkspacePirProjectionPlan } from '@prodivix/workspace';
import type {
  PIRRenderLocation,
  PIRRendererBlockingIssue,
  PIRResolvedRendererHost,
  PIRTriggerDispatchRequest,
} from '../PIRRenderer.types';

export type PIRProjectionRuntime = Readonly<{
  plan: WorkspacePirProjectionPlan;
  host: PIRResolvedRendererHost;
  dispatchTrigger: (request: PIRTriggerDispatchRequest) => void;
  resolveCollectionPreviewState?: (
    location: PIRCollectionProjectionLocation
  ) => PIRCollectionPreviewInput | undefined;
  reportCollectionBlockingIssues: (
    location: PIRCollectionProjectionLocation,
    issues: readonly PIRRendererBlockingIssue[]
  ) => void;
  selectedLocation?: PIRRenderLocation;
  onNodeSelect?: (
    location: PIRRenderLocation,
    event: React.SyntheticEvent
  ) => void;
}>;

export const createPirCollectionLocationIdentity = (
  location: PIRCollectionProjectionLocation
): string =>
  JSON.stringify([location.documentId, location.nodeId, location.instancePath]);
