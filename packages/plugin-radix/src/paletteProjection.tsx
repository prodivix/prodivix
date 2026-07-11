import type { CSSProperties, ReactNode } from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Label } from '@radix-ui/react-label';
import * as Popover from '@radix-ui/react-popover';
import { Separator } from '@radix-ui/react-separator';
import { Slot } from '@radix-ui/react-slot';
import * as Switch from '@radix-ui/react-switch';
import * as Tabs from '@radix-ui/react-tabs';
import * as Tooltip from '@radix-ui/react-tooltip';
import type { OfficialPaletteProjectionImplementation } from '@prodivix/plugin-react-host';

const frame: CSSProperties = {
  width: 84,
  padding: 6,
  border: '1px solid #d4d4d4',
  borderRadius: 6,
  background: '#ffffff',
  color: '#262626',
  fontSize: 10,
};

const button: CSSProperties = {
  padding: '4px 6px',
  border: '1px solid #a3a3a3',
  borderRadius: 4,
  background: '#ffffff',
  color: '#262626',
  fontSize: 10,
};

const item = (id: string, name: string, preview: ReactNode) =>
  Object.freeze({ id, name, libraryId: 'radix', preview });

const paletteItems = Object.freeze([
  item(
    'radix-slot',
    'Slot',
    <Slot>
      <span style={frame}>Slot</span>
    </Slot>
  ),
  item('radix-label', 'Label', <Label style={frame}>Label</Label>),
  item(
    'radix-separator',
    'Separator',
    <Separator
      decorative
      orientation="horizontal"
      style={{ width: 72, height: 1, background: '#737373' }}
    />
  ),
  item(
    'radix-accordion',
    'Accordion',
    <Accordion.Root
      collapsible
      defaultValue="preview"
      type="single"
      style={frame}
    >
      <Accordion.Item value="preview">
        <Accordion.Header style={{ margin: 0 }}>
          <Accordion.Trigger style={{ ...button, width: '100%' }}>
            Accordion
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Content style={{ paddingTop: 4 }}>Content</Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  ),
  item(
    'radix-tabs',
    'Tabs',
    <Tabs.Root defaultValue="one" style={frame}>
      <Tabs.List aria-label="Preview tabs" style={{ display: 'flex', gap: 3 }}>
        <Tabs.Trigger style={button} value="one">
          One
        </Tabs.Trigger>
        <Tabs.Trigger style={button} value="two">
          Two
        </Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content style={{ paddingTop: 4 }} value="one">
        Content
      </Tabs.Content>
    </Tabs.Root>
  ),
  item(
    'radix-dialog',
    'Dialog',
    <Dialog.Root>
      <Dialog.Trigger style={button}>Open dialog</Dialog.Trigger>
    </Dialog.Root>
  ),
  item(
    'radix-popover',
    'Popover',
    <Popover.Root>
      <Popover.Trigger style={button}>Open popover</Popover.Trigger>
    </Popover.Root>
  ),
  item(
    'radix-tooltip',
    'Tooltip',
    <Tooltip.Provider delayDuration={0}>
      <Tooltip.Root>
        <Tooltip.Trigger style={button}>Show tooltip</Tooltip.Trigger>
      </Tooltip.Root>
    </Tooltip.Provider>
  ),
  item(
    'radix-dropdown-menu',
    'Dropdown Menu',
    <DropdownMenu.Root>
      <DropdownMenu.Trigger style={button}>Open menu</DropdownMenu.Trigger>
    </DropdownMenu.Root>
  ),
  item(
    'radix-switch',
    'Switch',
    <Switch.Root
      aria-label="Preview switch"
      defaultChecked
      style={{
        position: 'relative',
        width: 36,
        height: 20,
        padding: 2,
        border: 0,
        borderRadius: 10,
        background: '#737373',
      }}
    >
      <Switch.Thumb
        style={{
          display: 'block',
          width: 16,
          height: 16,
          borderRadius: 8,
          background: '#ffffff',
        }}
      />
    </Switch.Root>
  ),
]);

export const RADIX_PALETTE_PROJECTION = Object.freeze({
  kind: 'palette-projection',
  groups: Object.freeze([
    Object.freeze({
      id: 'radix-primitives',
      title: 'Radix UI',
      source: 'external',
      items: paletteItems,
    }),
  ]),
}) satisfies OfficialPaletteProjectionImplementation;
