import type { LayoutGroupDefinition, LayoutGroupRenderProps } from '../types';
import { readString, withProps } from '../layoutPanelHelpers';
import {
  AlignBaselineColumnIcon,
  AlignBaselineIcon,
  AlignCenterColumnIcon,
  AlignCenterIcon,
  AlignEndColumnIcon,
  AlignEndIcon,
  AlignStartColumnIcon,
  AlignStartIcon,
  AlignStretchColumnIcon,
  AlignStretchIcon,
  FlexColumnIcon,
  FlexColumnReverseIcon,
  FlexAlignFieldIcon,
  FlexDirectionFieldIcon,
  FlexJustifyFieldIcon,
  FlexRowIcon,
  FlexRowReverseIcon,
  JustifyCenterIcon,
  JustifyCenterColumnIcon,
  JustifyEndIcon,
  JustifyEndColumnIcon,
  JustifySpaceAroundColumnIcon,
  JustifySpaceAroundIcon,
  JustifySpaceBetweenColumnIcon,
  JustifySpaceBetweenIcon,
  JustifySpaceEvenlyColumnIcon,
  JustifySpaceEvenlyIcon,
  JustifyStartColumnIcon,
  JustifyStartIcon,
} from '@/assets/icons';
import { InspectorIconFieldRow } from '@/editor/features/blueprint/editor/inspector/components/InspectorRow';
import { IconButtonGroup } from '@/editor/features/blueprint/editor/inspector/components/IconButtonGroup';

