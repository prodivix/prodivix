import {
  PdxBadge,
  PdxCheckList,
  PdxDataGrid,
  PdxIcon,
  PdxList,
  PdxProgress,
  PdxSpinner,
  PdxStatistic,
  PdxSteps,
  PdxTable,
  PdxTag,
  PdxTimeline,
  PdxTree,
  PdxTreeSelect,
} from '@prodivix/ui';
import { Sparkles } from 'lucide-react';
import type { ComponentGroup } from '@/editor/features/blueprint/editor/model/types';
import { buildVariants } from '@/editor/features/blueprint/data/helpers';
import {
  PROGRESS_STATUSES,
  SIZE_OPTIONS,
  STEPS_DIRECTIONS,
  TAG_VARIANTS,
} from '@/editor/features/blueprint/data/options';
import {
  CHECKLIST_ITEMS,
  GRID_COLUMNS,
  GRID_DATA,
  LIST_ITEMS,
  STEPS_ITEMS,
  TABLE_COLUMNS,
  TABLE_DATA,
  TIMELINE_ITEMS,
  TREE_DATA,
  TREE_SELECT_OPTIONS,
} from '@/editor/features/blueprint/data/sampleData';

export const DATA_GROUP: ComponentGroup = {
  id: 'data',
  title: '数据展示',
  items: [
    {
      id: 'table',
      name: 'Table',
      preview: (
        <PdxTable data={TABLE_DATA} columns={TABLE_COLUMNS} size="Medium" />
      ),
      sizeOptions: SIZE_OPTIONS,
      renderPreview: ({ size }) => (
        <PdxTable
          data={TABLE_DATA}
          columns={TABLE_COLUMNS}
          size={(size ?? 'Medium') as 'Small' | 'Medium' | 'Large'}
        />
      ),
      scale: 0.48,
    },
    {
      id: 'data-grid',
      name: 'DataGrid',
      preview: <PdxDataGrid data={GRID_DATA} columns={GRID_COLUMNS} />,
      scale: 0.5,
    },
    {
      id: 'list',
      name: 'List',
      preview: <PdxList items={LIST_ITEMS} size="Medium" />,
      sizeOptions: SIZE_OPTIONS,
      renderPreview: ({ size }) => (
        <PdxList
          items={LIST_ITEMS}
          size={(size ?? 'Medium') as 'Small' | 'Medium' | 'Large'}
        />
      ),
      scale: 0.55,
    },
    {
      id: 'check-list',
      name: 'CheckList',
      preview: (
        <PdxCheckList items={CHECKLIST_ITEMS} defaultValue={['wireframes']} />
      ),
      scale: 0.6,
    },
    {
      id: 'tree',
      name: 'Tree',
      preview: <PdxTree data={TREE_DATA} defaultExpandedKeys={['root']} />,
      scale: 0.55,
    },
    {
      id: 'tree-select',
      name: 'TreeSelect',
      preview: (
        <PdxTreeSelect options={TREE_SELECT_OPTIONS} defaultValue="option-1" />
      ),
      scale: 0.6,
    },
    {
      id: 'tag',
      name: 'Tag',
      preview: <PdxTag text="Tag" size="Medium" variant="Soft" />,
      sizeOptions: SIZE_OPTIONS,
      renderPreview: ({ size }) => (
        <PdxTag
          text="Tag"
          size={(size ?? 'Medium') as 'Small' | 'Medium' | 'Large'}
          variant="Soft"
        />
      ),
      variants: buildVariants(TAG_VARIANTS, (variant) => (
        <PdxTag text={variant} size="Medium" variant={variant} />
      )),
      scale: 0.7,
    },
    {
      id: 'badge',
      name: 'Badge',
      preview: (
        <PdxBadge count={3}>
          <PdxIcon icon={Sparkles} size={16} />
        </PdxBadge>
      ),
      scale: 0.8,
    },
    {
      id: 'progress',
      name: 'Progress',
      preview: <PdxProgress value={62} size="Medium" />,
      sizeOptions: SIZE_OPTIONS,
      statusOptions: PROGRESS_STATUSES.map((status) => ({
        id: status,
        label: status,
        value: status,
      })),
      defaultStatus: 'Default',
      renderPreview: ({ size, status }) => (
        <PdxProgress
          value={62}
          size={(size ?? 'Medium') as 'Small' | 'Medium' | 'Large'}
          status={
            (status ?? 'Default') as
              'Default' | 'Success' | 'Warning' | 'Danger'
          }
        />
      ),
      variants: buildVariants(PROGRESS_STATUSES, (status) => (
        <PdxProgress value={62} size="Medium" status={status} />
      )),
      scale: 0.6,
    },
    {
      id: 'spinner',
      name: 'Spinner',
      preview: <PdxSpinner size="Medium" label="Loading" />,
      sizeOptions: SIZE_OPTIONS,
      renderPreview: ({ size }) => (
        <PdxSpinner
          size={(size ?? 'Medium') as 'Small' | 'Medium' | 'Large'}
          label="Loading"
        />
      ),
      scale: 0.75,
    },
    {
      id: 'statistic',
      name: 'Statistic',
      preview: <PdxStatistic title="Total" value={248} trend="Up" />,
      scale: 0.6,
    },
    {
      id: 'timeline',
      name: 'Timeline',
      preview: <PdxTimeline items={TIMELINE_ITEMS} />,
      scale: 0.55,
    },
    {
      id: 'steps',
      name: 'Steps',
      preview: <PdxSteps items={STEPS_ITEMS} current={1} />,
      variants: buildVariants(STEPS_DIRECTIONS, (direction) => (
        <PdxSteps items={STEPS_ITEMS} current={1} direction={direction} />
      )),
      scale: 0.5,
    },
  ],
};
