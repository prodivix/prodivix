import type { ExternalLibraryManifest } from '@/editor/features/blueprint/external/runtime/types';

const SIZE_OPTIONS = [
  { id: 'small', label: 'S', value: 'small' },
  { id: 'medium', label: 'M', value: 'medium' },
  { id: 'large', label: 'L', value: 'large' },
];

export const muiLibraryManifest: ExternalLibraryManifest = {
  componentOverrides: {
    Button: {
      defaultProps: { variant: 'contained', size: 'medium' },
      sizeOptions: SIZE_OPTIONS,
      groupId: 'mui-inputs',
      groupTitle: 'Material UI / Inputs',
    },
    TextField: {
      defaultProps: { label: 'Text Field', size: 'small', variant: 'outlined' },
      sizeOptions: [
        { id: 'small', label: 'S', value: 'small' },
        { id: 'medium', label: 'M', value: 'medium' },
      ],
      groupId: 'mui-inputs',
      groupTitle: 'Material UI / Inputs',
    },
    Card: {
      defaultProps: { variant: 'outlined' },
      groupId: 'mui-surfaces',
      groupTitle: 'Material UI / Surfaces',
    },
    Dialog: {
      defaultProps: { open: false, fullWidth: true, maxWidth: 'sm' },
      groupId: 'mui-feedback',
      groupTitle: 'Material UI / Feedback',
    },
  },
};
