import { useEffect, useRef, useState } from 'react';
import type {
  ExternalLibraryDiagnostic,
  ExternalLibraryRuntimeState,
} from '@/editor/features/blueprint/external';
import { useCallback } from 'react';
import { externalLibraryConfigUpdatedEvent } from '@/editor/features/blueprint/external';
import { isAbortError } from '@/infra/api';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { buildExternalLibrariesValueFromWorkspace } from '@/editor/features/resources/workspaceExternalLibraries';

type RetryExternalLibrary = (libraryId: string) => Promise<void>;
type ExternalModule =
  typeof import('@/editor/features/blueprint/external');

export const useExternalLibraryRuntime = () => {
  const workspaceDocumentsById = useEditorStore(
    (state) => state.workspaceDocumentsById
  );
  const configuredLibraryIds = buildExternalLibrariesValueFromWorkspace(
    workspaceDocumentsById
  ).componentLibraryIds;
  const [externalDiagnostics, setExternalDiagnostics] = useState<
    ExternalLibraryDiagnostic[]
  >([]);
  const [externalLibraryStates, setExternalLibraryStates] = useState<
    ExternalLibraryRuntimeState[]
  >([]);
  const [externalLibraryOptions, setExternalLibraryOptions] = useState<
    Array<{ id: string; label: string }>
  >([]);
  const [isExternalLibraryLoading, setExternalLibraryLoading] = useState(false);
  const [retryExternalLibrary, setRetryExternalLibrary] = useState<
    RetryExternalLibrary | undefined
  >(undefined);
  const externalModuleRef = useRef<ExternalModule | null>(null);
  const reloadControllerRef = useRef<AbortController | null>(null);
  const configUpdateControllerRef = useRef<AbortController | null>(null);
  const createAbortController = () =>
    typeof AbortController === 'function' ? new AbortController() : null;
  const isOffline = () =>
    typeof navigator !== 'undefined' && navigator.onLine === false;
  const getConfiguredLibraryIds = useCallback(
    (mod: ExternalModule) => {
      if (configuredLibraryIds.length === 0) {
        return mod.getConfiguredExternalLibraryIds();
      }
      return configuredLibraryIds;
    },
    [configuredLibraryIds]
  );
  const getConfiguredLibraryOptions = useCallback(
    (mod: ExternalModule) =>
      getConfiguredLibraryIds(mod).map((libraryId) => ({
        id: libraryId,
        label: mod.getExternalLibraryDisplayName(libraryId),
      })),
    [getConfiguredLibraryIds]
  );
  const reloadExternalLibraries = async () => {
    if (isOffline()) return;
    const ensureWithModule = async (mod: ExternalModule) => {
      const libraryIds = getConfiguredLibraryIds(mod);
      setExternalLibraryOptions(getConfiguredLibraryOptions(mod));
      reloadControllerRef.current?.abort();
      const controller = createAbortController();
      reloadControllerRef.current = controller;
      try {
        await mod.ensureConfiguredExternalLibraries(
          libraryIds,
          controller ? { signal: controller.signal } : {}
        );
      } finally {
        if (reloadControllerRef.current === controller) {
          reloadControllerRef.current = null;
        }
      }
    };

    if (externalModuleRef.current) {
      await ensureWithModule(externalModuleRef.current);
      return;
    }

    try {
      const mod = await import('@/editor/features/blueprint/external');
      externalModuleRef.current = mod;
      await ensureWithModule(mod);
    } catch (error) {
      if (isAbortError(error)) return;
      console.warn('[blueprint] failed to reload external runtime', error);
    }
  };

  useEffect(() => {
    let disposed = false;
    const controller = createAbortController();
    let unsubscribeDiagnostics: (() => void) | undefined;
    let unsubscribeLoading: (() => void) | undefined;
    let unsubscribeStates: (() => void) | undefined;

    void import('@/editor/features/blueprint/external')
      .then((mod) => {
        externalModuleRef.current = mod;
        unsubscribeDiagnostics = mod.subscribeExternalLibraryDiagnostics(
          (diagnostics) => {
            if (disposed) return;
            setExternalDiagnostics(diagnostics);
          }
        );
        unsubscribeLoading = mod.subscribeExternalLibraryLoading(
          (isLoading) => {
            if (disposed) return;
            setExternalLibraryLoading(isLoading);
          }
        );
        unsubscribeStates = mod.subscribeExternalLibraryState((states) => {
          if (disposed) return;
          setExternalLibraryStates(states);
        });
        setRetryExternalLibrary(() => async (libraryId: string) => {
          await mod.retryExternalLibraryById(libraryId);
        });
        const libraryIds = getConfiguredLibraryIds(mod);
        setExternalLibraryOptions(getConfiguredLibraryOptions(mod));
        setExternalDiagnostics(mod.getExternalLibraryDiagnostics());
        setExternalLibraryLoading(mod.getExternalLibraryLoadingState());
        setExternalLibraryStates(mod.getExternalLibraryStates());
        if (isOffline()) {
          return;
        }
        void mod
          .ensureConfiguredExternalLibraries(
            libraryIds,
            controller ? { signal: controller.signal } : {}
          )
          .catch((error) => {
            if (isAbortError(error)) return;
            console.warn(
              '[blueprint] failed to preload configured external runtime',
              error
            );
          });
      })
      .catch((error) => {
        if (isAbortError(error)) return;
        console.warn('[blueprint] failed to preload external runtime', error);
      });

    return () => {
      disposed = true;
      controller?.abort();
      reloadControllerRef.current?.abort();
      reloadControllerRef.current = null;
      configUpdateControllerRef.current?.abort();
      configUpdateControllerRef.current = null;
      unsubscribeDiagnostics?.();
      unsubscribeLoading?.();
      unsubscribeStates?.();
    };
  }, [getConfiguredLibraryIds, getConfiguredLibraryOptions]);

  useEffect(() => {
    const handleConfigUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ libraryIds?: string[] }>;
      const nextIds = customEvent.detail?.libraryIds ?? [];
      if (externalModuleRef.current) {
        setExternalLibraryOptions(
          nextIds.map((libraryId) => ({
            id: libraryId,
            label:
              externalModuleRef.current?.getExternalLibraryDisplayName(
                libraryId
              ) ?? libraryId,
          }))
        );
        if (isOffline()) {
          return;
        }
        configUpdateControllerRef.current?.abort();
        const controller = createAbortController();
        configUpdateControllerRef.current = controller;
        void externalModuleRef.current
          .ensureConfiguredExternalLibraries(
            nextIds,
            controller ? { signal: controller.signal } : {}
          )
          .catch((error) => {
            if (isAbortError(error)) return;
            console.warn('[blueprint] failed to sync external runtime', error);
          })
          .finally(() => {
            if (configUpdateControllerRef.current === controller) {
              configUpdateControllerRef.current = null;
            }
          });
        return;
      }
      setExternalLibraryOptions(
        nextIds.map((libraryId) => ({
          id: libraryId,
          label: libraryId,
        }))
      );
    };
    if (typeof window === 'undefined') return;
    window.addEventListener(
      externalLibraryConfigUpdatedEvent,
      handleConfigUpdated
    );
    return () => {
      configUpdateControllerRef.current?.abort();
      configUpdateControllerRef.current = null;
      window.removeEventListener(
        externalLibraryConfigUpdatedEvent,
        handleConfigUpdated
      );
    };
  }, [getConfiguredLibraryOptions]);

  return {
    externalDiagnostics,
    externalLibraryStates,
    externalLibraryOptions,
    isExternalLibraryLoading,
    reloadExternalLibraries,
    retryExternalLibrary,
  };
};
