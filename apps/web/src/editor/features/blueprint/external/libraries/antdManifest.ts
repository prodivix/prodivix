import type { ExternalLibraryManifest } from '@/editor/features/blueprint/external/runtime/types';

const SIZE_OPTIONS = [
  { id: 'small', label: 'S', value: 'small' },
  { id: 'middle', label: 'M', value: 'middle' },
  { id: 'large', label: 'L', value: 'large' },
];

const SIZE_PROP_OPTIONS = ['small', 'middle', 'large'];
const BUTTON_TYPE_OPTIONS = ['default', 'primary', 'dashed', 'link', 'text'];

export const antdLibraryManifest: ExternalLibraryManifest = {
  componentOverrides: {
    Button: {
      defaultProps: { type: 'primary', size: 'middle' },
      sizeOptions: SIZE_OPTIONS,
      propOptions: {
        size: SIZE_PROP_OPTIONS,
        type: BUTTON_TYPE_OPTIONS,
      },
    },
    Input: {
      defaultProps: { placeholder: 'Input', size: 'middle' },
      sizeOptions: SIZE_OPTIONS,
      propOptions: {
        size: SIZE_PROP_OPTIONS,
      },
    },
    Modal: {
      defaultProps: {
        open: false,
        title: 'Modal Title',
        getContainer: false,
        mask: false,
        footer: null,
      },
    },
    'Form.Item': {
      displayName: 'Form Item',
      defaultProps: { label: 'Field', name: 'field' },
      groupId: 'antd-data-entry',
      groupTitle: 'Ant Design / Data Entry',
      sizeOptions: SIZE_OPTIONS,
      propOptions: {
        size: SIZE_PROP_OPTIONS,
      },
    },
  },
};
