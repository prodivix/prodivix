const bridge = globalThis.__PRODIVIX_HOST_REACT_BRIDGE__;

if (!bridge?.jsxRuntime) {
  throw new Error(
    '[ELIB-1011] Host React JSX runtime bridge is not initialized before loading external ESM modules.'
  );
}

const Runtime = bridge.jsxRuntime;

export default Runtime;
export const Fragment = Runtime.Fragment;
export const jsx = Runtime.jsx;
export const jsxs = Runtime.jsxs;
