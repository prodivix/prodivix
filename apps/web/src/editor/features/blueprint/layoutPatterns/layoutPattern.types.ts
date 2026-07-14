import type { BlueprintInspectorNodeView } from '@/editor/features/blueprint/editor/inspector/projection';

export const LAYOUT_PATTERN_PARAM_KINDS = [
  'number',
  'enum',
  'length',
  'boolean',
] as const;

export type LayoutPatternParamKind =
  (typeof LAYOUT_PATTERN_PARAM_KINDS)[number];

export type LayoutPatternCategory = 'page' | 'section' | 'grid' | 'composite';

export const LAYOUT_PATTERN_ROLES = [
  'root',
  'header',
  'sidebar',
  'main',
  'footer',
  'left',
  'right',
  'top',
  'bottom',
  'content',
] as const;

export type LayoutPatternRole = (typeof LAYOUT_PATTERN_ROLES)[number];

type LayoutPatternParamDefinitionBase<
  TKind extends LayoutPatternParamKind,
  TValue,
> = {
  kind: TKind;
  label: string;
  description?: string;
  defaultValue: TValue;
  required?: boolean;
};

export type LayoutPatternNumberParamDefinition =
  LayoutPatternParamDefinitionBase<'number', number> & {
    min?: number;
    max?: number;
    step?: number;
  };

export type LayoutPatternEnumParamDefinition = LayoutPatternParamDefinitionBase<
  'enum',
  string
> & {
  options: ReadonlyArray<{
    label: string;
    value: string;
  }>;
};

export type LayoutPatternLengthParamDefinition =
  LayoutPatternParamDefinitionBase<'length', string | number> & {
    units?: ReadonlyArray<string>;
    allowNegative?: boolean;
  };

export type LayoutPatternBooleanParamDefinition =
  LayoutPatternParamDefinitionBase<'boolean', boolean>;

export type LayoutPatternParamDefinition =
  | LayoutPatternNumberParamDefinition
  | LayoutPatternEnumParamDefinition
  | LayoutPatternLengthParamDefinition
  | LayoutPatternBooleanParamDefinition;

export type LayoutPatternParamSchema = Record<
  string,
  LayoutPatternParamDefinition
>;

type InferLayoutPatternParamValue<TParam extends LayoutPatternParamDefinition> =
  TParam extends LayoutPatternNumberParamDefinition
    ? number
    : TParam extends LayoutPatternEnumParamDefinition
      ? string
      : TParam extends LayoutPatternLengthParamDefinition
        ? string | number
        : TParam extends LayoutPatternBooleanParamDefinition
          ? boolean
          : never;

export type LayoutPatternResolvedParams<
  TSchema extends LayoutPatternParamSchema,
> = {
  [Key in keyof TSchema]: InferLayoutPatternParamValue<TSchema[Key]>;
};

export type LayoutPatternBuildContext<
  TSchema extends LayoutPatternParamSchema = LayoutPatternParamSchema,
> = {
  createId: (type: string) => string;
  patternId: string;
  params: Record<string, unknown>;
  resolvedParams: LayoutPatternResolvedParams<TSchema>;
};

export type LayoutPatternUpdateContext<
  TSchema extends LayoutPatternParamSchema = LayoutPatternParamSchema,
> = {
  patternId: string;
  currentParams: LayoutPatternResolvedParams<TSchema>;
  patch: Partial<LayoutPatternResolvedParams<TSchema>>;
  nextParams: LayoutPatternResolvedParams<TSchema>;
};

export type LayoutPatternDefinition<
  TSchema extends LayoutPatternParamSchema = LayoutPatternParamSchema,
> = {
  id: string;
  name: string;
  category: LayoutPatternCategory;
  description?: string;
  schema: TSchema;
  build: (
    context: LayoutPatternBuildContext<TSchema>
  ) => BlueprintInspectorNodeView;
  update: (
    root: BlueprintInspectorNodeView,
    context: LayoutPatternUpdateContext<TSchema>
  ) => BlueprintInspectorNodeView;
};
