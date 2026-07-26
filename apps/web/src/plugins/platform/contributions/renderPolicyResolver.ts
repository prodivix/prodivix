import {
  validateRenderPolicyContribution,
  type RenderPolicyContribution,
  type RenderPolicyRuleDescriptor,
  type RenderSurfaceRequirements,
} from '@prodivix/plugin-contracts';
import {
  defineContributionContract,
  pluginHostFailure,
  pluginHostSuccess,
  type RegisteredContributionContract,
} from '@prodivix/plugin-host';
import type {
  OfficialHostImplementationBinding,
  OfficialHostImplementationRegistry,
  OfficialRenderPolicyImplementation,
} from '@/plugins/platform/officialHostImplementations';
import type {
  ResolvedRenderPolicyContribution,
  WebContributionPointMap,
} from '@/plugins/platform/types';
import type {
  AdapterContext,
  AdapterResult,
  ComponentAdapter,
} from '@prodivix/pir-react-renderer';
import {
  cloneAndFreezeJson,
  resolverFailure,
  toHostDescriptorValidationResult,
} from '@/plugins/platform/contributions/resolverUtils';
import type { OfficialSurfaceLeaseRegistry } from '@/plugins/platform/officialSurfaceHost';

const CONTRACT_VERSION = '2.0';

const applyProps = (
  rule: RenderPolicyRuleDescriptor,
  context: AdapterContext
): Record<string, unknown> => {
  const props: Record<string, unknown> = {
    ...(rule.props?.defaults ?? {}),
    ...context.resolvedProps,
  };
  rule.props?.rename?.forEach(({ from, to }) => {
    if (!Object.prototype.hasOwnProperty.call(props, from)) return;
    if (!Object.prototype.hasOwnProperty.call(props, to)) {
      props[to] = props[from];
    }
    delete props[from];
  });
  rule.props?.omit?.forEach((property) => delete props[property]);
  const canvasOpen = rule.portal.canvasOpen;
  if (
    canvasOpen &&
    context.interactionMode === 'design' &&
    (canvasOpen.when === 'always' ||
      context.isSelected ||
      context.hasSelectedDescendant)
  ) {
    props[canvasOpen.prop] = canvasOpen.value;
  }
  return props;
};

const resolveCanvasInstanceKey = (
  rule: RenderPolicyRuleDescriptor,
  context: AdapterContext
): string | undefined => {
  const canvasOpen = rule.portal.canvasOpen;
  if (!canvasOpen || context.interactionMode !== 'design') return;
  const isForcedOpen =
    canvasOpen.when === 'always' ||
    context.isSelected ||
    context.hasSelectedDescendant;
  return isForcedOpen ? 'canvas-forced-open' : 'canvas-authored-state';
};

const resolveChildren = (
  rule: RenderPolicyRuleDescriptor,
  context: AdapterContext,
  props: Record<string, unknown>
): AdapterResult => {
  if (rule.children.mode === 'text-prop') {
    if (!Object.prototype.hasOwnProperty.call(props, rule.children.prop)) {
      props[rule.children.prop] = context.resolvedText;
    }
    return {
      props,
      supportsChildren: false,
      renderNodeChildren: false,
    };
  }
  if (rule.children.mode === 'text-only') {
    return {
      props,
      children: context.resolvedText,
      supportsChildren: true,
      renderNodeChildren: false,
    };
  }
  if (rule.children.mode === 'children-only') {
    return { props, supportsChildren: true, renderNodeChildren: true };
  }
  if (rule.children.mode === 'none') {
    return {
      props,
      supportsChildren: false,
      renderNodeChildren: false,
    };
  }
  return {
    props,
    children: context.resolvedText,
    supportsChildren: true,
    renderNodeChildren: true,
  };
};

const createAdapter = (
  rule: RenderPolicyRuleDescriptor,
  implementation: OfficialRenderPolicyImplementation | undefined
): ComponentAdapter =>
  Object.freeze({
    kind: 'custom',
    supportsChildren: rule.children.mode !== 'none',
    mapProps: (context) => {
      const props = applyProps(rule, context);
      const instanceKey = resolveCanvasInstanceKey(rule, context);
      const declarative = {
        ...resolveChildren(rule, context, props),
        ...(instanceKey ? { instanceKey } : {}),
      };
      if (!implementation?.mapProps) return declarative;
      let custom: AdapterResult;
      try {
        custom = implementation.mapProps(
          Object.freeze({
            nodeId: context.node.id,
            runtimeType: context.node.type,
            resolvedProps: Object.freeze({
              ...(declarative.props ?? props),
            }),
            resolvedStyle: Object.freeze({ ...context.resolvedStyle }),
            resolvedText: context.resolvedText,
            isSelected: context.isSelected,
            hasSelectedDescendant: context.hasSelectedDescendant,
            surface: 'blueprint-canvas',
          })
        );
      } catch {
        return declarative;
      }
      return {
        ...declarative,
        ...custom,
        props: custom.props ?? declarative.props,
        children: custom.children ?? declarative.children,
        supportsChildren:
          custom.supportsChildren ?? declarative.supportsChildren,
        renderNodeChildren:
          custom.renderNodeChildren ?? declarative.renderNodeChildren,
      };
    },
    applySelection: (props, selectionData) => ({
      ...props,
      ...selectionData,
    }),
  });

