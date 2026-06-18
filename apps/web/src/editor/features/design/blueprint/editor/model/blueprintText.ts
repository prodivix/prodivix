import type { ComponentNode } from '@prodivix/shared/types/pir';

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

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getTextModeMap = (node: ComponentNode): TextModeMap => {
  const props = isPlainObject(node.props) ? node.props : undefined;
  const raw = props?.textMode;
  if (!isPlainObject(raw)) return {};
  const modeMap: TextModeMap = {};
  TEXT_PROP_KEYS.forEach((key) => {
    const mode = raw[key];
    if (mode === 'plain' || mode === 'rich') {
      modeMap[key] = mode;
    }
  });
  return modeMap;
};

const isTextCapableType = (type: string) => {
  const normalized = type.toLowerCase();
  if (TEXTUAL_HTML_TAGS.has(normalized)) return true;
  return TEXTUAL_TYPE_HINTS.some((hint) => normalized.includes(hint));
};

export const getEditableTextFields = (
  node: ComponentNode
): EditableTextField[] => {
  const fields: EditableTextField[] = [];
  if (typeof node.text === 'string') {
    fields.push({ kind: 'node', key: 'text', value: node.text });
  }

  const props = isPlainObject(node.props) ? node.props : undefined;
  if (props) {
    TEXT_PROP_KEYS.forEach((key) => {
      const value = props[key];
      if (typeof value === 'string') {
        fields.push({ kind: 'prop', key, value });
      }
    });
  }

  if (fields.length === 0 && isTextCapableType(node.type)) {
    fields.push({ kind: 'node', key: 'text', value: '' });
  }

  return fields;
};

export const getPrimaryTextField = (
  node: ComponentNode
): EditableTextField | null => {
  const fields = getEditableTextFields(node);
  if (fields.length === 0) return null;

  const propText = fields.find(
    (field) => field.kind === 'prop' && field.key === 'text'
  );
  if (propText) return propText;

  const nodeText = fields.find(
    (field) => field.kind === 'node' && field.key === 'text'
  );
  if (nodeText) return nodeText;

  const propTitle = fields.find(
    (field) => field.kind === 'prop' && field.key === 'title'
  );
  if (propTitle) return propTitle;

  return fields[0];
};

export const updateNodeTextField = (
  node: ComponentNode,
  field: EditableTextField,
  value: string
): ComponentNode => {
  if (field.kind === 'node') {
    return { ...node, text: value };
  }
  const nextProps = {
    ...(isPlainObject(node.props) ? node.props : {}),
    [field.key]: value,
  };
  return { ...node, props: nextProps };
};

export const getNodeTextFieldMode = (
  node: ComponentNode,
  fieldKey: TextFieldKey
): TextFieldMode => getTextModeMap(node)[fieldKey] ?? 'plain';

export const updateNodeTextFieldMode = (
  node: ComponentNode,
  fieldKey: TextFieldKey,
  mode: TextFieldMode
): ComponentNode => {
  const nextProps = {
    ...(isPlainObject(node.props) ? node.props : {}),
  };
  const currentMap = getTextModeMap(node);
  const nextMap: TextModeMap = { ...currentMap, [fieldKey]: mode };
  nextProps.textMode = nextMap;
  return { ...node, props: nextProps };
};
