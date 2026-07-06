import type { ComponentNode } from '@prodivix/shared/types/pir';

export const BUILT_IN_META_SOURCE_PRIORITY = [
  'override',
  'generated',
  'inferred',
] as const;

export type BuiltInMetaSource = (typeof BUILT_IN_META_SOURCE_PRIORITY)[number];

export const BUILT_IN_META_NAMESPACES = {
  builtIn: 'builtIn',
  external: 'external',
} as const;

export type InspectorFieldSource =
  'props' | 'style' | 'text' | 'dataAttributes';

export type BuiltInInspectorControlType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'switch'
  | 'select'
  | 'unit'
  | 'color'
  | 'json'
  | 'icon-group';

export type BuiltInInspectorOption = {
  label: string;
  value: string | number | boolean;
};

export type BuiltInVisibilityOperator =
  'eq' | 'neq' | 'in' | 'notIn' | 'truthy' | 'falsy' | 'exists' | 'notExists';

export type BuiltInVisibilityCondition = {
  path: string;
  operator: BuiltInVisibilityOperator;
  value?: unknown | unknown[];
};

export type BuiltInVisibilityRule = {
  all?: BuiltInVisibilityCondition[];
  any?: BuiltInVisibilityCondition[];
};

export type BuiltInInspectorFieldTransform = {
  toControlValue?: (value: unknown, node: ComponentNode) => unknown;
  toNodeValue?: (value: unknown, node: ComponentNode) => unknown;
};

export type BuiltInInspectorFieldDefinitionBase = {
  id: string;
  label: string;
  description?: string;
  source: InspectorFieldSource;
  path: string;
  group?: string;
  defaultValue?: unknown;
  visibility?: BuiltInVisibilityRule;
  transform?: BuiltInInspectorFieldTransform;
};

export type BuiltInInspectorTextFieldDefinition =
  BuiltInInspectorFieldDefinitionBase & {
    control: 'text' | 'textarea' | 'color' | 'json';
    placeholder?: string;
  };

export type BuiltInInspectorNumberFieldDefinition =
  BuiltInInspectorFieldDefinitionBase & {
    control: 'number' | 'unit';
    min?: number;
    max?: number;
    step?: number;
    unitGroup?: string;
  };

export type BuiltInInspectorBooleanFieldDefinition =
  BuiltInInspectorFieldDefinitionBase & {
    control: 'switch';
  };

export type BuiltInInspectorSelectFieldDefinition =
  BuiltInInspectorFieldDefinitionBase & {
    control: 'select' | 'icon-group';
    options: BuiltInInspectorOption[];
  };

export type BuiltInInspectorFieldDefinition =
  | BuiltInInspectorTextFieldDefinition
  | BuiltInInspectorNumberFieldDefinition
  | BuiltInInspectorBooleanFieldDefinition
  | BuiltInInspectorSelectFieldDefinition;

export type BuiltInInspectorGroupDefinition = {
  id: string;
  label: string;
  description?: string;
  order?: number;
};

export type BuiltInComponentMeta = {
  runtimeType: string;
  source: BuiltInMetaSource;
  version: string;
  groups?: BuiltInInspectorGroupDefinition[];
  fields: BuiltInInspectorFieldDefinition[];
  defaultProps?: Record<string, unknown>;
  propOptions?: Record<string, string[]>;
  behaviorTags?: string[];
};

export type BuiltInComponentMetaRecord = Record<string, BuiltInComponentMeta>;
