import type { LayoutGroupDefinition, LayoutGroupRenderProps } from '../types';
import {
  getLayoutValue,
  updateLayoutValue,
  readCssValue,
} from '../layoutPanelHelpers';
import { InspectorRow } from '@/editor/features/blueprint/editor/inspector/components/InspectorRow';
import { UnitInput } from '@/editor/features/blueprint/editor/inspector/components/UnitInput';

const SizeGroupContent = ({ node, updateNode, t }: LayoutGroupRenderProps) => {
  const widthValue = getLayoutValue(node, 'width');
  const heightValue = getLayoutValue(node, 'height');

  return (
    <div className="grid grid-cols-2 gap-1.5">
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-medium text-(--text-muted)">
          {t('inspector.panels.layout.fields.width', {
            defaultValue: 'Width',
          })}
        </span>
        <UnitInput
          value={widthValue || undefined}
          quantity="length-percentage"
          placeholder={t('inspector.panels.layout.placeholders.auto', {
            defaultValue: 'auto',
          })}
          onChange={(value) =>
            updateNode((current) =>
              updateLayoutValue(current, 'width', readCssValue(value) ?? '')
            )
          }
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-medium text-(--text-muted)">
          {t('inspector.panels.layout.fields.height', {
            defaultValue: 'Height',
          })}
        </span>
        <UnitInput
          value={heightValue || undefined}
          quantity="length-percentage"
          placeholder={t('inspector.panels.layout.placeholders.auto', {
            defaultValue: 'auto',
          })}
          onChange={(value) =>
            updateNode((current) =>
              updateLayoutValue(current, 'height', readCssValue(value) ?? '')
            )
          }
        />
      </div>
    </div>
  );
};

export const sizeGroup: LayoutGroupDefinition = {
  key: 'size',
  title: 'Size',
  order: 20,
  render: SizeGroupContent,
};
