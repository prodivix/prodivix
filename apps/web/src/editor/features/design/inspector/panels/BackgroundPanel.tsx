import { PdxInput } from '@prodivix/ui';
import { InspectorRow } from '@/editor/features/design/inspector/components/InspectorRow';
import { ColorInput } from '@/editor/features/design/inspector/components/ColorInput';
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

function BackgroundPanelView({ node, updateNode }: InspectorPanelRenderProps) {
  const { t } = useInspectorContext();
  const backgroundColorValue = readCssValue(node.style?.backgroundColor);
  const backgroundImageValue =
    typeof node.style?.backgroundImage === 'string'
      ? node.style.backgroundImage
      : '';
  const backgroundSizeValue =
    typeof node.style?.backgroundSize === 'string'
      ? node.style.backgroundSize
      : '';
  const backgroundPositionValue =
    typeof node.style?.backgroundPosition === 'string'
      ? node.style.backgroundPosition
      : '';

  return (
    <div className="flex flex-col gap-2 pt-1 pb-1">
      <InspectorRow
        label={t('inspector.panels.background.fields.backgroundColor', {
          defaultValue: 'Background',
        })}
        control={
          <ColorInput
            value={backgroundColorValue}
            onChange={(value) =>
              updateNode((current) =>
                updateStyleValue(current, 'backgroundColor', value ?? '')
              )
            }
          />
        }
      />
      <InspectorRow
        label={t('inspector.panels.background.fields.backgroundImage', {
          defaultValue: 'Background Image',
        })}
        control={
          <PdxInput
            size="Small"
            value={backgroundImageValue}
            onChange={(value) =>
              updateNode((current) =>
                updateStyleValue(current, 'backgroundImage', value)
              )
            }
            placeholder={t(
              'inspector.panels.background.placeholders.backgroundImage',
              {
                defaultValue: 'url(/image.png)',
              }
            )}
          />
        }
      />
      <InspectorRow
        label={t('inspector.panels.background.fields.backgroundSize', {
          defaultValue: 'Background Size',
        })}
        control={
          <PdxInput
            size="Small"
            value={backgroundSizeValue}
            onChange={(value) =>
              updateNode((current) =>
                updateStyleValue(current, 'backgroundSize', value)
              )
            }
            placeholder={t(
              'inspector.panels.background.placeholders.backgroundSize',
              {
                defaultValue: 'cover',
              }
            )}
          />
        }
      />
      <InspectorRow
        label={t('inspector.panels.background.fields.backgroundPosition', {
          defaultValue: 'Background Position',
        })}
        control={
          <PdxInput
            size="Small"
            value={backgroundPositionValue}
            onChange={(value) =>
              updateNode((current) =>
                updateStyleValue(current, 'backgroundPosition', value)
              )
            }
            placeholder={t(
              'inspector.panels.background.placeholders.backgroundPosition',
              {
                defaultValue: 'center center',
              }
            )}
          />
        }
      />
    </div>
  );
}

export const backgroundPanel: InspectorPanelDefinition = {
  key: 'background',
  title: 'Background',
  match: supportsVisualStylePanels,
  render: (props) => <BackgroundPanelView {...props} />,
};
