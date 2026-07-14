import React from 'react';
import {
  appendPirProjectionSlotPath,
  resolvePirSlotPropValues,
  selectPirSlotProjection,
  type PIRNode,
} from '@prodivix/pir';
import type { WorkspacePirDocument } from '@prodivix/workspace';
import { PIRNodeList } from '../node/PIRNodeProjection';
import type { PIRRenderRole } from '../PIRRenderer.types';
import type { PIRProjectionRuntime } from '../runtime/pirProjectionRuntime';
import {
  withPirSlotProps,
  type PIRComponentRuntimeInput,
  type PIRInternalRenderScope,
} from '../runtime/pirRenderScope';

export const PIRSlotOutletProjection: React.FC<{
  document: WorkspacePirDocument;
  node: Extract<PIRNode, { kind: 'component-slot-outlet' }>;
  scope: PIRInternalRenderScope;
  instancePath: string;
  role: PIRRenderRole;
  componentInput?: PIRComponentRuntimeInput;
  runtime: PIRProjectionRuntime;
}> = ({
  document,
  node,
  scope,
  instancePath,
  role,
  componentInput,
  runtime,
}) => {
  const fallbackNodeIds = document.content.ui.graph.childIdsById[node.id] ?? [];
  if (!componentInput) {
    return (
      <PIRNodeList
        document={document}
        nodeIds={fallbackNodeIds}
        scope={scope}
        instancePath={instancePath}
        role={role}
        runtime={runtime}
      />
    );
  }
  const consumer = componentInput.slotConsumer;
  const projection = selectPirSlotProjection({
    consumerGraph: consumer.document.content.ui.graph,
    instanceNodeId: consumer.instanceNodeId,
    slotMemberId: node.slotMemberId,
    fallbackNodeIds,
  });
  if (projection.kind === 'fallback') {
    return (
      <PIRNodeList
        document={document}
        nodeIds={projection.nodeIds}
        scope={scope}
        instancePath={instancePath}
        role={role}
        componentInput={componentInput}
        runtime={runtime}
      />
    );
  }
  const slotPropsById = resolvePirSlotPropValues(
    node,
    scope,
    runtime.host.resolveCodeValue
  );
  const slotInstancePath = appendPirProjectionSlotPath(
    instancePath,
    consumer.document.id,
    consumer.instanceNodeId,
    node.slotMemberId
  );
  return (
    <PIRNodeList
      document={consumer.document}
      nodeIds={projection.nodeIds}
      scope={withPirSlotProps(consumer.scope, slotPropsById)}
      instancePath={slotInstancePath}
      role="slot-consumer"
      componentInput={consumer.componentInput}
      runtime={runtime}
    />
  );
};
