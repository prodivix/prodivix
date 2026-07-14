import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { WorkspacePirDocument } from '@prodivix/workspace';
import type { PIRRenderRole } from '../PIRRenderer.types';
import { PIRNodeProjection } from '../node/PIRNodeProjection';
import type { PIRProjectionRuntime } from '../runtime/pirProjectionRuntime';
import {
  createPirDocumentScope,
  createPirInitialState,
  type PIRComponentRuntimeInput,
} from '../runtime/pirRenderScope';

export const PIRDocumentProjection: React.FC<{
  document: WorkspacePirDocument;
  instancePath: string;
  role: PIRRenderRole;
  componentInput?: PIRComponentRuntimeInput;
  rootParamsById?: Readonly<Record<string, unknown>>;
  rootStateById?: Readonly<Record<string, unknown>>;
  rootDataById?: Readonly<Record<string, unknown>>;
  rootComponentPropsById?: Readonly<Record<string, unknown>>;
  rootComponentVariantsById?: Readonly<Record<string, string | undefined>>;
  runtime: PIRProjectionRuntime;
}> = ({
  document,
  instancePath,
  role,
  componentInput,
  rootParamsById,
  rootStateById,
  rootDataById,
  rootComponentPropsById,
  rootComponentVariantsById,
  runtime,
}) => {
  const initialState = useMemo(
    () => createPirInitialState(document.content, rootStateById),
    [document.content, rootStateById]
  );
  const [stateById, setStateById] = useState(initialState);
  useEffect(() => setStateById(initialState), [initialState]);
  const updateStateById = useCallback((stateId: string, value: unknown) => {
    setStateById((current) => ({ ...current, [stateId]: value }));
  }, []);
  const scope = useMemo(
    () =>
      createPirDocumentScope({
        document: document.content,
        stateById,
        setStateById: updateStateById,
        ...(rootParamsById ? { paramsById: rootParamsById } : {}),
        ...(rootDataById ? { dataById: rootDataById } : {}),
        ...(componentInput ? { componentInput } : {}),
        ...(rootComponentPropsById ? { rootComponentPropsById } : {}),
        ...(rootComponentVariantsById ? { rootComponentVariantsById } : {}),
      }),
    [
      componentInput,
      document.content,
      rootComponentPropsById,
      rootComponentVariantsById,
      rootDataById,
      rootParamsById,
      stateById,
      updateStateById,
    ]
  );
  return (
    <PIRNodeProjection
      document={document}
      nodeId={document.content.ui.graph.rootId}
      scope={scope}
      instancePath={instancePath}
      role={role}
      componentInput={componentInput}
      runtime={runtime}
    />
  );
};
