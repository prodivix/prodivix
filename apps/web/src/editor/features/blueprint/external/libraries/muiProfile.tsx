import React from 'react';
import type { ComponentAdapter } from '@/pir/renderer/registry';
import type { ComponentPreviewItem } from '@/editor/features/blueprint/editor/model/types';
import type {
  CanonicalExternalComponent,
  ExternalCanonicalGroup,
  ExternalLibraryDescriptor,
  ExternalLibraryProfile,
} from '@/editor/features/blueprint/external/runtime/types';
import {
  getValueByPath,
  isRenderableComponent,
  toKebabCase,
  toPascalCase,
} from '@/editor/features/blueprint/external/runtime/utils';
import { muiLibraryManifest } from './muiManifest';

type MuiModule = Record<string, unknown>;

type MuiGroupDefinition = {
  id: string;
  title: string;
  components: string[];
};

const createMuiEsmUrlCandidates = (cacheBust: string) => [
  `https://esm.sh/@mui/material@7.3.2?target=es2022&external=react,react-dom&deps=@emotion/react,@emotion/styled&v=${cacheBust}`,
  `https://esm.sh/v135/@mui/material@7.3.2/es2022/material.mjs?external=react,react-dom&deps=@emotion/react,@emotion/styled&v=${cacheBust}`,
];
const MUI_SESSION_CACHE_BUST = `session-${Date.now().toString(36)}`;

const createMuiLibraryDescriptor = (): ExternalLibraryDescriptor => {
  return {
    libraryId: 'mui',
    packageName: '@mui/material',
    version: '7.3.2',
    source: 'esm.sh',
    entryCandidates: createMuiEsmUrlCandidates(MUI_SESSION_CACHE_BUST),
  };
};

const MUI_GROUPS: MuiGroupDefinition[] = [
  {
    id: 'mui-inputs',
    title: 'Material UI / Inputs',
    components: [
      'Button',
      'TextField',
      'Checkbox',
      'Radio',
      'Switch',
      'Slider',
    ],
  },
  {
    id: 'mui-surfaces',
    title: 'Material UI / Surfaces',
    components: ['Card', 'Paper', 'Accordion', 'Tabs'],
  },
  {
    id: 'mui-layout',
    title: 'Material UI / Layout',
    components: ['Box', 'Stack', 'Grid', 'Container'],
  },
  {
    id: 'mui-feedback',
    title: 'Material UI / Feedback',
    components: ['Alert', 'Snackbar', 'Dialog', 'CircularProgress'],
  },
];

const NON_COMPONENT_EXPORTS = new Set([
  'default',
  'colors',
  'styled',
  'useTheme',
  'ThemeProvider',
  'createTheme',
  'alpha',
  'darken',
  'lighten',
]);

class MuiPreviewBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <div className="text-[10px] text-(--text-muted)">Preview</div>;
    }
    return this.props.children;
  }
}

const muiTextAdapter: ComponentAdapter = {
  kind: 'custom',
  supportsChildren: true,
  mapProps: ({ resolvedProps, resolvedText }) => ({
    props: { ...resolvedProps },
    children:
      (resolvedProps.children as React.ReactNode) ??
      (resolvedText ? String(resolvedText) : null),
  }),
};

const muiInputAdapter: ComponentAdapter = {
  kind: 'custom',
  supportsChildren: false,
  mapProps: ({ resolvedProps, resolvedText }) => {
    const props = { ...resolvedProps };
    if (resolvedText !== undefined && props.value === undefined) {
      props.value = String(resolvedText);
    }
    return { props };
  },
};

const muiDialogAdapter: ComponentAdapter = {
  kind: 'custom',
  supportsChildren: true,
  mapProps: ({ resolvedProps, resolvedText }) => {
    const props = { ...resolvedProps };
    if (props.open === undefined) props.open = false;
    if (props.fullWidth === undefined) props.fullWidth = true;
    if (props.maxWidth === undefined) props.maxWidth = 'sm';
    if (props.disablePortal === undefined) props.disablePortal = true;
    if (props.hideBackdrop === undefined) props.hideBackdrop = true;
    return {
      props,
      children:
        (props.children as React.ReactNode) ??
        (resolvedText ? String(resolvedText) : null),
    };
  },
};

const muiAccordionAdapter: ComponentAdapter = {
  kind: 'custom',
  supportsChildren: true,
  mapProps: ({ node, resolvedProps, resolvedText }) => {
    const props = { ...resolvedProps };
    const hasNodeChildren = Boolean(node.children?.length);
    if (hasNodeChildren) {
      return {
        props,
      };
    }

    const summaryId = `${node.id}-summary`;
    const regionId = `${node.id}-region`;
    const summaryLabel =
      typeof resolvedText === 'string' && resolvedText.trim().length > 0
        ? resolvedText
        : 'Accordion';

    return {
      props,
      children: [
        <div key="summary" id={summaryId} aria-controls={regionId}>
          {summaryLabel}
        </div>,
        <div key="details">Details</div>,
      ],
    };
  },
};

const pathToRuntimeType = (path: string) =>
  `Mui${path.split('.').map(toPascalCase).join('')}`;

const pathToItemId = (path: string) =>
  `mui-${path.split('.').map(toKebabCase).join('-')}`;

