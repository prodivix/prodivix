import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import {
  isPlainObject,
  isLayoutComponent,
  getDisplay,
  readNumber,
  readString,
  withProps,
} from './layoutGroup/layoutPanelHelpers';
import {
  getLayoutPatternId,
  isLayoutPatternRootNode,
} from '@/editor/features/blueprint/layoutPatterns/dataAttributes';
import type {
  InspectorPanelDefinition,
  InspectorPanelRenderProps,
} from './types';
import {
  InspectorIconFieldRow,
  InspectorRow,
} from '@/editor/features/blueprint/editor/inspector/components/InspectorRow';
import { IconButtonGroup } from '@/editor/features/blueprint/editor/inspector/components/IconButtonGroup';
import { UnitInput } from '@/editor/features/blueprint/editor/inspector/components/UnitInput';
import {
  DisplayBlockIcon,
  DisplayFieldIcon,
  DisplayFlexIcon,
  DisplayGridIcon,
  DisplayInlineBlockIcon,
  DisplayInlineIcon,
} from '@/assets/icons';
import { resolveLayoutGroups } from './layoutGroup/layoutGroupRegistry';
import {
  getLayoutGroupExpansionState,
  setLayoutGroupExpansionState,
  resetLayoutGroupExpansionPersistence,
} from './layoutGroup/layoutGroupExpansion';
import {
  LayoutGroupContext,
  type LayoutGroupContextValue,
} from './layoutGroup/LayoutGroupContext';
import type { LayoutGroupRenderProps } from './layoutGroup/types';

import './layoutGroup/registerBuiltinLayoutGroups';

function LayoutPanelView({ node, updateNode }: InspectorPanelRenderProps) {
  const { t } = useTranslation('blueprint');
  const isPatternRoot = isLayoutPatternRootNode(node);
  const patternId = getLayoutPatternId(node);
  const isPatternStructureControlled = isPatternRoot && Boolean(patternId);
  const display = getDisplay(node);
  const gapValue = node.props?.gap;

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    () => getLayoutGroupExpansionState()
  );

  const toggleGroup = (key: string) => {
    setExpandedGroups((current) => {
      const next = { ...current, [key]: !current[key] };
      setLayoutGroupExpansionState(next);
      return next;
    });
  };

  const groups = resolveLayoutGroups(
    node,
    display,
    isPatternStructureControlled
  );

  const contextValue: LayoutGroupContextValue = {
    node,
    updateNode,
    display,
    isPatternStructureControlled,
    t: t as LayoutGroupContextValue['t'],
  };

  return (
    <LayoutGroupContext.Provider value={contextValue}>
      <div className="InspectorSection grid w-[288px] max-w-full grid-cols-[repeat(9,32px)] gap-y-2 [&>*]:col-span-9">
        {isPatternStructureControlled ? (
          <div className="col-span-9 rounded-md border border-(--border-default) px-2 py-1 text-[10px] text-(--text-muted)">
            {t('inspector.panels.layout.patternControlled', {
              defaultValue: 'Layout structure is controlled by pattern params.',
            })}
          </div>
        ) : (
          <>
            <InspectorIconFieldRow
              label={t('inspector.panels.layout.fields.display', {
                defaultValue: 'Display',
              })}
              icon={<DisplayFieldIcon />}
              control={
                <IconButtonGroup
                  value={display ?? 'Block'}
                  density="dense"
                  layout="horizontal"
                  columns={5}
                  options={[
                    {
                      label: t(
                        'inspector.panels.layout.options.display.block',
                        { defaultValue: 'Block' }
                      ),
                      value: 'Block',
                      icon: <DisplayBlockIcon />,
                    },
                    {
                      label: t('inspector.panels.layout.options.display.flex', {
                        defaultValue: 'Flex',
                      }),
                      value: 'Flex',
                      icon: <DisplayFlexIcon />,
                    },
                    {
                      label: t('inspector.panels.layout.options.display.grid', {
                        defaultValue: 'Grid',
                      }),
                      value: 'Grid',
                      icon: <DisplayGridIcon />,
                    },
                    {
                      label: t(
                        'inspector.panels.layout.options.display.inline',
                        { defaultValue: 'Inline' }
                      ),
                      value: 'Inline',
                      icon: <DisplayInlineIcon />,
                    },
                    {
                      label: t(
                        'inspector.panels.layout.options.display.inlineBlock',
                        { defaultValue: 'InlineBlock' }
                      ),
                      value: 'InlineBlock',
                      icon: <DisplayInlineBlockIcon />,
                    },
                  ]}
                  onChange={(value) =>
                    updateNode((current) =>
                      withProps(current, { display: value })
                    )
                  }
                />
              }
            />
            {display === 'Flex' || display === 'Grid' ? (
              <InspectorRow
                label={t('inspector.panels.layout.fields.gap', {
                  defaultValue: 'Gap',
                })}
                control={
                  <UnitInput
                    value={readNumber(gapValue) ?? readString(gapValue)}
                    quantity="length-percentage"
                    onChange={(next) => {
                      updateNode((current) => {
                        if (next === undefined) {
                          const { gap, ...rest } = isPlainObject(current.props)
                            ? current.props
                            : {};
                          return { ...current, props: rest };
                        }
                        return withProps(current, { gap: next });
                      });
                    }}
                    placeholder="8"
                  />
                }
              />
            ) : null}
          </>
        )}

        {groups.map((group) => {
          const isExpanded = expandedGroups[group.key] ?? false;
          const groupTitle = t(`inspector.panels.layout.groups.${group.key}`, {
            defaultValue: group.title,
          });
          return (
            <div
              key={group.key}
              className="InspectorField col-span-9 flex flex-col gap-1"
            >
              <button
                type="button"
                className="flex min-h-5.5 w-full cursor-pointer items-center justify-between border-0 bg-transparent p-0 text-left"
                onClick={() => toggleGroup(group.key)}
                data-testid={`inspector-layout-group-toggle-${group.key}`}
              >
                <span className="InspectorLabel text-[11px] font-medium text-(--text-secondary)">
                  {groupTitle}
                </span>
                <ChevronDown
                  size={14}
                  className={`${isExpanded ? 'rotate-0' : '-rotate-90'} text-(--text-muted) transition-transform`}
                />
              </button>
              {isExpanded ? (
                <div className="mt-1 grid w-[288px] max-w-full grid-cols-[repeat(9,32px)] gap-y-2 [&>*]:col-span-9">
                  {group.render(contextValue as LayoutGroupRenderProps)}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </LayoutGroupContext.Provider>
  );
}

export const resetLayoutPanelExpansionPersistence = () => {
  resetLayoutGroupExpansionPersistence();
};

export const layoutPanel: InspectorPanelDefinition = {
  key: 'layout',
  title: 'Layout',
  description: 'Flex / Grid layout details',
  match: (node) => isLayoutComponent(node) && !isLayoutPatternRootNode(node),
  render: (props) => <LayoutPanelView {...props} />,
};
