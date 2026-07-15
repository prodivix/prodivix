import React, { useCallback, useMemo } from 'react';
import type { WorkspacePirDocument } from '@prodivix/workspace';
import { PIRCollectionProjection } from '../collection/PIRCollectionProjection';
import { PIRComponentInstanceProjection } from '../component/PIRComponentInstanceProjection';
import {
  PIRElementProjection,
  isSamePirRenderLocation,
} from './PIRElementProjection';
import type { PIRRenderLocation, PIRRenderRole } from '../PIRRenderer.types';
import { PIRSlotOutletProjection } from '../component/PIRSlotOutletProjection';
import type { PIRProjectionRuntime } from '../runtime/pirProjectionRuntime';
import type {
  PIRComponentRuntimeInput,
  PIRInternalRenderScope,
} from '../runtime/pirRenderScope';

const PIRNodeBoundary: React.FC<{
  location: PIRRenderLocation;
  hidden: boolean;
  onNodeSelect?: PIRProjectionRuntime['onNodeSelect'];
  children: React.ReactNode;
}> = ({ location, hidden, onNodeSelect, children }) => {
  const handleClickCapture = useCallback(
    (event: React.SyntheticEvent) => {
      if (!onNodeSelect) return;
      const target = event.target;
      const current = event.currentTarget;
      if (!(target instanceof Element) || !(current instanceof Element)) return;
      if (target.closest('[data-pir-node-boundary]') !== current) return;
      onNodeSelect(location, event);
    },
    [location, onNodeSelect]
  );
  return (
    <span
      style={{ display: hidden ? 'none' : 'contents' }}
      data-pir-node-boundary=""
      aria-hidden={hidden || undefined}
      onClickCapture={onNodeSelect ? handleClickCapture : undefined}
    >
      {children}
    </span>
  );
};

export const PIRNodeList: React.FC<{
  document: WorkspacePirDocument;
  nodeIds: readonly string[];
  scope: PIRInternalRenderScope;
  instancePath: string;
  role: PIRRenderRole;
  componentInput?: PIRComponentRuntimeInput;
  runtime: PIRProjectionRuntime;
}> = ({
  document,
  nodeIds,
  scope,
  instancePath,
  role,
  componentInput,
  runtime,
}) => (
  <>
    {nodeIds.map((nodeId) => (
      <PIRNodeProjection
        key={`${document.id}:${nodeId}`}
        document={document}
        nodeId={nodeId}
        scope={scope}
        instancePath={instancePath}
        role={role}
        componentInput={componentInput}
        runtime={runtime}
      />
    ))}
  </>
);

export const PIRNodeProjection: React.FC<{
  document: WorkspacePirDocument;
  nodeId: string;
  scope: PIRInternalRenderScope;
  instancePath: string;
  role: PIRRenderRole;
  componentInput?: PIRComponentRuntimeInput;
  runtime: PIRProjectionRuntime;
}> = ({
  document,
  nodeId,
  scope,
  instancePath,
  role,
  componentInput,
  runtime,
}) => {
  const node = document.content.ui.graph.nodesById[nodeId]!;
  const location = useMemo<PIRRenderLocation>(
    () => ({ documentId: document.id, nodeId, instancePath, role }),
    [document.id, instancePath, nodeId, role]
  );
  const hidden =
    runtime.hiddenLocations?.some((candidate) =>
      isSamePirRenderLocation(candidate, location)
    ) ?? false;
  let projection: React.ReactNode;
  if (node.kind === 'element') {
    projection = (
      <PIRElementProjection
        node={node}
        location={location}
        scope={scope}
        host={runtime.host}
        selectedLocation={runtime.selectedLocation}
        dispatchTrigger={runtime.dispatchTrigger}
        renderChildren={(childScope) => (
          <PIRNodeList
            document={document}
            nodeIds={document.content.ui.graph.childIdsById[node.id] ?? []}
            scope={childScope}
            instancePath={instancePath}
            role={role}
            componentInput={componentInput}
            runtime={runtime}
          />
        )}
      />
    );
  } else if (node.kind === 'component-instance') {
    projection = (
      <PIRComponentInstanceProjection
        document={document}
        node={node}
        scope={scope}
        location={location}
        componentInput={componentInput}
        runtime={runtime}
      />
    );
  } else if (node.kind === 'component-slot-outlet') {
    projection = (
      <PIRSlotOutletProjection
        document={document}
        node={node}
        scope={scope}
        instancePath={instancePath}
        role={role}
        componentInput={componentInput}
        runtime={runtime}
      />
    );
  } else {
    projection = (
      <PIRCollectionProjection
        document={document}
        node={node}
        scope={scope}
        location={location}
        role={role}
        componentInput={componentInput}
        runtime={runtime}
      />
    );
  }
  return (
    <PIRNodeBoundary
      location={location}
      hidden={hidden}
      onNodeSelect={runtime.onNodeSelect}
    >
      {projection}
    </PIRNodeBoundary>
  );
};
