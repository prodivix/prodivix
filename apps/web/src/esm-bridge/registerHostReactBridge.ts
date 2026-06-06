import ReactModule from 'react';
import ReactDOMModule from 'react-dom';
import * as ReactJsxRuntimeModule from 'react/jsx-runtime';
import * as ReactJsxDevRuntimeModule from 'react/jsx-dev-runtime';

type HostReactBridge = {
  react: typeof ReactModule;
  reactDom: typeof ReactDOMModule;
  jsxRuntime: typeof ReactJsxRuntimeModule;
  jsxDevRuntime: typeof ReactJsxDevRuntimeModule;
};

declare global {
  var __PRODIVIX_HOST_REACT_BRIDGE__: HostReactBridge | undefined;
}

globalThis.__PRODIVIX_HOST_REACT_BRIDGE__ = {
  ...globalThis.__PRODIVIX_HOST_REACT_BRIDGE__,
  react: ReactModule,
  reactDom: ReactDOMModule,
  jsxRuntime: ReactJsxRuntimeModule,
  jsxDevRuntime: ReactJsxDevRuntimeModule,
};

export {};