const unsupportedSurfaceRequirement = (
  surface: RenderSurfaceRequirements
): string | undefined => {
  if (surface.compatibility === 'container-native') return;
  if (surface.compatibility === 'isolated') {
    return 'component isolation and Design proxy resolution are not available in the current Web Host';
  }
  if (surface.viewport !== 'container') {
    return `viewport mode ${JSON.stringify(surface.viewport)} is not available in the current Web Host`;
  }
  if (surface.browserMetrics !== 'none') {
    return `browser metrics mode ${JSON.stringify(surface.browserMetrics)} is not available in the current Web Host`;
  }
  if (surface.styles !== 'inherited' && surface.styles !== 'owner-scoped') {
    return `style mode ${JSON.stringify(surface.styles)} is not available in the current Web Host`;
  }
  if (surface.focusKeyboard !== 'host-native') {
    return `focus and keyboard mode ${JSON.stringify(surface.focusKeyboard)} is not available in the current Web Host`;
  }
  if (
    surface.intrinsicSize !== 'parent-constrained' &&
    surface.intrinsicSize !== 'explicit'
  ) {
    return `intrinsic size mode ${JSON.stringify(surface.intrinsicSize)} is not available in the current Web Host`;
  }
};

export const createRenderPolicyContributionResolver = (
  implementations: OfficialHostImplementationRegistry,
  surfaceLeases: OfficialSurfaceLeaseRegistry
): RegisteredContributionContract<WebContributionPointMap> =>
  defineContributionContract<
    WebContributionPointMap,
    'renderPolicy',
    RenderPolicyContribution
  >({
    point: 'renderPolicy',
    contractVersion: CONTRACT_VERSION,
    validateDescriptor: (input) =>
      toHostDescriptorValidationResult(
        validateRenderPolicyContribution(input),
        'renderPolicy',
        CONTRACT_VERSION
      ),
    prepare: async ({ owner, attestation, descriptor, signal }) => {
      for (const rule of descriptor.rules) {
        const unsupported = unsupportedSurfaceRequirement(rule.surface);
        if (!unsupported) continue;
        return resolverFailure(
          'renderPolicy',
          `Render rule ${JSON.stringify(rule.id)} cannot resolve its declared ${JSON.stringify(rule.surface.compatibility)} surface: ${unsupported}.`,
          {
            pluginId: owner.pluginId,
            runtimeType: rule.runtimeType,
            compatibility: rule.surface.compatibility,
          },
          CONTRACT_VERSION
        );
      }

      const bindings = new Map<
        string,
        OfficialHostImplementationBinding<'render-policy'>
      >();
      for (const rule of descriptor.rules) {
        const implementationId = rule.hostImplementationId;
        if (!implementationId || bindings.has(implementationId)) continue;
        const binding = await implementations.bind({
          owner,
          attestation,
          implementationId,
          expectedKind: 'render-policy',
          signal,
        });
        if (binding.ok === false) {
          [...bindings.values()].reverse().forEach((item) => item.dispose());
          return pluginHostFailure(binding.diagnostics);
        }
        bindings.set(implementationId, binding.value);
      }

      for (const rule of descriptor.rules) {
        if (rule.portal.mode !== 'host-overlay') continue;
        const implementation = rule.hostImplementationId
          ? bindings.get(rule.hostImplementationId)?.value
          : undefined;
        if (implementation?.wrapComponent) continue;
        [...bindings.values()].reverse().forEach((item) => item.dispose());
        return resolverFailure(
          'renderPolicy',
          `Host-overlay render rule ${JSON.stringify(rule.id)} requires a build-attested component wrapper.`,
          {
            pluginId: owner.pluginId,
            runtimeType: rule.runtimeType,
            implementationId: rule.hostImplementationId,
          },
          CONTRACT_VERSION
        );
      }

      const frozenDescriptor = cloneAndFreezeJson(descriptor);
      const rules = frozenDescriptor.rules.map((rule) => {
        const implementation = rule.hostImplementationId
          ? bindings.get(rule.hostImplementationId)?.value
          : undefined;
        return Object.freeze({
          id: rule.id,
          runtimeType: rule.runtimeType,
          componentExport: rule.componentExport,
          portalMode: rule.portal.mode,
          surface: Object.freeze({ ...rule.surface }),
          adapter: createAdapter(rule, implementation),
          ...(implementation?.wrapComponent
            ? { wrapComponent: implementation.wrapComponent }
            : {}),
          fallback: Object.freeze({ ...rule.fallback }),
        });
      });
      let disposePromise: Promise<void> | undefined;
      return pluginHostSuccess({
        value: Object.freeze({
          descriptor: frozenDescriptor,
          libraryId: frozenDescriptor.libraryId,
          surface: Object.freeze({ ...frozenDescriptor.surface }),
          rules: Object.freeze(rules),
        }) satisfies ResolvedRenderPolicyContribution,
        lifetime: 'installation',
        dependsOnCapabilities: [],
        dispose: () => {
          if (disposePromise) return disposePromise;
          disposePromise = (async () => {
            try {
              await surfaceLeases.releaseOwner(owner);
            } finally {
              [...bindings.values()]
                .reverse()
                .forEach((item) => item.dispose());
            }
          })();
          return disposePromise;
        },
      });
    },
  });
