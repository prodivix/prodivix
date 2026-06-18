import type { ComponentNode } from '@prodivix/shared/types/pir';
import type {
  LayoutPatternDefinition,
  LayoutPatternParamDefinition,
  LayoutPatternParamSchema,
  LayoutPatternResolvedParams,
} from './layoutPattern.types';
import { mergeLayoutPatternParams } from './dataAttributes';
import { LAYOUT_PATTERN_PRESETS } from './presets';

const layoutPatternRegistry = new Map<string, LayoutPatternDefinition>();

const inferDefaultValue = (definition: LayoutPatternParamDefinition) =>
  definition.defaultValue;

const resolveParams = <TSchema extends LayoutPatternParamSchema>(
  schema: TSchema,
  input?: Record<string, unknown>
) =>
  Object.entries(schema).reduce(
    (accumulator, [key, definition]) => {
      const rawValue = input?.[key];
      accumulator[key] =
        rawValue === undefined ? inferDefaultValue(definition) : rawValue;
      return accumulator;
    },
    {} as Record<string, unknown>
  ) as LayoutPatternResolvedParams<TSchema>;

export const registerLayoutPattern = (pattern: LayoutPatternDefinition) => {
  layoutPatternRegistry.set(pattern.id, pattern);
};

export const registerLayoutPatterns = (patterns: LayoutPatternDefinition[]) => {
  patterns.forEach((pattern) => registerLayoutPattern(pattern));
};

export const unregisterLayoutPattern = (patternId: string) => {
  layoutPatternRegistry.delete(patternId);
};

export const getLayoutPatternDefinition = (patternId: string) =>
  layoutPatternRegistry.get(patternId);

export const listLayoutPatterns = () => [...layoutPatternRegistry.values()];

export const buildLayoutPatternNode = ({
  patternId,
  createId,
  params,
}: {
  patternId: string;
  createId: (type: string) => string;
  params?: Record<string, unknown>;
}): ComponentNode | null => {
  const pattern = getLayoutPatternDefinition(patternId);
  if (!pattern) return null;
  const resolvedParams = resolveParams(pattern.schema, params);
  const root = pattern.build({
    createId,
    patternId: pattern.id,
    params: params ?? {},
    resolvedParams,
  });
  const nextProps =
    root.props && typeof root.props === 'object' ? { ...root.props } : {};
  nextProps.dataAttributes = mergeLayoutPatternParams(
    nextProps.dataAttributes,
    resolvedParams as Record<string, unknown>
  );
  return {
    ...root,
    props: nextProps,
  };
};

export const resetLayoutPatternRegistry = () => {
  layoutPatternRegistry.clear();
  registerLayoutPatterns(LAYOUT_PATTERN_PRESETS);
};

resetLayoutPatternRegistry();
