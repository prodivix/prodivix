import type { LayoutGroupDefinition, LayoutGroupRenderProps } from '../types';
import {
  isPlainObject,
  readString,
  readGridColumnCount,
  withStyle,
  updateStyleValue,
} from '../layoutPanelHelpers';
import { PdxInput } from '@prodivix/ui';
import {
  GridAlignContentAroundIcon,
  GridAlignContentBetweenIcon,
  GridAlignContentCenterIcon,
  GridAlignContentEndIcon,
  GridAlignContentEvenlyIcon,
  GridAlignContentFieldIcon,
  GridAlignContentStartIcon,
  GridAlignContentStretchIcon,
  GridAlignItemsBaselineIcon,
  GridAlignItemsCenterIcon,
  GridAlignItemsEndIcon,
  GridAlignItemsFieldIcon,
  GridAlignItemsStartIcon,
  GridAlignItemsStretchIcon,
  GridAutoFlowFieldIcon,
  GridFlowColumnDenseIcon,
  GridFlowColumnIcon,
  GridFlowRowDenseIcon,
  GridFlowRowIcon,
  GridJustifyContentAroundIcon,
  GridJustifyContentBetweenIcon,
  GridJustifyContentCenterIcon,
  GridJustifyContentEndIcon,
  GridJustifyContentEvenlyIcon,
  GridJustifyContentFieldIcon,
  GridJustifyContentStartIcon,
  GridJustifyContentStretchIcon,
  GridJustifyItemsCenterIcon,
  GridJustifyItemsEndIcon,
  GridJustifyItemsFieldIcon,
  GridJustifyItemsStartIcon,
  GridJustifyItemsStretchIcon,
} from '@/assets/icons';
import {
  InspectorIconFieldRow,
  InspectorRow,
} from '@/editor/features/blueprint/editor/inspector/components/InspectorRow';
import { IconButtonGroup } from '@/editor/features/blueprint/editor/inspector/components/IconButtonGroup';

