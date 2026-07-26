import { VUE_VITE_DEPENDENCIES } from '#src/export/presets/vueVite';
import type { PirDocumentShellEmitter } from '#src/workspace/pirDocumentShellEmitter';

/**
 * Hosts the compiled PIR document as a Vue component.
 *
 * The structural difference from React is that `setup()` runs once while the
 * returned render function re-runs, so every value derived from props, state
 * or Data lifecycle is computed inside the render closure rather than in the
 * component body. The compiled expressions themselves are the shared ones.
 */
export const vueDocumentShellEmitter: PirDocumentShellEmitter = {
  moduleKind: 'vue-component',
  language: 'ts',
  packageVersions: () => ({ vue: VUE_VITE_DEPENDENCIES.vue }),
  createCollectionIssueReporterSource: (imports) => {
    const defineComponentLocal = imports.addNamedPackageImport(
      'vue',
      'defineComponent'
    );
    const watchEffectLocal = imports.addNamedPackageImport(
      'vue',
      'watchEffect'
    );
    return `const __PdxCollectionIssueReporter = ${defineComponentLocal}({
  name: 'PdxCollectionIssueReporter',
  props: {
    runtime: { type: Object, required: true },
    location: { type: Object, required: true },
    issues: { type: Array, required: true },
  },
  setup(__pdxReporterProps: any) {
    ${watchEffectLocal}((__pdxOnCleanup) => {
      const props = __pdxReporterProps as __PdxCollectionIssueReporterProps;
      const report = props.runtime.reportCollectionProjectionIssues;
      // Read the identity so the effect re-runs when the issue set changes.
      void __pdxCollectionIssueIdentity(props.issues);
      report?.({ location: props.location, issues: props.issues });
      __pdxOnCleanup(() => {
        report?.({
          location: props.location,
          issues: __pdxNoCollectionProjectionIssues,
        });
      });
    });
    return () => null;
  },
});`;
  },
  createModuleBody: (input) => {
    const defineComponentLocal = input.imports.addNamedPackageImport(
      'vue',
      'defineComponent'
    );
    const shallowRefLocal = input.imports.addNamedPackageImport(
      'vue',
      'shallowRef'
    );
    const onMountedLocal = input.imports.addNamedPackageImport(
      'vue',
      'onMounted'
    );
    const onUnmountedLocal = input.imports.addNamedPackageImport(
      'vue',
      'onUnmounted'
    );
    const watchEffectLocal = input.imports.addNamedPackageImport(
      'vue',
      'watchEffect'
    );
    const hLocal = input.imports.addNamedPackageImport('vue', 'h');
    return `${input.prelude}

// The compiled tree passes dynamic prop records and child arrays, which do not
// match Vue's narrow \`h()\` overloads. The shapes are already validated by the
// PIR compiler, so the runtime call is widened rather than re-typed per node.
const __pdxH = ${hLocal} as (
  type: any,
  props?: any,
  children?: any
) => any;

export default ${defineComponentLocal}({
  name: ${JSON.stringify(input.moduleName)},
  props: {
    __pdxRuntime: { type: Object, required: true },
    __pdxInstancePath: { type: String, required: false },
    __pdxRouteId: { type: String, required: false },
    __pdxParamsById: { type: Object, required: false },
    __pdxPropsById: { type: Object, required: false },
    __pdxEventsById: { type: Object, required: false },
    __pdxVariantsById: { type: Object, required: false },
    __pdxSlotsById: { type: Object, required: false },
    __pdxRouteOutletsById: { type: Object, required: false },
  },
  setup(__pdxModuleProps: any) {
    const __pdxStateRef = ${shallowRefLocal}<Readonly<Record<string, unknown>>>(${input.stateValues});
    const __pdxSetStateById: __PdxStateUpdater = (stateId, value) => {
      __pdxStateRef.value = { ...__pdxStateRef.value, [stateId]: value };
    };
    const __pdxDataRevisionRef = ${shallowRefLocal}(0);
    let __pdxUnsubscribeDataLifecycle: (() => void) | undefined;
    ${onMountedLocal}(() => {
      __pdxUnsubscribeDataLifecycle = (
        __pdxModuleProps.__pdxRuntime as __PdxRuntimePort
      ).subscribeDataLifecycle?.(() => {
        __pdxDataRevisionRef.value += 1;
      });
    });
    ${onUnmountedLocal}(() => {
      __pdxUnsubscribeDataLifecycle?.();
      __pdxUnsubscribeDataLifecycle = undefined;
    });
    ${watchEffectLocal}(() => {
      const props = __pdxModuleProps as __PdxModuleProps;
      const __pdxRuntime = props.__pdxRuntime;
      const __pdxInstancePath = props.__pdxInstancePath ?? ${input.rootInstancePath};
      const __pdxRouteId = props.__pdxRouteId;
      const __pdxParamsById = props.__pdxParamsById ?? {};
      const __pdxPropsById = props.__pdxPropsById ?? {};
      const __pdxVariantsById = props.__pdxVariantsById ?? {};
      const __pdxStateById = __pdxStateRef.value;
      const __pdxComponentPropsById = ${input.componentProps};
      const __pdxComponentVariantsById = ${input.componentVariants};
      const __pdxDataProjection = __pdxProjectDocumentDataLifecycle(
        __pdxRuntime,
        ${input.documentIdJson},
        __pdxInstancePath,
        ${input.dataOperationBindings}
      );
      if (__pdxDataProjection.status === 'blocked') return;
      void __pdxRuntime.activateDataBindings?.({
        documentId: ${input.documentIdJson},
        instancePath: __pdxInstancePath,
        ...(__pdxRouteId ? { currentRouteId: __pdxRouteId } : {}),
        bindingsByDataId: ${input.dataOperationBindings},
        runtimeValuesById: {
          ...${input.baseDataRuntimeValues},
          ...${input.dataRuntimeValues},
        },
      });
    });
    return () => {
      const props = __pdxModuleProps as __PdxModuleProps;
      const __pdxRuntime = props.__pdxRuntime;
      const __pdxInstancePath = props.__pdxInstancePath ?? ${input.rootInstancePath};
      const __pdxRouteId = props.__pdxRouteId;
      const __pdxParamsById = props.__pdxParamsById ?? {};
      const __pdxPropsById = props.__pdxPropsById ?? {};
      const __pdxEventsById = props.__pdxEventsById ?? {};
      const __pdxVariantsById = props.__pdxVariantsById ?? {};
      const __pdxSlotsById = props.__pdxSlotsById ?? {};
      const __pdxRouteOutletsById = props.__pdxRouteOutletsById ?? {};
      void __pdxDataRevisionRef.value;
      const __pdxStateById = __pdxStateRef.value;
      const __pdxComponentPropsById = ${input.componentProps};
      const __pdxComponentVariantsById = ${input.componentVariants};
      const __pdxBaseDataRuntimeValuesById = ${input.baseDataRuntimeValues};
      const __pdxDataProjection = __pdxProjectDocumentDataLifecycle(
        __pdxRuntime,
        ${input.documentIdJson},
        __pdxInstancePath,
        ${input.dataOperationBindings}
      );
      if (__pdxDataProjection.status === 'blocked') return null;
      const __pdxDataRuntimeValuesById = {
        ...__pdxBaseDataRuntimeValuesById,
        ...${input.dataRuntimeValues},
      };
      void __pdxDataRuntimeValuesById;
      const __pdxDataRuntimeValuesFromScope = (__pdxScope: __PdxScope): Readonly<Record<string, unknown>> => (${input.scopeDataRuntimeValues});
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
    };
  },
});
`;
  },
};
