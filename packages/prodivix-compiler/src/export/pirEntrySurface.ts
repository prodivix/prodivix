const MOUNT_SELECTORS = {
  react: '#root',
  vue: '#app',
} as const;

export type PirEntrySurfaceTarget = keyof typeof MOUNT_SELECTORS;

/**
 * Defines the generated application mount as a viewport-sized grid surface.
 * The zero-specificity selectors let authored application CSS override every
 * default without coupling the scaffold to a PIR node or component type.
 */
export const createPirEntrySurfaceCss = (
  target: PirEntrySurfaceTarget
): string => {
  const mountSelector = MOUNT_SELECTORS[target];
  return `:where(html, body) {
  min-width: 100%;
  min-height: 100%;
}

:where(body) {
  margin: 0;
}

:where(${mountSelector}) {
  display: grid;
  min-width: 100%;
  min-height: 100dvh;
  grid-template-rows: minmax(100dvh, auto);
}
`;
};