const GridGroupContent = ({ node, updateNode, t }: LayoutGroupRenderProps) => {
  const gridTemplateColumns = node.style?.gridTemplateColumns;
  const gridTemplateRows = readString(node.style?.gridTemplateRows) ?? '';
  const gridAutoFlow = readString(node.style?.gridAutoFlow) ?? 'row';
  const gridJustifyItems = readString(node.style?.justifyItems) ?? 'stretch';
  const gridAlignItems = readString(node.style?.alignItems) ?? 'stretch';
  const gridJustifyContent = readString(node.style?.justifyContent) ?? 'start';
  const gridAlignContent = readString(node.style?.alignContent) ?? 'start';
  const gridColumnCount = readGridColumnCount(gridTemplateColumns);
  const gridColumnsDraft = gridColumnCount ? String(gridColumnCount) : '';
  const autoFlowLabel = t('inspector.panels.layout.fields.gridAutoFlow', {
    defaultValue: 'Auto Flow',
  });
  const justifyItemsLabel = t('inspector.panels.layout.fields.justifyItems', {
    defaultValue: 'Justify Items',
  });
  const alignItemsLabel = t('inspector.panels.layout.fields.alignItems', {
    defaultValue: 'Align Items',
  });
  const justifyContentLabel = t(
    'inspector.panels.layout.fields.justifyContent',
    {
      defaultValue: 'Justify Content',
    }
  );
  const alignContentLabel = t('inspector.panels.layout.fields.alignContent', {
    defaultValue: 'Align Content',
  });

  return (
    <>
      <div className="InspectorField flex flex-col gap-1.5">
        <InspectorRow
          label={t('inspector.panels.layout.fields.gridColumns', {
            defaultValue: 'Columns',
          })}
          description={t('inspector.panels.layout.fields.gridColumnsHint', {
            defaultValue: 'Sets gridTemplateColumns.',
          })}
          control={
            <PdxInput
              size="Small"
              value={gridColumnsDraft}
              dataAttributes={{
                'data-testid': 'inspector-grid-columns',
              }}
              onChange={(value) => {
                updateNode((current) => {
                  const next = Number(value);
                  if (!Number.isFinite(next) || next <= 0) {
                    const { gridTemplateColumns, ...rest } = isPlainObject(
                      current.style
                    )
                      ? current.style
                      : {};
                    return { ...current, style: rest };
                  }
                  return withStyle(current, {
                    gridTemplateColumns: `repeat(${Math.floor(next)}, minmax(0, 1fr))`,
                  });
                });
              }}
            />
          }
        />
      </div>
      <div className="InspectorField flex flex-col gap-1.5">
        <InspectorRow
          label={t('inspector.panels.layout.fields.gridRows', {
            defaultValue: 'Rows',
          })}
          control={
            <input
              className="h-7 w-full min-w-0 rounded-md border border-(--border-default) bg-transparent px-2 text-xs text-(--text-primary) outline-none placeholder:text-(--text-muted)"
              value={gridTemplateRows}
              placeholder={t('inspector.panels.layout.placeholders.gridRows', {
                defaultValue: 'repeat(2, minmax(0, 1fr))',
              })}
              onChange={(event) =>
                updateNode((current) =>
                  updateStyleValue(
                    current,
                    'gridTemplateRows',
                    event.target.value ?? ''
                  )
                )
              }
            />
          }
        />
      </div>
      <div className="InspectorField flex flex-col gap-1.5">
        <InspectorIconFieldRow
          label={autoFlowLabel}
          icon={<GridAutoFlowFieldIcon />}
          control={
            <IconButtonGroup
              value={gridAutoFlow}
              density="dense"
              columns={2}
              options={[
                {
                  label: t('inspector.panels.layout.options.gridAutoFlow.row', {
                    defaultValue: 'Row',
                  }),
                  value: 'row',
                  icon: <GridFlowRowIcon />,
                },
                {
                  label: t(
                    'inspector.panels.layout.options.gridAutoFlow.column',
                    { defaultValue: 'Column' }
                  ),
                  value: 'column',
                  icon: <GridFlowColumnIcon />,
                },
                {
                  label: t(
                    'inspector.panels.layout.options.gridAutoFlow.rowDense',
                    { defaultValue: 'Row Dense' }
                  ),
                  value: 'row dense',
                  icon: <GridFlowRowDenseIcon />,
                },
                {
                  label: t(
                    'inspector.panels.layout.options.gridAutoFlow.columnDense',
                    { defaultValue: 'Col Dense' }
                  ),
                  value: 'column dense',
                  icon: <GridFlowColumnDenseIcon />,
                },
              ]}
              layout="grid-2x2"
              onChange={(value) =>
                updateNode((current) =>
                  updateStyleValue(current, 'gridAutoFlow', value)
                )
              }
            />
          }
        />
      </div>
      <div className="InspectorField flex flex-col gap-1.5">
        <InspectorIconFieldRow
          label={justifyItemsLabel}
          icon={<GridJustifyItemsFieldIcon />}
          control={
            <IconButtonGroup
              value={gridJustifyItems}
              density="dense"
              columns={4}
              options={[
                {
                  label: t('inspector.panels.layout.options.align.start', {
                    defaultValue: 'Start',
                  }),
                  value: 'start',
                  icon: <GridJustifyItemsStartIcon />,
                },
                {
                  label: t('inspector.panels.layout.options.align.center', {
                    defaultValue: 'Center',
                  }),
                  value: 'center',
                  icon: <GridJustifyItemsCenterIcon />,
                },
                {
                  label: t('inspector.panels.layout.options.align.end', {
                    defaultValue: 'End',
                  }),
                  value: 'end',
                  icon: <GridJustifyItemsEndIcon />,
                },
                {
                  label: t('inspector.panels.layout.options.align.stretch', {
                    defaultValue: 'Stretch',
                  }),
                  value: 'stretch',
                  icon: <GridJustifyItemsStretchIcon />,
                },
              ]}
              layout="grid"
              onChange={(value) =>
                updateNode((current) =>
                  updateStyleValue(current, 'justifyItems', value)
                )
              }
            />
          }
        />
      </div>
      <div className="InspectorField flex flex-col gap-1.5">
        <InspectorIconFieldRow
          label={alignItemsLabel}
          icon={<GridAlignItemsFieldIcon />}
          control={
            <IconButtonGroup
              value={gridAlignItems}
              density="dense"
              columns={5}
              options={[
                {
                  label: t('inspector.panels.layout.options.align.start', {
                    defaultValue: 'Start',
                  }),
                  value: 'start',
                  icon: <GridAlignItemsStartIcon />,
                },
                {
                  label: t('inspector.panels.layout.options.align.center', {
                    defaultValue: 'Center',
                  }),
                  value: 'center',
                  icon: <GridAlignItemsCenterIcon />,
                },
                {
                  label: t('inspector.panels.layout.options.align.end', {
                    defaultValue: 'End',
                  }),
                  value: 'end',
                  icon: <GridAlignItemsEndIcon />,
                },
                {
                  label: t('inspector.panels.layout.options.align.stretch', {
                    defaultValue: 'Stretch',
                  }),
                  value: 'stretch',
                  icon: <GridAlignItemsStretchIcon />,
                },
                {
                  label: t('inspector.panels.layout.options.align.baseline', {
                    defaultValue: 'Baseline',
                  }),
                  value: 'baseline',
                  icon: <GridAlignItemsBaselineIcon />,
                },
              ]}
              layout="grid"
              onChange={(value) =>
                updateNode((current) =>
                  updateStyleValue(current, 'alignItems', value)
                )
              }
            />
          }
        />
      </div>
      <div className="InspectorField flex flex-col gap-1.5">
        <InspectorIconFieldRow
          label={justifyContentLabel}
          icon={<GridJustifyContentFieldIcon />}
          control={
            <IconButtonGroup
              value={gridJustifyContent}
              density="dense"
              columns={7}
              options={[
                {
                  label: t('inspector.panels.layout.options.justify.start', {
                    defaultValue: 'Start',
                  }),
                  value: 'start',
                  icon: <GridJustifyContentStartIcon />,
                },
                {
                  label: t('inspector.panels.layout.options.justify.center', {
                    defaultValue: 'Center',
                  }),
                  value: 'center',
                  icon: <GridJustifyContentCenterIcon />,
                },
                {
                  label: t('inspector.panels.layout.options.justify.end', {
                    defaultValue: 'End',
                  }),
                  value: 'end',
                  icon: <GridJustifyContentEndIcon />,
                },
                {
                  label: t(
                    'inspector.panels.layout.options.justify.spaceBetween',
                    { defaultValue: 'Between' }
                  ),
                  value: 'space-between',
                  icon: <GridJustifyContentBetweenIcon />,
                },
                {
                  label: t(
                    'inspector.panels.layout.options.justify.spaceAround',
                    { defaultValue: 'Around' }
                  ),
                  value: 'space-around',
                  icon: <GridJustifyContentAroundIcon />,
                },
                {
                  label: t(
                    'inspector.panels.layout.options.justify.spaceEvenly',
                    { defaultValue: 'Evenly' }
                  ),
                  value: 'space-evenly',
                  icon: <GridJustifyContentEvenlyIcon />,
                },
                {
                  label: t('inspector.panels.layout.options.align.stretch', {
                    defaultValue: 'Stretch',
                  }),
                  value: 'stretch',
                  icon: <GridJustifyContentStretchIcon />,
                },
              ]}
              layout="grid"
              onChange={(value) =>
                updateNode((current) =>
                  updateStyleValue(current, 'justifyContent', value)
                )
              }
            />
          }
        />
      </div>
      <div className="InspectorField flex flex-col gap-1.5">
        <InspectorIconFieldRow
          label={alignContentLabel}
          icon={<GridAlignContentFieldIcon />}
          control={
            <IconButtonGroup
              value={gridAlignContent}
              density="dense"
              columns={7}
              options={[
                {
                  label: t('inspector.panels.layout.options.justify.start', {
                    defaultValue: 'Start',
                  }),
                  value: 'start',
                  icon: <GridAlignContentStartIcon />,
                },
                {
                  label: t('inspector.panels.layout.options.justify.center', {
                    defaultValue: 'Center',
                  }),
                  value: 'center',
                  icon: <GridAlignContentCenterIcon />,
                },
                {
                  label: t('inspector.panels.layout.options.justify.end', {
                    defaultValue: 'End',
                  }),
                  value: 'end',
                  icon: <GridAlignContentEndIcon />,
                },
                {
                  label: t(
                    'inspector.panels.layout.options.justify.spaceBetween',
                    { defaultValue: 'Between' }
                  ),
                  value: 'space-between',
                  icon: <GridAlignContentBetweenIcon />,
                },
                {
                  label: t(
                    'inspector.panels.layout.options.justify.spaceAround',
                    { defaultValue: 'Around' }
                  ),
                  value: 'space-around',
                  icon: <GridAlignContentAroundIcon />,
                },
                {
                  label: t(
                    'inspector.panels.layout.options.justify.spaceEvenly',
                    { defaultValue: 'Evenly' }
                  ),
                  value: 'space-evenly',
                  icon: <GridAlignContentEvenlyIcon />,
                },
                {
                  label: t('inspector.panels.layout.options.align.stretch', {
                    defaultValue: 'Stretch',
                  }),
                  value: 'stretch',
                  icon: <GridAlignContentStretchIcon />,
                },
              ]}
              layout="grid"
              onChange={(value) =>
                updateNode((current) =>
                  updateStyleValue(current, 'alignContent', value)
                )
              }
            />
          }
        />
      </div>
    </>
  );
};

export const gridGroup: LayoutGroupDefinition = {
  key: 'grid',
  title: 'Grid',
  order: 50,
  match: (_node, display, isPatternStructureControlled) =>
    display === 'Grid' && !isPatternStructureControlled,
  render: GridGroupContent,
};
