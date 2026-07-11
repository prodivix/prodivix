const bridge = globalThis.__PRODIVIX_HOST_REACT_BRIDGE__;

if (!bridge?.jsxDevRuntime) {
  throw new Error(
    'Host React JSX dev runtime bridge is not initialized before loading external ESM modules.'
  );
}

const Runtime = bridge.jsxDevRuntime;

export default Runtime;
export const Fragment = Runtime.Fragment;
export const jsxDEV = Runtime.jsxDEV;
