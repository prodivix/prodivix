import { useMemo } from 'react';
import type { TFunction } from 'i18next';
import { ChevronDown } from 'lucide-react';
import { SpacingSidePreviewIcon } from '@/assets/icons';
import { InspectorRow } from '@/editor/features/blueprint/editor/inspector/components/InspectorRow';
import { UnitInput } from '@/editor/features/blueprint/editor/inspector/components/UnitInput';
import {
  parseBoxSpacing,
  toBoxSpacingShorthand,
  readCssValue,
  type SpacingKey,
  type BoxSpacing,
} from '../layoutPanelHelpers';

type SpacingControlProps = {
  keyName: SpacingKey;
  value: string;
  expanded?: boolean;
  onToggleExpand?: () => void;
  onChange: (nextValue: string) => void;
  t: TFunction;
};

type ExpandedSpacingState = {
  margin: boolean;
  padding: boolean;
};

const DEFAULT_EXPANDED_SPACING_STATE: ExpandedSpacingState = {
  margin: false,
  padding: false,
};

const persistedExpandedSpacingState: ExpandedSpacingState = {
  ...DEFAULT_EXPANDED_SPACING_STATE,
};

function SpacingControlInternal({
  keyName,
  value,
  expanded,
  onToggleExpand,
  onChange,
  t,
}: SpacingControlProps) {
  const sides = useMemo(() => parseBoxSpacing(value), [value]);
  return (
    <div className="InspectorField flex flex-col gap-1.5">
      <InspectorRow
        label={t(`inspector.panels.layout.fields.${keyName}`, {
          defaultValue: keyName === 'margin' ? 'Margin' : 'Padding',
        })}
        control={
          <div className="flex items-center gap-1.5">
            <input
              className="h-7 w-full min-w-0 rounded-md border border-(--border-default) bg-transparent px-2 text-xs text-(--text-primary) outline-none"
              value={value}
              placeholder="0"
              data-testid={`inspector-${keyName}-shorthand`}
              onChange={(event) => onChange(event.target.value)}
            />
            <button
              type="button"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-(--border-default) text-(--text-muted)"
              onClick={onToggleExpand}
              data-testid={`inspector-${keyName}-toggle`}
              aria-label={t(
                expanded
                  ? 'inspector.panels.layout.fields.collapse'
                  : 'inspector.panels.layout.fields.expand',
                {
                  defaultValue: expanded ? 'Collapse' : 'Expand',
                }
              )}
              title={t(
                expanded
                  ? 'inspector.panels.layout.fields.collapse'
                  : 'inspector.panels.layout.fields.expand',
                {
                  defaultValue: expanded ? 'Collapse' : 'Expand',
                }
              )}
            >
              <ChevronDown
                size={14}
                className={expanded ? 'rotate-180' : 'rotate-0'}
              />
            </button>
          </div>
        }
      />
      {expanded ? (
        <div className="grid grid-cols-2 gap-1.5">
          {(
            [
              ['top', sides.top],
              ['right', sides.right],
              ['bottom', sides.bottom],
              ['left', sides.left],
            ] as const
          ).map(([side, sideValue]) => (
            <label
              key={side}
              className="flex items-start gap-2.5 py-1 text-(--text-muted)"
            >
              <SpacingSidePreviewIcon
                side={side}
                spacingKey={keyName}
                className="h-14 w-16 shrink-0 text-(--text-muted)"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[10px] leading-none font-medium">
                  {t(`inspector.panels.layout.fields.sides.${side}`, {
                    defaultValue: side.charAt(0).toUpperCase() + side.slice(1),
                  })}
                </span>
                <div data-testid={`inspector-${keyName}-${side}`}>
                  <UnitInput
                    value={sideValue ? sideValue : undefined}
                    quantity="length-percentage"
                    placeholder="0"
                    onChange={(nextSideValue) => {
                      const nextValue = readCssValue(nextSideValue) ?? '';
                      onChange(
                        toBoxSpacingShorthand({
                          ...sides,
                          [side]: nextValue,
                        })
                      );
                    }}
                  />
                </div>
              </div>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export { SpacingControlInternal as SpacingControl };
export { persistedExpandedSpacingState };
export { DEFAULT_EXPANDED_SPACING_STATE };
export type { SpacingControlProps, ExpandedSpacingState };
