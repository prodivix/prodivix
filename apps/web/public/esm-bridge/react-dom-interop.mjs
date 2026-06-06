const bridge = globalThis.__PRODIVIX_HOST_REACT_BRIDGE__;

if (!bridge?.reactDom) {
  throw new Error(
    '[ELIB-1011] Host React DOM bridge is not initialized before loading external ESM modules.'
  );
}

const ReactDOM = bridge.reactDom;

export default ReactDOM;

export const createPortal = ReactDOM.createPortal;
export const flushSync = ReactDOM.flushSync;
export const preconnect = ReactDOM.preconnect;
export const prefetchDNS = ReactDOM.prefetchDNS;
export const preinit = ReactDOM.preinit;
export const preinitModule = ReactDOM.preinitModule;
export const preload = ReactDOM.preload;
export const preloadModule = ReactDOM.preloadModule;
export const requestFormReset = ReactDOM.requestFormReset;
export const unstable_batchedUpdates = ReactDOM.unstable_batchedUpdates;
export const useFormState = ReactDOM.useFormState;
export const useFormStatus = ReactDOM.useFormStatus;
export const version = ReactDOM.version;
