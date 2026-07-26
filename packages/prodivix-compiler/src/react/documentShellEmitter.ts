import { REACT_VITE_DEPENDENCIES } from '#src/export/presets/reactVite';
import type { PirDocumentShellEmitter } from '#src/workspace/pirDocumentShellEmitter';

/** Hosts the compiled PIR document as a React function component. */
export const reactDocumentShellEmitter: PirDocumentShellEmitter = {
  moduleKind: 'react-component',
  language: 'tsx',
  packageVersions: () => ({ react: REACT_VITE_DEPENDENCIES.react }),
  createCollectionIssueReporterSource: (imports) => {
    const useEffectLocal = imports.addNamedPackageImport('react', 'useEffect');
    return `const __PdxCollectionIssueReporter = ({
  runtime,
  location,
  issues,
}: __PdxCollectionIssueReporterProps) => {
  const issueIdentity = __pdxCollectionIssueIdentity(issues);
  const report = runtime.reportCollectionProjectionIssues;
  ${useEffectLocal}(() => {
    report?.({ location, issues });
    return () =>
      report?.({
        location,
        issues: __pdxNoCollectionProjectionIssues,
      });
  }, [
    report,
    location.documentId,
    location.nodeId,
    location.instancePath,
    issueIdentity,
  ]);
  return null;
};`;
  },
  createModuleBody: (input) => {
    const useStateLocal = input.imports.addNamedPackageImport(
      'react',
      'useState'
    );
    const useCallbackLocal = input.imports.addNamedPackageImport(
      'react',
      'useCallback'
    );
    const useEffectLocal = input.imports.addNamedPackageImport(
      'react',
      'useEffect'
    );
    return `${input.prelude}

export default function ${input.moduleName}({
  __pdxRuntime,
  __pdxInstancePath = ${input.rootInstancePath},
  __pdxRouteId,
  __pdxParamsById = {},
  __pdxPropsById = {},
  __pdxEventsById = {},
  __pdxVariantsById = {},
  __pdxSlotsById = {},
  __pdxRouteOutletsById = {},
}: __PdxModuleProps) {
  const [__pdxStateById, __pdxSetStateRecord] = ${useStateLocal}<Readonly<Record<string, unknown>>>(() => (${input.stateValues}));
  const __pdxSetStateById = ${useCallbackLocal}<__PdxStateUpdater>((stateId, value) => {
    __pdxSetStateRecord((previous) => ({ ...previous, [stateId]: value }));
  }, []);
  const [, __pdxSetDataRuntimeRevision] = ${useStateLocal}(0);
  ${useEffectLocal}(() => __pdxRuntime.subscribeDataLifecycle?.(() => {
    __pdxSetDataRuntimeRevision((previous) => previous + 1);
  }), [__pdxRuntime]);
  const __pdxComponentPropsById = ${input.componentProps};
  const __pdxComponentVariantsById = ${input.componentVariants};
  const __pdxBaseDataRuntimeValuesById = ${input.baseDataRuntimeValues};
  const __pdxDataProjection = __pdxProjectDocumentDataLifecycle(
    __pdxRuntime,
    ${input.documentIdJson},
    __pdxInstancePath,
    ${input.dataOperationBindings}
  );
  const __pdxDataRuntimeValuesById = {
    ...__pdxBaseDataRuntimeValuesById,
    ...${input.dataRuntimeValues},
  };
  const __pdxDataRuntimeValuesFromScope = (__pdxScope: __PdxScope): Readonly<Record<string, unknown>> => (${input.scopeDataRuntimeValues});
  const __pdxDataRuntimeValuesDigest = JSON.stringify(__pdxDataRuntimeValuesById);
  ${useEffectLocal}(() => {
    void __pdxRuntime.activateDataBindings?.({
      documentId: ${input.documentIdJson},
      instancePath: __pdxInstancePath,
      ...(__pdxRouteId ? { currentRouteId: __pdxRouteId } : {}),
      bindingsByDataId: ${input.dataOperationBindings},
      runtimeValuesById: __pdxDataRuntimeValuesById,
    });
  }, [__pdxRuntime, __pdxInstancePath, __pdxRouteId, __pdxDataRuntimeValuesDigest]);
  if (__pdxDataProjection.status === 'blocked') return null;
  const __pdxDefinitionScope: __PdxScope = {
    paramsById: __pdxParamsById,
    stateById: __pdxStateById,
    dataById: __pdxDataProjection.dataById,
    dataLifecycleById: __pdxDataProjection.lifecycleByDataId,
    collectionSymbolsById: {},
    componentPropsById: __pdxComponentPropsById,
    componentVariantsById: __pdxComponentVariantsById,
    slotPropsById: {},
  };
  return (${input.rootExpression});
}
`;
  },
};
