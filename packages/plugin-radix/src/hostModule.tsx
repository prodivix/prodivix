import {
  Children,
  createElement,
  useEffect,
  useState,
  type ElementType,
  type ReactNode,
} from 'react';
import {
  useOfficialReactSurfaceHost,
  type OfficialHostModule,
  type OfficialRenderPolicyImplementation,
} from '@prodivix/plugin-react-host';
import { GENERATED_OFFICIAL_PLUGIN_CATALOG } from '#radix/catalog.generated';
import { RADIX_COMPONENT_EXPORTS } from '#radix/componentCatalog';
import { RADIX_PALETTE_PROJECTION } from '#radix/paletteProjection';

const CONTROLLED_DEFAULT_PAIRS = Object.freeze([
  Object.freeze(['value', 'defaultValue'] as const),
  Object.freeze(['open', 'defaultOpen'] as const),
  Object.freeze(['checked', 'defaultChecked'] as const),
]);

export const normalizeRadixControllableProps = (
  input: Readonly<Record<string, unknown>>
): Record<string, unknown> => {
  const props = { ...input };
  CONTROLLED_DEFAULT_PAIRS.forEach(([controlled, uncontrolled]) => {
    if (
      Object.prototype.hasOwnProperty.call(props, controlled) &&
      props[controlled] !== undefined
    ) {
      delete props[uncontrolled];
    }
  });
  return props;
};

type PortalProps = Record<string, unknown> & { children?: ReactNode };

/**
 * Binds a Radix Portal to the current editor surface. The wrapper never falls
 * back to document.body and registers a lease that can synchronously hide the
 * portal during plugin disable, generation replacement, or Host shutdown.
 */
export const createScopedRadixPortal = (
  component: ElementType
): ElementType => {
  const ScopedRadixPortal = (props: PortalProps) => {
    const host = useOfficialReactSurfaceHost();
    const container = host?.getOverlayContainer() ?? null;
    const [active, setActive] = useState(true);

    useEffect(() => {
      if (!host || !container) return;
      setActive(true);
      const lease = host.registerCleanup(() => setActive(false));
      return () => lease.dispose();
    }, [container, host]);

    if (!container || !active) return null;
    const children = Children.toArray(props.children);
    return createElement(component, {
      ...props,
      children: children.length === 1 ? children[0] : children,
      container,
    });
  };
  ScopedRadixPortal.displayName = `ScopedRadixPortal(${
    typeof component === 'string'
      ? component
      : (component.displayName ?? component.name ?? 'Component')
  })`;
  return ScopedRadixPortal;
};

const controlledStateImplementation = Object.freeze({
  kind: 'render-policy',
  mapProps: ({ resolvedProps }) => ({
    props: normalizeRadixControllableProps(resolvedProps),
  }),
}) satisfies OfficialRenderPolicyImplementation;

const hostOverlayImplementation = Object.freeze({
  kind: 'render-policy',
  wrapComponent: createScopedRadixPortal,
}) satisfies OfficialRenderPolicyImplementation;

export const RADIX_OFFICIAL_HOST_MODULE = Object.freeze({
  implementations: Object.freeze({
    'radix.components': Object.freeze({
      kind: 'component-library',
      package: Object.freeze({
        name: GENERATED_OFFICIAL_PLUGIN_CATALOG.package.name,
        version: GENERATED_OFFICIAL_PLUGIN_CATALOG.package.version,
      }),
      components: RADIX_COMPONENT_EXPORTS,
    }),
    'radix.palette': RADIX_PALETTE_PROJECTION,
    'radix.controlled-state': controlledStateImplementation,
    'radix.host-overlay': hostOverlayImplementation,
  }),
}) satisfies OfficialHostModule;
