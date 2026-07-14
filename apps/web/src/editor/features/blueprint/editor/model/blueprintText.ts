import type { BlueprintInspectorNodeView } from '@/editor/features/blueprint/editor/inspector/projection';

export type TextFieldKey = 'text' | 'title' | 'label' | 'description';
export type TextFieldMode = 'plain' | 'rich';

export type EditableTextField = {
  kind: 'node' | 'prop';
  key: TextFieldKey;
  value: string;
};

type TextModeMap = Partial<Record<TextFieldKey, TextFieldMode>>;

const TEXT_PROP_KEYS: TextFieldKey[] = [
  'text',
  'title',
  'label',
  'description',
];
const TEXTUAL_HTML_TAGS = new Set([
  'span',
  'p',
  'a',
  'button',
  'label',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
]);
const TEXTUAL_TYPE_HINTS = [
  'text',
  'heading',
  'paragraph',
  'button',
  'link',
  'label',
];

const getTextModeMap = (node: BlueprintInspectorNodeView): TextModeMap => {
  const raw = node.props?.textMode;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const modeMap: TextModeMap = {};
  TEXT_PROP_KEYS.forEach((key) => {
    const mode = (raw as Record<string, unknown>)[key];
    if (mode === 'plain' || mode === 'rich') modeMap[key] = mode;
  });
  return modeMap;
};

const isTextCapableType = (type: string) => {
  const normalized = type.toLowerCase();
  return (
    TEXTUAL_HTML_TAGS.has(normalized) ||
    TEXTUAL_TYPE_HINTS.some((hint) => normalized.includes(hint))
  );
};

export const getEditableTextFields = (
  node: BlueprintInspectorNodeView
): EditableTextField[] => {
  const fields: EditableTextField[] = [];
  if (typeof node.text === 'string') {
    fields.push({ kind: 'node', key: 'text', value: node.text });
  }
  TEXT_PROP_KEYS.forEach((key) => {
    const value = node.props?.[key];
    if (typeof value === 'string') {
      fields.push({ kind: 'prop', key, value });
    }
  });
  if (fields.length === 0 && isTextCapableType(node.type)) {
    fields.push({ kind: 'node', key: 'text', value: '' });
  }
  return fields;
};

export const getPrimaryTextField = (
  node: BlueprintInspectorNodeView
): EditableTextField | null => {
  const fields = getEditableTextFields(node);
  return (
    fields.find((field) => field.kind === 'prop' && field.key === 'text') ??
    fields.find((field) => field.kind === 'node' && field.key === 'text') ??
    fields.find((field) => field.kind === 'prop' && field.key === 'title') ??
    fields[0] ??
    null
  );
};

export const updateNodeTextField = (
  node: BlueprintInspectorNodeView,
  field: EditableTextField,
  value: string
): BlueprintInspectorNodeView =>
  field.kind === 'node'
    ? { ...node, text: value }
    : {
        ...node,
        props: { ...node.props, [field.key]: value },
      };

export const getNodeTextFieldMode = (
  node: BlueprintInspectorNodeView,
  fieldKey: TextFieldKey
): TextFieldMode => getTextModeMap(node)[fieldKey] ?? 'plain';

export const updateNodeTextFieldMode = (
  node: BlueprintInspectorNodeView,
  fieldKey: TextFieldKey,
  mode: TextFieldMode
): BlueprintInspectorNodeView => ({
  ...node,
  props: {
    ...node.props,
    textMode: { ...getTextModeMap(node), [fieldKey]: mode },
  },
});