const FlexGroupContent = ({ node, updateNode, t }: LayoutGroupRenderProps) => {
  const flexDirection = readString(node.props?.flexDirection) ?? 'Row';
  const justifyContent = readString(node.props?.justifyContent) ?? 'Start';
  const alignItems = readString(node.props?.alignItems) ?? 'Start';
  const isRowLike = flexDirection === 'Row' || flexDirection === 'RowReverse';
  const directionLabel = t('inspector.panels.layout.fields.flexDirection', {
    defaultValue: 'Direction',
  });
  const justifyLabel = t('inspector.panels.layout.fields.justifyContent', {
    defaultValue: 'Justify',
  });
  const alignLabel = t('inspector.panels.layout.fields.alignItems', {
    defaultValue: 'Align',
  });

  return (
    <>
      <div className="InspectorField flex flex-col gap-1.5">
        <InspectorIconFieldRow
          label={directionLabel}
          icon={<FlexDirectionFieldIcon />}
          control={
            <IconButtonGroup
              value={flexDirection}
              layout="horizontal"
              density="dense"
              columns={4}
              options={[
                {
                  value: 'Row',
                  icon: <FlexRowIcon />,
                  label: t('inspector.panels.layout.options.direction.row', {
                    defaultValue: 'Row',
                  }),
                },
                {
                  value: 'RowReverse',
                  icon: <FlexRowReverseIcon />,
                  label: t(
                    'inspector.panels.layout.options.direction.rowReverse',
                    { defaultValue: 'Row Reverse' }
                  ),
                },
                {
                  value: 'Column',
                  icon: <FlexColumnIcon />,
                  label: t('inspector.panels.layout.options.direction.column', {
                    defaultValue: 'Column',
                  }),
                },
                {
                  value: 'ColumnReverse',
                  icon: <FlexColumnReverseIcon />,
                  label: t(
                    'inspector.panels.layout.options.direction.columnReverse',
                    { defaultValue: 'Column Reverse' }
                  ),
                },
              ]}
              onChange={(value) =>
                updateNode((current) =>
                  withProps(current, { flexDirection: value })
                )
              }
            />
          }
        />
      </div>

      <div className="InspectorField flex flex-col gap-1.5">
        <InspectorIconFieldRow
          label={justifyLabel}
          icon={<FlexJustifyFieldIcon />}
          control={
            <IconButtonGroup
              value={justifyContent}
              layout="horizontal"
              density="dense"
              columns={6}
              options={
                isRowLike
                  ? [
                      {
                        value: 'Start',
                        icon: <JustifyStartIcon />,
                        label: t(
                          'inspector.panels.layout.options.justify.start',
                          { defaultValue: 'Start' }
                        ),
                      },
                      {
                        value: 'Center',
                        icon: <JustifyCenterIcon />,
                        label: t(
                          'inspector.panels.layout.options.justify.center',
                          { defaultValue: 'Center' }
                        ),
                      },
                      {
                        value: 'End',
                        icon: <JustifyEndIcon />,
                        label: t(
                          'inspector.panels.layout.options.justify.end',
                          { defaultValue: 'End' }
                        ),
                      },
                      {
                        value: 'SpaceBetween',
                        icon: <JustifySpaceBetweenIcon />,
                        label: t(
                          'inspector.panels.layout.options.justify.spaceBetween',
                          { defaultValue: 'Space Between' }
                        ),
                      },
                      {
                        value: 'SpaceAround',
                        icon: <JustifySpaceAroundIcon />,
                        label: t(
                          'inspector.panels.layout.options.justify.spaceAround',
                          { defaultValue: 'Space Around' }
                        ),
                      },
                      {
                        value: 'SpaceEvenly',
                        icon: <JustifySpaceEvenlyIcon />,
                        label: t(
                          'inspector.panels.layout.options.justify.spaceEvenly',
                          { defaultValue: 'Space Evenly' }
                        ),
                      },
                    ]
                  : [
                      {
                        value: 'Start',
                        icon: <JustifyStartColumnIcon />,
                        label: t(
                          'inspector.panels.layout.options.justify.start',
                          { defaultValue: 'Start' }
                        ),
                      },
                      {
                        value: 'Center',
                        icon: <JustifyCenterColumnIcon />,
                        label: t(
                          'inspector.panels.layout.options.justify.center',
                          { defaultValue: 'Center' }
                        ),
                      },
                      {
                        value: 'End',
                        icon: <JustifyEndColumnIcon />,
                        label: t(
                          'inspector.panels.layout.options.justify.end',
                          { defaultValue: 'End' }
                        ),
                      },
                      {
                        value: 'SpaceBetween',
                        icon: <JustifySpaceBetweenColumnIcon />,
                        label: t(
                          'inspector.panels.layout.options.justify.spaceBetween',
                          { defaultValue: 'Space Between' }
                        ),
                      },
                      {
                        value: 'SpaceAround',
                        icon: <JustifySpaceAroundColumnIcon />,
                        label: t(
                          'inspector.panels.layout.options.justify.spaceAround',
                          { defaultValue: 'Space Around' }
                        ),
                      },
                      {
                        value: 'SpaceEvenly',
                        icon: <JustifySpaceEvenlyColumnIcon />,
                        label: t(
                          'inspector.panels.layout.options.justify.spaceEvenly',
                          { defaultValue: 'Space Evenly' }
                        ),
                      },
                    ]
              }
              onChange={(value) =>
                updateNode((current) =>
                  withProps(current, { justifyContent: value })
                )
              }
            />
          }
        />
      </div>

      <div className="InspectorField flex flex-col gap-1.5">
        <InspectorIconFieldRow
          label={alignLabel}
          icon={<FlexAlignFieldIcon />}
          control={
            <IconButtonGroup
              value={alignItems}
              layout="horizontal"
              density="dense"
              columns={5}
              options={
                isRowLike
                  ? [
                      {
                        value: 'Start',
                        icon: <AlignStartIcon />,
                        label: t(
                          'inspector.panels.layout.options.align.start',
                          { defaultValue: 'Start' }
                        ),
                      },
                      {
                        value: 'Center',
                        icon: <AlignCenterIcon />,
                        label: t(
                          'inspector.panels.layout.options.align.center',
                          { defaultValue: 'Center' }
                        ),
                      },
                      {
                        value: 'End',
                        icon: <AlignEndIcon />,
                        label: t('inspector.panels.layout.options.align.end', {
                          defaultValue: 'End',
                        }),
                      },
                      {
                        value: 'Stretch',
                        icon: <AlignStretchIcon />,
                        label: t(
                          'inspector.panels.layout.options.align.stretch',
                          { defaultValue: 'Stretch' }
                        ),
                      },
                      {
                        value: 'Baseline',
                        icon: <AlignBaselineIcon />,
                        label: t(
                          'inspector.panels.layout.options.align.baseline',
                          { defaultValue: 'Baseline' }
                        ),
                      },
                    ]
                  : [
                      {
                        value: 'Start',
                        icon: <AlignStartColumnIcon />,
                        label: t(
                          'inspector.panels.layout.options.align.start',
                          { defaultValue: 'Start' }
                        ),
                      },
                      {
                        value: 'Center',
                        icon: <AlignCenterColumnIcon />,
                        label: t(
                          'inspector.panels.layout.options.align.center',
                          { defaultValue: 'Center' }
                        ),
                      },
                      {
                        value: 'End',
                        icon: <AlignEndColumnIcon />,
                        label: t('inspector.panels.layout.options.align.end', {
                          defaultValue: 'End',
                        }),
                      },
                      {
                        value: 'Stretch',
                        icon: <AlignStretchColumnIcon />,
                        label: t(
                          'inspector.panels.layout.options.align.stretch',
                          { defaultValue: 'Stretch' }
                        ),
                      },
                      {
                        value: 'Baseline',
                        icon: <AlignBaselineColumnIcon />,
                        label: t(
                          'inspector.panels.layout.options.align.baseline',
                          { defaultValue: 'Baseline' }
                        ),
                      },
                    ]
              }
              onChange={(value) =>
                updateNode((current) =>
                  withProps(current, { alignItems: value })
                )
              }
            />
          }
        />
      </div>
    </>
  );
};

export const flexGroup: LayoutGroupDefinition = {
  key: 'flex',
  title: 'Flex',
  order: 40,
  match: (_node, display, isPatternStructureControlled) =>
    display === 'Flex' && !isPatternStructureControlled,
  render: FlexGroupContent,
};
