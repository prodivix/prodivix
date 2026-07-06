import type { ComponentGroup } from '@/editor/features/blueprint/editor/model/types';

export const HEADLESS_GROUP: ComponentGroup = {
  id: 'radix',
  title: 'Radix UI',
  source: 'headless',
  items: [
    {
      id: 'radix-slot',
      name: 'Slot',
      preview: (
        <div className="rounded-md border border-(--border-default) px-2 py-1 text-[10px] text-(--text-secondary)">
          Slot
        </div>
      ),
    },
    {
      id: 'radix-label',
      name: 'Label',
      preview: (
        <label className="text-[10px] font-medium text-(--text-secondary)">
          Label
        </label>
      ),
    },
    {
      id: 'radix-separator',
      name: 'Separator',
      preview: <div className="h-px w-16 bg-(--border-strong)" />,
    },
    {
      id: 'radix-accordion',
      name: 'Accordion',
      preview: (
        <div className="grid w-20 gap-1 rounded-md border border-(--border-default) bg-(--bg-canvas) p-1.5">
          <div className="h-3 rounded bg-(--border-default)" />
          <div className="h-2 rounded bg-(--border-subtle)" />
        </div>
      ),
    },
    {
      id: 'radix-tabs',
      name: 'Tabs',
      preview: (
        <div className="grid w-20 gap-1 rounded-md border border-(--border-default) p-1.5">
          <div className="grid grid-cols-2 gap-1">
            <div className="h-3 rounded bg-(--border-default)" />
            <div className="h-3 rounded bg-(--border-subtle)" />
          </div>
          <div className="h-2 rounded bg-(--border-subtle)" />
        </div>
      ),
    },
    {
      id: 'radix-dialog',
      name: 'Dialog',
      preview: (
        <div className="grid w-20 gap-1 rounded-md border border-(--border-default) bg-(--bg-canvas) p-1.5 shadow-sm">
          <div className="h-2.5 w-10 rounded bg-(--border-default)" />
          <div className="h-2 rounded bg-(--border-subtle)" />
          <div className="h-2 rounded bg-(--border-subtle)" />
        </div>
      ),
    },
    {
      id: 'radix-popover',
      name: 'Popover',
      preview: (
        <div className="relative grid w-20 place-items-center">
          <div className="h-4 w-7 rounded bg-(--border-subtle)" />
          <div className="absolute top-5 grid w-14 gap-1 rounded-md border border-(--border-default) bg-(--bg-canvas) p-1">
            <div className="h-1.5 rounded bg-(--border-subtle)" />
            <div className="h-1.5 rounded bg-(--border-subtle)" />
          </div>
        </div>
      ),
      scale: 0.62,
    },
    {
      id: 'radix-tooltip',
      name: 'Tooltip',
      preview: (
        <div className="relative grid w-20 place-items-center">
          <div className="h-4 w-7 rounded bg-(--border-subtle)" />
          <div className="absolute -top-3 rounded bg-(--text-primary) px-1.5 py-0.5 text-[8px] text-(--text-inverse)">
            Tip
          </div>
        </div>
      ),
      scale: 0.64,
    },
    {
      id: 'radix-dropdown-menu',
      name: 'DropdownMenu',
      preview: (
        <div className="grid w-20 gap-1">
          <div className="h-4 w-8 rounded bg-(--border-subtle)" />
          <div className="grid gap-1 rounded-md border border-(--border-default) bg-(--bg-canvas) p-1">
            <div className="h-1.5 rounded bg-(--border-subtle)" />
            <div className="h-1.5 rounded bg-(--border-subtle)" />
            <div className="h-1.5 rounded bg-(--border-subtle)" />
          </div>
        </div>
      ),
      scale: 0.62,
    },
    {
      id: 'radix-switch',
      name: 'Switch',
      preview: (
        <div className="relative h-4 w-8 rounded-full bg-(--border-default)">
          <div className="absolute top-0.5 right-0.5 h-3 w-3 rounded-full bg-(--bg-canvas) shadow-(--shadow-sm)" />
        </div>
      ),
    },
  ],
};
