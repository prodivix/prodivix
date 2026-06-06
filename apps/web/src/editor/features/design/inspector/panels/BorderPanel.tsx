import { PdxInput } from '@prodivix/ui';
import { InspectorRow } from '@/editor/features/design/inspector/components/InspectorRow';
import { ColorInput } from '@/editor/features/design/inspector/components/ColorInput';
import { UnitInput } from '@/editor/features/design/inspector/components/UnitInput';
import { useInspectorContext } from '@/editor/features/design/inspector/InspectorContext';
import type {
  InspectorPanelDefinition,
  InspectorPanelRenderProps,
} from './types';
import {
  readCssValue,
  updateStyleValue,
} from './layoutGroup/layoutPanelHelpers';
import { supportsVisualStylePanels } from './panelCapabilities';

function BorderPanelView({ node, updateNode }: InspectorPanelRenderProps) {
  const { t } = useInspectorContext();
  const borderValue =
    typeof node.style?.border === 'string' ? node.style.border : '';
  const borderColorValue = readCssValue(node.style?.borderColor);
  const borderWidthValue = readCssValue(node.style?.borderWidth);
  const borderRadiusValue = readCssValue(node.style?.borderRadius);

  return (
    <div className="flex flex-col gap-2 pt-1 pb-1">
      <InspectorRow
        label={t('inspector.panels.border.fields.border', {
          defaultValue: 'Border',
        })}
        control={
          <PdxInput
            size="Small"
            value={borderValue}
            onChange={(value) =>
              updateNode((current) =>
                updateStyleValue(current, 'border', value)
              )
            }
            placeholder={t('inspector.panels.border.placeholders.border', {
              defaultValue: '1px solid var(--border-default)',
            })}
          />
        }
      />
      <InspectorRow
        label={t('inspector.panels.border.fields.borderColor', {
          defaultValue: 'Border Color',
        })}
        control={
          <ColorInput
            value={borderColorValue}
            onChange={(value) =>
              updateNode((current) =>
                updateStyleValue(current, 'borderColor', value ?? '')
              )
            }
          />
        }
      />
      <InspectorRow
        label={t('inspector.panels.border.fields.borderWidth', {
          defaultValue: 'Border Width',
        })}
        control={
          <UnitInput
            value={borderWidthValue}
            quantity="length"
            placeholder={t('inspector.panels.border.placeholders.borderWidth', {
              defaultValue: '1',
            })}
            onChange={(value) =>
              updateNode((current) =>
                updateStyleValue(
                  current,
                  'borderWidth',
                  readCssValue(value) ?? ''
                )
              )
            }
          />
        }
      />
      <InspectorRow
        label={t('inspector.panels.border.fields.borderRadius', {
          defaultValue: 'Radius',
        })}
        control={
          <UnitInput
            value={borderRadiusValue}
            quantity="length-percentage"
            placeholder={t(
              'inspector.panels.border.placeholders.borderRadius',
              {
                defaultValue: '0',
              }
            )}
            onChange={(value) =>
              updateNode((current) =>
                updateStyleValue(
                  current,
                  'borderRadius',
                  readCssValue(value) ?? ''
                )
              )
            }
          />
        }
      />
    </div>
  );
}

export const borderPanel: InspectorPanelDefinition = {
  key: 'border',
  title: 'Border',
  match: supportsVisualStylePanels,
  render: (props) => <BorderPanelView {...props} />,
};
