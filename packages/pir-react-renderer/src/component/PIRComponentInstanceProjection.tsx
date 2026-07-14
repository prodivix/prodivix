import React, { useMemo } from 'react';
import { appendPirProjectionComponentPath, type PIRNode } from '@prodivix/pir';
import type { WorkspacePirDocument } from '@prodivix/workspace';
import { PIRDocumentProjection } from '../document/PIRDocumentProjection';
import type { PIRRenderLocation } from '../PIRRenderer.types';
import type { PIRProjectionRuntime } from '../runtime/pirProjectionRuntime';
import {
  createPirComponentRuntimeInput,
  type PIRComponentRuntimeInput,
  type PIRInternalRenderScope,
} from '../runtime/pirRenderScope';

export const PIRComponentInstanceProjection: React.FC<{
  document: WorkspacePirDocument;
  node: Extract<PIRNode, { kind: 'component-instance' }>;
  scope: PIRInternalRenderScope;
  location: PIRRenderLocation;
  componentInput?: PIRComponentRuntimeInput;
  runtime: PIRProjectionRuntime;
}> = ({ document, node, scope, location, componentInput, runtime }) => {
  const target = runtime.plan.documentsById[node.componentDocumentId]!;
  const contract = target.content.componentContract!;
  const nextInstancePath = appendPirProjectionComponentPath(
    location.instancePath,
    document.id,
    node.id,
    target.id
  );
  const nextInput = useMemo(
    () =>
      createPirComponentRuntimeInput({
        contract,
        propBindings: node.bindings.props,
        variantBindings: node.bindings.variants,
        eventBindings: node.bindings.events,
        consumerScope: scope,
        instanceLocation: location,
        slotConsumer: {
          document,
          instanceNodeId: node.id,
          instancePath: location.instancePath,
          scope,
          ...(componentInput ? { componentInput } : {}),
        },
        host: runtime.host,
      }),
    [componentInput, contract, document, location, node, runtime.host, scope]
  );
  return (
    <PIRDocumentProjection
      key={nextInstancePath}
      document={target}
      instancePath={nextInstancePath}
      role="definition"
      componentInput={nextInput}
      runtime={runtime}
    />
  );
};
