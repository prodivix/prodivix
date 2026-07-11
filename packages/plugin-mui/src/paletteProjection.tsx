import type {
  OfficialPalettePreviewItem,
  OfficialPaletteProjectionImplementation,
} from '@prodivix/plugin-react-host';
import { createElement, type ReactNode } from 'react';
import {
  MUI_COMPONENTS,
  type MuiComponentExportName,
} from '#mui-plugin/componentCatalog';
import { wrapMuiComponent } from '#mui-plugin/muiSurfaceHost';

const SURFACE_COMPONENTS = Object.freeze(
  Object.fromEntries(
    Object.entries(MUI_COMPONENTS).map(([exportName, component]) => [
      exportName,
      wrapMuiComponent(component),
    ])
  ) as Record<MuiComponentExportName, React.ElementType>
);

const renderPreview = (
  exportName: MuiComponentExportName,
  options: Readonly<{ size?: string; status?: string }> = {}
): ReactNode => {
  const Component = SURFACE_COMPONENTS[exportName];
  switch (exportName) {
    case 'Button':
      return createElement(
        Component,
        {
          variant: options.status ?? 'contained',
          size: options.size ?? 'medium',
        },
        'Button'
      );
    case 'TextField':
      return createElement(Component, {
        label: 'Text Field',
        size: options.size ?? 'small',
        variant: options.status ?? 'outlined',
      });
    case 'Checkbox':
    case 'Radio':
    case 'Switch':
      return createElement(Component, {
        defaultChecked: true,
        size: options.size ?? 'medium',
        inputProps: { 'aria-label': `${exportName} preview` },
      });
    case 'Slider':
      return createElement(Component, {
        value: 40,
        size: options.size ?? 'medium',
        'aria-label': 'Slider preview',
        sx: { width: 120 },
      });
    case 'Card':
      return createElement(
        Component,
        { variant: 'outlined', sx: { minWidth: 112, padding: 1 } },
        'Card'
      );
    case 'Paper':
      return createElement(
        Component,
        { elevation: 1, sx: { padding: 1 } },
        'Paper'
      );
    case 'Accordion': {
      const Summary = SURFACE_COMPONENTS.AccordionSummary;
      const Details = SURFACE_COMPONENTS.AccordionDetails;
      return createElement(
        Component,
        { defaultExpanded: true, disableGutters: true, sx: { minWidth: 144 } },
        createElement(Summary, null, 'Accordion'),
        createElement(Details, null, 'Details')
      );
    }
    case 'Tabs':
      return createElement(Component, {
        value: false,
        'aria-label': 'Tabs preview',
        sx: { minWidth: 120, minHeight: 32 },
      });
    case 'Box':
      return createElement(Component, { sx: { padding: 1 } }, 'Box');
    case 'Stack':
      return createElement(
        Component,
        { direction: 'row', spacing: 1 },
        'Stack'
      );
    case 'Grid':
      return createElement(Component, { container: true, spacing: 1 }, 'Grid');
    case 'Container':
      return createElement(Component, { maxWidth: 'sm' }, 'Container');
    case 'Alert':
      return createElement(
        Component,
        { severity: options.status ?? 'info' },
        'Alert'
      );
    case 'Snackbar':
      return createElement(Component, { open: false, message: 'Snackbar' });
    case 'Dialog':
      return createElement(Component, { open: false }, 'Dialog');
    case 'CircularProgress':
      return createElement(Component, { size: 28, 'aria-label': 'Progress' });
    case 'AccordionSummary':
      return createElement(Component, null, 'Accordion');
    case 'AccordionDetails':
      return createElement(Component, null, 'Details');
  }
};

const sizes = Object.freeze([
  Object.freeze({ id: 'small', label: 'S', value: 'small' }),
  Object.freeze({ id: 'medium', label: 'M', value: 'medium' }),
  Object.freeze({ id: 'large', label: 'L', value: 'large' }),
]);

type PaletteItemInput = Omit<OfficialPalettePreviewItem, 'preview'> &
  Readonly<{ exportName: MuiComponentExportName }>;

const item = ({ exportName, ...input }: PaletteItemInput) =>
  Object.freeze({
    ...input,
    preview: renderPreview(exportName),
    renderPreview: (options: Readonly<{ size?: string; status?: string }>) =>
      renderPreview(exportName, options),
  });

