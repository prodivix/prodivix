import type { TextFieldKey } from '@/editor/features/blueprint/editor/model/blueprintText';

export const getTextFieldLabel = (
  key: TextFieldKey,
  translate: (key: string, options?: Record<string, unknown>) => string
): string =>
  translate(`inspector.fields.${key}.label`, {
    defaultValue:
      key === 'text'
        ? 'Text'
        : key === 'title'
          ? 'Title'
          : key === 'label'
            ? 'Label'
            : 'Description',
  });
