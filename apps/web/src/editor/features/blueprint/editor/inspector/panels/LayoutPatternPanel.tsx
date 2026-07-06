import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { PdxInput, PdxSelect } from '@prodivix/ui';
import { getLayoutPatternDefinition } from '@/editor/features/blueprint/layoutPatterns/registry';
import {
  getLayoutPatternId,
  getLayoutPatternParams,
  isLayoutPatternRootNode,
  mergeLayoutPatternParams,
} from '@/editor/features/blueprint/layoutPatterns/dataAttributes';
import type {
  LayoutPatternParamSchema,
  LayoutPatternResolvedParams,
} from '@/editor/features/blueprint/layoutPatterns/layoutPattern.types';
import type { ComponentNode } from '@prodivix/shared/types/pir';
import type {
  InspectorPanelDefinition,
  InspectorPanelRenderProps,
} from './types';
import { InspectorRow } from '@/editor/features/blueprint/editor/inspector/components/InspectorRow';
import { PresetInput } from '@/editor/features/blueprint/editor/inspector/components/PresetInput';
import { UnitInput } from '@/editor/features/blueprint/editor/inspector/components/UnitInput';

const resolveParams = (
  schema: LayoutPatternParamSchema,
  raw: Record<string, string>
) => {
  type ResolvedLayoutParams =
    LayoutPatternResolvedParams<LayoutPatternParamSchema>;
  return Object.entries(schema).reduce<
    Record<string, string | number | boolean>
  >((accumulator, [key, definition]) => {
    const value = raw[key];
    if (value === undefined) {
      accumulator[key] = definition.defaultValue;
      return accumulator;
    }
    if (definition.kind === 'number') {
      const next = Number(value);
      accumulator[key] = Number.isFinite(next) ? next : definition.defaultValue;
      return accumulator;
    }
    if (definition.kind === 'boolean') {
      accumulator[key] = value === 'true';
      return accumulator;
    }
    accumulator[key] = value;
    return accumulator;
  }, {}) as ResolvedLayoutParams;
};

const withPatternParams = (
  root: ComponentNode,
  params: LayoutPatternResolvedParams<LayoutPatternParamSchema>
) => {
  const nextProps =
    root.props && typeof root.props === 'object' ? { ...root.props } : {};
  nextProps.dataAttributes = mergeLayoutPatternParams(
    nextProps.dataAttributes,
    params
  );
  return {
    ...root,
    props: nextProps,
  };
};