const getComponentByPath = (
  module: MuiModule,
  path: string
): React.ElementType | undefined => {
  const cursor = getValueByPath(module, path);
  return isRenderableComponent(cursor)
    ? (cursor as React.ElementType)
    : undefined;
};

const getAdapterByPath = (path: string): ComponentAdapter => {
  if (path === 'TextField') return muiInputAdapter;
  if (path === 'Dialog') return muiDialogAdapter;
  if (path === 'Accordion') return muiAccordionAdapter;
  return muiTextAdapter;
};

const renderMuiPreview = (
  path: string,
  component: React.ElementType,
  options?: { size?: string; status?: string }
): React.ReactNode => {
  const size = options?.size;
  const status = options?.status;
  switch (path) {
    case 'Button':
      return React.createElement(
        component,
        { variant: status ?? 'contained', size: size ?? 'medium' },
        'Button'
      );
    case 'TextField':
      return React.createElement(component, {
        label: 'Text Field',
        size: size ?? 'small',
        variant: status ?? 'outlined',
      });
    case 'Card':
      return React.createElement(
        component,
        { variant: 'outlined', sx: { p: 1, minWidth: 120 } },
        'Card'
      );
    case 'Dialog':
      return React.createElement(
        component,
        {
          open: true,
          fullWidth: true,
          maxWidth: 'sm',
          disablePortal: true,
          hideBackdrop: true,
        },
        React.createElement('div', { style: { padding: 8 } }, 'Dialog')
      );
    case 'Alert':
      return React.createElement(
        component,
        { severity: status ?? 'info' },
        'Alert'
      );
    default:
      return React.createElement(component, size ? { size } : null);
  }
};

const defaultPropsForPath = (path: string): Record<string, unknown> => {
  if (path === 'Button') return { variant: 'contained', size: 'medium' };
  if (path === 'TextField')
    return { label: 'Text Field', size: 'small', variant: 'outlined' };
  if (path === 'Card') return { variant: 'outlined' };
  if (path === 'Dialog')
    return {
      open: false,
      fullWidth: true,
      maxWidth: 'sm',
      disablePortal: true,
      hideBackdrop: true,
    };
  return {};
};

const createPreviewItem = (
  path: string,
  component: React.ElementType
): ComponentPreviewItem => ({
  id: pathToItemId(path),
  name: path,
  runtimeType: pathToRuntimeType(path),
  defaultProps: defaultPropsForPath(path),
  preview: <div className="text-[10px] text-(--text-muted)">{path}</div>,
  renderPreview: ({ size, status }) => (
    <MuiPreviewBoundary>
      {renderMuiPreview(path, component, { size, status })}
    </MuiPreviewBoundary>
  ),
});

const buildMuiGroups = (
  discoveredComponents: CanonicalExternalComponent[]
): ExternalCanonicalGroup[] => {
  const componentByPath = new Map(
    discoveredComponents.map((item) => [item.path, item])
  );
  const knownPaths = new Set(MUI_GROUPS.flatMap((group) => group.components));
  const extraPaths = discoveredComponents
    .map((item) => item.path)
    .filter((path) => !knownPaths.has(path))
    .sort();

  const groups: ExternalCanonicalGroup[] = [];
  MUI_GROUPS.forEach((group) => {
    const items = group.components
      .map((path) => componentByPath.get(path) ?? null)
      .filter((item): item is CanonicalExternalComponent => Boolean(item));
    if (items.length > 0) {
      groups.push({
        id: group.id,
        title: group.title,
        source: 'external',
        items,
      });
    }
  });

  if (extraPaths.length > 0) {
    groups.push({
      id: 'mui-other',
      title: 'Material UI / Other',
      source: 'external',
      items: extraPaths
        .map((path) => componentByPath.get(path) ?? null)
        .filter((item): item is CanonicalExternalComponent => Boolean(item)),
    });
  }

  return groups;
};

const toCanonicalComponent = (
  path: string,
  module: MuiModule
): CanonicalExternalComponent | null => {
  const component = getComponentByPath(module, path);
  if (!component) return null;
  const item = createPreviewItem(path, component);
  return {
    libraryId: 'mui',
    componentName: path,
    component,
    runtimeType: pathToRuntimeType(path),
    itemId: item.id,
    preview: item.preview,
    renderPreview: item.renderPreview,
    sizeOptions: item.sizeOptions,
    defaultProps: item.defaultProps,
    adapter: getAdapterByPath(path),
    path,
    behaviorTags: [],
    codegenHints: {},
    propsSchema: {},
    slots: [],
  };
};

const collectCanonicalComponents = (
  module: MuiModule,
  paths: string[]
): CanonicalExternalComponent[] =>
  paths
    .map((path) => toCanonicalComponent(path, module))
    .filter((value): value is CanonicalExternalComponent => Boolean(value));

export const muiExternalLibraryProfile: ExternalLibraryProfile = {
  descriptor: createMuiLibraryDescriptor,
  includePaths: MUI_GROUPS.flatMap((group) => group.components),
  excludeExports: NON_COMPONENT_EXPORTS,
  scanMode: 'include-only',
  manifest: muiLibraryManifest,
  toCanonicalComponents: (module, paths) =>
    collectCanonicalComponents(module, paths),
  toGroups: buildMuiGroups,
};
