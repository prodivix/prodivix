import { createContext, useContext } from 'react';

export type OfficialReactSurfaceHost = Readonly<{
  getStyleContainer(): HTMLElement | ShadowRoot | null;
  getOverlayContainer(): HTMLElement | null;
  registerCleanup(dispose: () => void | Promise<void>): Readonly<{
    dispose(): void;
  }>;
}>;

export const OfficialReactSurfaceHostContext =
  createContext<OfficialReactSurfaceHost | null>(null);

export const useOfficialReactSurfaceHost =
  (): OfficialReactSurfaceHost | null =>
    useContext(OfficialReactSurfaceHostContext);