function LayoutPatternPanelView({
  node,
  updateNode,
}: InspectorPanelRenderProps) {
  const { t } = useTranslation('blueprint');
  const patternId = getLayoutPatternId(node);
  const pattern = patternId ? getLayoutPatternDefinition(patternId) : undefined;
  const currentParams = useMemo(() => {
    if (!pattern) return {};
    return resolveParams(pattern.schema, getLayoutPatternParams(node));
  }, [node, pattern]);

  if (!pattern || !patternId) return null;
  const splitCategory =
    patternId === 'split' && typeof currentParams.category === 'string'
      ? currentParams.category
      : null;
  const getFieldLabel = (fieldKey: string, fallback: string) =>
    t(`inspector.panels.layoutPattern.fields.${patternId}.${fieldKey}.label`, {
      defaultValue: fallback,
    });
  const getOptionLabel = (
    fieldKey: string,
    optionValue: string,
    fallback: string
  ) =>
    t(
      `inspector.panels.layoutPattern.fields.${patternId}.${fieldKey}.options.${optionValue}`,
      {
        defaultValue: fallback,
      }
    );

  const updatePatternParam = (
    key: string,
    value: string | number | boolean
  ) => {
    updateNode((current) => {
      const definition = getLayoutPatternDefinition(patternId);
      if (!definition) return current;
      const currentResolved = resolveParams(
        definition.schema,
        getLayoutPatternParams(current)
      );
      const nextParams = {
        ...currentResolved,
        [key]: value,
      } as LayoutPatternResolvedParams<LayoutPatternParamSchema>;
      const nextRoot = definition.update(current, {
        patternId,
        currentParams: currentResolved,
        patch: {
          [key]: value,
        } as Partial<LayoutPatternResolvedParams<LayoutPatternParamSchema>>,
        nextParams,
      });
      return withPatternParams(nextRoot, nextParams);
    });
  };

  return (
    <div className="InspectorSection flex flex-col gap-2">
      {patternId === 'split' && splitCategory === '2-columns' ? (
        <div className="rounded-md border border-(--border-default) px-2 py-1 text-[10px] text-(--text-muted)">
          {t('inspector.panels.layoutPattern.splitThirdColumnHint', {
            defaultValue:
              'Third column is hidden in 2 columns mode (not deleted).',
          })}
        </div>
      ) : null}
      {Object.entries(pattern.schema).map(([key, definition]) => {
        const value = currentParams[key];
        if (definition.kind === 'enum') {
          const enumOptions =
            patternId === 'split' && key === 'ratio'
              ? definition.options.filter((option) =>
                  splitCategory === '3-columns'
                    ? option.value.split('-').length === 3
                    : option.value.split('-').length === 2
                )
              : definition.options;
          const localizedEnumOptions = enumOptions.map((option) => ({
            ...option,
            label: getOptionLabel(key, option.value, option.label),
          }));
          const enumValue = typeof value === 'string' ? value : '';

          if (patternId === 'split' && key === 'ratio') {
            return (
              <InspectorRow
                key={key}
                label={getFieldLabel(key, definition.label)}
                control={
                  <PresetInput
                    value={enumValue}
                    options={localizedEnumOptions}
                    placeholder={
                      splitCategory === '3-columns' ? '1-1-1' : '1-1'
                    }
                    onChange={(next) => updatePatternParam(key, next)}
                  />
                }
              />
            );
          }
          return (
            <InspectorRow
              key={key}
              label={getFieldLabel(key, definition.label)}
              control={
                <PdxSelect
                  size="Small"
                  value={
                    enumValue &&
                    localizedEnumOptions.some(
                      (option) => option.value === enumValue
                    )
                      ? enumValue
                      : definition.defaultValue
                  }
                  options={localizedEnumOptions.map((option) => ({
                    label: option.label,
                    value: option.value,
                  }))}
                  onChange={(next) => updatePatternParam(key, next)}
                />
              }
            />
          );
        }
        if (definition.kind === 'number') {
          return (
            <InspectorRow
              key={key}
              label={getFieldLabel(key, definition.label)}
              control={
                <PdxInput
                  size="Small"
                  value={String(value ?? definition.defaultValue)}
                  onChange={(next) => {
                    const parsed = Number(next);
                    if (!Number.isFinite(parsed)) return;
                    updatePatternParam(key, parsed);
                  }}
                />
              }
            />
          );
        }
        if (definition.kind === 'length') {
          return (
            <InspectorRow
              key={key}
              label={getFieldLabel(key, definition.label)}
              control={
                <UnitInput
                  value={value as string | number | undefined}
                  quantity="length-percentage"
                  onChange={(next) =>
                    updatePatternParam(key, next ?? definition.defaultValue)
                  }
                />
              }
            />
          );
        }
        return (
          <InspectorRow
            key={key}
            label={getFieldLabel(key, definition.label)}
            control={
              <input
                type="checkbox"
                className="h-4 w-4 accent-black"
                checked={
                  typeof value === 'boolean'
                    ? value
                    : Boolean(definition.defaultValue)
                }
                onChange={(event) =>
                  updatePatternParam(key, Boolean(event.target.checked))
                }
              />
            }
          />
        );
      })}
    </div>
  );
}

export const layoutPatternPanel: InspectorPanelDefinition = {
  key: 'layout-pattern',
  title: 'Pattern',
  description: 'Layout pattern parameters',
  match: (node) => isLayoutPatternRootNode(node),
  render: (props) => <LayoutPatternPanelView {...props} />,
};
