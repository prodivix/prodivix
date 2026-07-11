import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PluginDiagnostic } from '@prodivix/plugin-contracts';
import type { UiGraph } from '@prodivix/shared/types/pir';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { buildExternalLibrariesValueFromWorkspace } from '@/editor/features/resources/workspaceExternalLibraries';
import {
  validateBlueprintComposition,
  type BlueprintCompositionIssue,
} from '@/editor/features/blueprint/editor/model/composition';
import { isAbortError } from '@/infra/api';
import {
  collectUnavailableBundledOfficialComponentDiagnostics,
  getBundledOfficialPlugin,
  reconcileBundledOfficialPlugins,
  type PaletteQueryService,
  usePaletteQueryService,
  useWebExtensionRegistrySnapshot,
  useWebPluginRuntimeServices,
} from '@/plugins/platform';

export const findActiveBlueprintCompositionIssue = (
  graph: UiGraph,
  palette: PaletteQueryService
): BlueprintCompositionIssue | undefined =>
  validateBlueprintComposition(graph, palette, Object.keys(graph.nodesById));

export const useBundledOfficialPluginRuntime = () => {
  const { packages } = useWebPluginRuntimeServices();
  const palette = usePaletteQueryService();
  const extensions = useWebExtensionRegistrySnapshot();
  const pirDoc = useEditorStore((state) => state.pirDoc);
  const workspaceDocumentsById = useEditorStore(
    (state) => state.workspaceDocumentsById
  );
  const configuredLibraryIds = useMemo(
    () =>
      buildExternalLibrariesValueFromWorkspace(workspaceDocumentsById)
        .componentLibraryIds,
    [workspaceDocumentsById]
  );
  const officialLibraryOptions = useMemo(
    () =>
      configuredLibraryIds.map((catalogId) => {
        const entry = getBundledOfficialPlugin(catalogId);
        return entry
          ? { id: entry.catalogId, label: entry.metadata.displayName }
          : { id: catalogId, label: catalogId };
      }),
    [configuredLibraryIds]
  );
  const desiredCatalogIds = configuredLibraryIds;
  const [officialPluginDiagnostics, setOfficialPluginDiagnostics] = useState<
    readonly PluginDiagnostic[]
  >([]);
  const [isOfficialPluginLoading, setOfficialPluginLoading] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const operationRevisionRef = useRef(0);

  const reloadOfficialPlugins = useCallback(async () => {
    const operationRevision = operationRevisionRef.current + 1;
    operationRevisionRef.current = operationRevision;
    controllerRef.current?.abort('official-plugin-reconciliation-replaced');
    const controller = new AbortController();
    controllerRef.current = controller;
    setOfficialPluginLoading(true);

    try {
      const result = await reconcileBundledOfficialPlugins(
        packages,
        desiredCatalogIds,
        controller.signal
      );
      if (
        !controller.signal.aborted &&
        operationRevisionRef.current === operationRevision
      ) {
        setOfficialPluginDiagnostics(result.diagnostics);
      }
    } catch (error) {
      if (!isAbortError(error)) {
        console.warn(
          '[blueprint] bundled official plugin reconciliation failed',
          error
        );
      }
    } finally {
      if (operationRevisionRef.current === operationRevision) {
        controllerRef.current = null;
        setOfficialPluginLoading(false);
      }
    }
  }, [desiredCatalogIds, packages]);

  useEffect(() => {
    void reloadOfficialPlugins();
    return () => {
      operationRevisionRef.current += 1;
      controllerRef.current?.abort('official-plugin-reconciliation-disposed');
      controllerRef.current = null;
    };
  }, [reloadOfficialPlugins]);

  const unavailableComponentDiagnostics = useMemo(
    () =>
      isOfficialPluginLoading
        ? []
        : collectUnavailableBundledOfficialComponentDiagnostics(
            pirDoc.ui.graph.nodesById,
            extensions.rendererComponents
          ),
    [
      extensions.rendererComponents,
      isOfficialPluginLoading,
      pirDoc.ui.graph.nodesById,
    ]
  );
  const activeCompositionIssue = useMemo(
    () =>
      isOfficialPluginLoading
        ? undefined
        : findActiveBlueprintCompositionIssue(pirDoc.ui.graph, palette),
    [extensions.revision, isOfficialPluginLoading, palette, pirDoc.ui.graph]
  );

  const diagnostics = useMemo(
    () => [...officialPluginDiagnostics, ...unavailableComponentDiagnostics],
    [officialPluginDiagnostics, unavailableComponentDiagnostics]
  );

  return {
    officialPluginDiagnostics: diagnostics,
    activeCompositionIssue,
    officialLibraryOptions,
    isOfficialPluginLoading,
    reloadOfficialPlugins,
  };
};
