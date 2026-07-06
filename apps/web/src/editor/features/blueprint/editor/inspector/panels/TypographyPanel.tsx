import { PdxInput } from '@prodivix/ui';
import {
  InspectorIconFieldRow,
  InspectorRow,
} from '@/editor/features/blueprint/editor/inspector/components/InspectorRow';
import { IconButtonGroup } from '@/editor/features/blueprint/editor/inspector/components/IconButtonGroup';
import { ColorInput } from '@/editor/features/blueprint/editor/inspector/components/ColorInput';
import { UnitInput } from '@/editor/features/blueprint/editor/inspector/components/UnitInput';
import { getPrimaryTextField } from '@/editor/features/blueprint/editor/model/blueprintText';
import { useInspectorContext } from '@/editor/features/blueprint/editor/inspector/InspectorContext';
import type {
  InspectorPanelDefinition,
  InspectorPanelRenderProps,
} from './types';
import {
  readCssValue,
  updateStyleValue,
} from './layoutGroup/layoutPanelHelpers';
import {
  TextAlignCenterIcon,
  TextAlignFieldIcon,
  TextAlignJustifyIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
} from '@/assets/icons';

const hasTypographyCapability = (node: InspectorPanelRenderProps['node']) =>
  getPrimaryTextField(node) !== null;

function TypographyPanelView({ node, updateNode }: InspectorPanelRenderProps) {
  const { t } = useInspectorContext();
  const colorValue =
    typeof node.style?.color === 'string' ? node.style.color : undefined;
  const fontFamilyValue =
    typeof node.style?.fontFamily === 'string' ? node.style.fontFamily : '';
  const fontWeightValue =
    typeof node.style?.fontWeight === 'string' ? node.style.fontWeight : '';
  const fontSizeValue = readCssValue(node.style?.fontSize);
  const lineHeightValue = readCssValue(node.style?.lineHeight);
  const letterSpacingValue = readCssValue(node.style?.letterSpacing);
  const textAlignValue =
    typeof node.style?.textAlign === 'string' ? node.style.textAlign : 'left';

  return (
    <div className="flex flex-col gap-2 pt-1 pb-1">
      <InspectorRow
        label={t('inspector.panels.typography.fields.color', {
          defaultValue: 'Color',
        })}
        control={
          <ColorInput
            value={colorValue}
            onChange={(value) =>
              updateNode((current) =>
                updateStyleValue(current, 'color', value ?? '')
              )
            }
          />
        }
      />
      <InspectorRow
        label={t('inspector.panels.typography.fields.fontFamily', {
          defaultValue: 'Font Family',
        })}
        control={
          <PdxInput
            size="Small"
            value={fontFamilyValue}
            onChange={(value) =>
              updateNode((current) =>
                updateStyleValue(current, 'fontFamily', value)
              )
            }
            placeholder={t(
              'inspector.panels.typography.placeholders.fontFamily',
              {
                defaultValue: "'IBM Plex Sans', sans-serif",
              }
            )}
          />
        }
      />
      <InspectorRow
        label={t('inspector.panels.typography.fields.fontSize', {
          defaultValue: 'Font Size',
        })}
        control={
          <UnitInput
            value={fontSizeValue}
            quantity="length-percentage"
            placeholder={t(
              'inspector.panels.typography.placeholders.fontSize',
              {
                defaultValue: '16',
              }
            )}
            onChange={(value) =>
              updateNode((current) =>
                updateStyleValue(current, 'fontSize', readCssValue(value) ?? '')
              )
            }
          />
        }
      />
      <InspectorRow
        label={t('inspector.panels.typography.fields.fontWeight', {
          defaultValue: 'Font Weight',
        })}
        control={
          <PdxInput
            size="Small"
            value={fontWeightValue}
            onChange={(value) =>
              updateNode((current) =>
                updateStyleValue(current, 'fontWeight', value)
              )
            }
            placeholder={t(
              'inspector.panels.typography.placeholders.fontWeight',
              {
                defaultValue: '400',
              }
            )}
          />
        }
      />
      <InspectorRow
        label={t('inspector.panels.typography.fields.lineHeight', {
          defaultValue: 'Line Height',
        })}
        control={
          <UnitInput
            value={lineHeightValue}
            quantity="length-percentage"
            placeholder={t(
              'inspector.panels.typography.placeholders.lineHeight',
              {
                defaultValue: '1.5',
              }
            )}
            onChange={(value) =>
              updateNode((current) =>
                updateStyleValue(
                  current,
                  'lineHeight',
                  typeof value === 'number' ? String(value) : (value ?? '')
                )
              )
            }
          />
        }
      />
      <InspectorRow
        label={t('inspector.panels.typography.fields.letterSpacing', {
          defaultValue: 'Letter Spacing',
        })}
        control={
          <UnitInput
            value={letterSpacingValue}
            quantity="length"
            placeholder={t(
              'inspector.panels.typography.placeholders.letterSpacing',
              {
                defaultValue: '0',
              }
            )}
            onChange={(value) =>
              updateNode((current) =>
                updateStyleValue(
                  current,
                  'letterSpacing',
                  readCssValue(value) ?? ''
                )
              )
            }
          />
        }
      />
      <InspectorIconFieldRow
        label={t('inspector.panels.typography.fields.textAlign', {
          defaultValue: 'Text Align',
        })}
        icon={<TextAlignFieldIcon />}
        control={
          <IconButtonGroup
            value={textAlignValue}
            density="dense"
            layout="horizontal"
            columns={4}
            options={[
              {
                label: t('inspector.panels.typography.options.textAlign.left', {
                  defaultValue: 'Left',
                }),
                value: 'left',
                icon: <TextAlignLeftIcon />,
              },
              {
                label: t(
                  'inspector.panels.typography.options.textAlign.center',
                  {
                    defaultValue: 'Center',
                  }
                ),
                value: 'center',
                icon: <TextAlignCenterIcon />,
              },
              {
                label: t(
                  'inspector.panels.typography.options.textAlign.right',
                  {
                    defaultValue: 'Right',
                  }
                ),
                value: 'right',
                icon: <TextAlignRightIcon />,
              },
              {
                label: t(
                  'inspector.panels.typography.options.textAlign.justify',
                  {
                    defaultValue: 'Justify',
                  }
                ),
                value: 'justify',
                icon: <TextAlignJustifyIcon />,
              },
            ]}
            onChange={(value) =>
              updateNode((current) =>
                updateStyleValue(current, 'textAlign', value)
              )
            }
          />
        }
      />
    </div>
  );
}

export const typographyPanel: InspectorPanelDefinition = {
  key: 'typography',
  title: 'Typography',
  match: (node) => hasTypographyCapability(node),
  render: (props) => <TypographyPanelView {...props} />,
};
