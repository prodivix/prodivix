import { useEffect, useRef } from 'react';

export const useExternalLibraryManagerRuntimeRefs = () => {
  const loadTokensRef = useRef<Map<string, number>>(new Map());
  const timeoutIdsRef = useRef<Set<number>>(new Set());
  const metadataRequestsRef = useRef<Set<string>>(new Set());
  const metadataControllersRef = useRef<Map<string, AbortController>>(
    new Map()
  );

  useEffect(
    () => () => {
      timeoutIdsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
      timeoutIdsRef.current.clear();
      loadTokensRef.current.clear();
      metadataRequestsRef.current.clear();
      metadataControllersRef.current.forEach((controller) =>
        controller.abort()
      );
      metadataControllersRef.current.clear();
    },
    [loadTokensRef, metadataControllersRef, metadataRequestsRef, timeoutIdsRef]
  );

  return {
    loadTokensRef,
    timeoutIdsRef,
    metadataRequestsRef,
    metadataControllersRef,
  };
};
