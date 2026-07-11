import { useEffect, useRef } from 'react';

export const useExternalLibraryManagerRuntimeRefs = () => {
  const metadataRequestsRef = useRef<Set<string>>(new Set());
  const metadataControllersRef = useRef<Map<string, AbortController>>(
    new Map()
  );

  useEffect(
    () => () => {
      metadataRequestsRef.current.clear();
      metadataControllersRef.current.forEach((controller) =>
        controller.abort()
      );
      metadataControllersRef.current.clear();
    },
    [metadataControllersRef, metadataRequestsRef]
  );

  return {
    metadataRequestsRef,
    metadataControllersRef,
  };
};