export const MUI_PALETTE_PROJECTION = Object.freeze({
  kind: 'palette-projection',
  groups: Object.freeze([
    Object.freeze({
      id: 'mui-inputs',
      title: 'Material UI / Inputs',
      source: 'external',
      items: Object.freeze([
        item({
          exportName: 'Button',
          id: 'mui-button',
          name: 'Button',
          libraryId: 'mui',
          runtimeType: 'MuiButton',
          defaultProps: { variant: 'contained', size: 'medium' },
          sizeOptions: sizes,
          statusProp: 'variant',
          statusLabel: 'Variant',
          defaultStatus: 'contained',
          statusOptions: Object.freeze([
            Object.freeze({ id: 'text', label: 'Text', value: 'text' }),
            Object.freeze({
              id: 'outlined',
              label: 'Outlined',
              value: 'outlined',
            }),
            Object.freeze({
              id: 'contained',
              label: 'Contained',
              value: 'contained',
            }),
          ]),
        }),
        item({
          exportName: 'TextField',
          id: 'mui-text-field',
          name: 'Text Field',
          libraryId: 'mui',
          runtimeType: 'MuiTextField',
          defaultProps: {
            label: 'Text Field',
            size: 'small',
            variant: 'outlined',
          },
          sizeOptions: sizes.slice(0, 2),
        }),
        item({
          exportName: 'Checkbox',
          id: 'mui-checkbox',
          name: 'Checkbox',
          libraryId: 'mui',
          runtimeType: 'MuiCheckbox',
          defaultProps: {},
          sizeOptions: sizes.slice(0, 2),
        }),
        item({
          exportName: 'Radio',
          id: 'mui-radio',
          name: 'Radio',
          libraryId: 'mui',
          runtimeType: 'MuiRadio',
          defaultProps: {},
          sizeOptions: sizes.slice(0, 2),
        }),
        item({
          exportName: 'Switch',
          id: 'mui-switch',
          name: 'Switch',
          libraryId: 'mui',
          runtimeType: 'MuiSwitch',
          defaultProps: {},
          sizeOptions: sizes.slice(0, 2),
        }),
        item({
          exportName: 'Slider',
          id: 'mui-slider',
          name: 'Slider',
          libraryId: 'mui',
          runtimeType: 'MuiSlider',
          defaultProps: { value: 40 },
          sizeOptions: sizes.slice(0, 2),
        }),
      ]),
    }),
    Object.freeze({
      id: 'mui-surfaces',
      title: 'Material UI / Surfaces',
      source: 'external',
      items: Object.freeze([
        item({
          exportName: 'Card',
          id: 'mui-card',
          name: 'Card',
          libraryId: 'mui',
          runtimeType: 'MuiCard',
          defaultProps: { variant: 'outlined' },
        }),
        item({
          exportName: 'Paper',
          id: 'mui-paper',
          name: 'Paper',
          libraryId: 'mui',
          runtimeType: 'MuiPaper',
          defaultProps: { elevation: 1, sx: { padding: 2 } },
        }),
        item({
          exportName: 'Accordion',
          id: 'mui-accordion',
          name: 'Accordion',
          libraryId: 'mui',
          defaultProps: { defaultExpanded: true },
        }),
        item({
          exportName: 'Tabs',
          id: 'mui-tabs',
          name: 'Tabs',
          libraryId: 'mui',
          runtimeType: 'MuiTabs',
          defaultProps: { value: false, variant: 'standard' },
        }),
      ]),
    }),
    Object.freeze({
      id: 'mui-layout',
      title: 'Material UI / Layout',
      source: 'external',
      items: Object.freeze([
        item({
          exportName: 'Box',
          id: 'mui-box',
          name: 'Box',
          libraryId: 'mui',
          runtimeType: 'MuiBox',
          defaultProps: { sx: { padding: 2 } },
        }),
        item({
          exportName: 'Stack',
          id: 'mui-stack',
          name: 'Stack',
          libraryId: 'mui',
          runtimeType: 'MuiStack',
          defaultProps: { direction: 'row', spacing: 2 },
        }),
        item({
          exportName: 'Grid',
          id: 'mui-grid',
          name: 'Grid',
          libraryId: 'mui',
          runtimeType: 'MuiGrid',
          defaultProps: { container: true, spacing: 2 },
        }),
        item({
          exportName: 'Container',
          id: 'mui-container',
          name: 'Container',
          libraryId: 'mui',
          runtimeType: 'MuiContainer',
          defaultProps: { maxWidth: 'sm' },
        }),
      ]),
    }),
    Object.freeze({
      id: 'mui-feedback',
      title: 'Material UI / Feedback',
      source: 'external',
      items: Object.freeze([
        item({
          exportName: 'Alert',
          id: 'mui-alert',
          name: 'Alert',
          libraryId: 'mui',
          runtimeType: 'MuiAlert',
          defaultProps: { severity: 'info' },
          statusProp: 'severity',
          statusLabel: 'Severity',
          defaultStatus: 'info',
          statusOptions: Object.freeze([
            Object.freeze({
              id: 'success',
              label: 'Success',
              value: 'success',
            }),
            Object.freeze({ id: 'info', label: 'Info', value: 'info' }),
            Object.freeze({
              id: 'warning',
              label: 'Warning',
              value: 'warning',
            }),
            Object.freeze({ id: 'error', label: 'Error', value: 'error' }),
          ]),
        }),
        item({
          exportName: 'Snackbar',
          id: 'mui-snackbar',
          name: 'Snackbar',
          libraryId: 'mui',
          runtimeType: 'MuiSnackbar',
          defaultProps: { message: 'Snackbar', open: false },
        }),
        item({
          exportName: 'Dialog',
          id: 'mui-dialog',
          name: 'Dialog',
          libraryId: 'mui',
          runtimeType: 'MuiDialog',
          defaultProps: {
            open: false,
            fullWidth: true,
            maxWidth: 'sm',
          },
        }),
        item({
          exportName: 'CircularProgress',
          id: 'mui-circular-progress',
          name: 'Circular Progress',
          libraryId: 'mui',
          runtimeType: 'MuiCircularProgress',
          defaultProps: { size: 32 },
        }),
      ]),
    }),
  ]),
}) satisfies OfficialPaletteProjectionImplementation;
