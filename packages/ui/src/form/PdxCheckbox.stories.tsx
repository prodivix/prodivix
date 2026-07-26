import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import PdxCheckbox from './PdxCheckbox';

const meta: Meta<typeof PdxCheckbox> = {
  title: 'Components/Checkbox',
  component: PdxCheckbox,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['ExtraSmall', 'Small', 'Medium', 'Large'],
      description: '控件尺寸',
    },
    state: {
      control: 'select',
      options: ['Default', 'Error', 'Warning', 'Success'],
      description: '校验状态',
    },
    indeterminate: { control: 'boolean', description: '混合状态' },
    disabled: { control: 'boolean', description: '是否禁用' },
    required: { control: 'boolean', description: '是否必填' },
    onCheckedChange: { action: 'checkedChange' },
  },
};

export default meta;
type Story = StoryObj<typeof PdxCheckbox>;

export const Default: Story = {
  args: {
    label: 'Include hidden files',
  },
};

export const WithDescription: Story = {
  args: {
    label: 'Publish on save',
    description: 'The workspace is committed before the export runs.',
    defaultChecked: true,
  },
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <PdxCheckbox size="ExtraSmall" label="Extra small" defaultChecked />
      <PdxCheckbox size="Small" label="Small" defaultChecked />
      <PdxCheckbox size="Medium" label="Medium" defaultChecked />
      <PdxCheckbox size="Large" label="Large" defaultChecked />
    </div>
  ),
};

export const States: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <PdxCheckbox label="Unchecked" />
      <PdxCheckbox label="Checked" defaultChecked />
      <PdxCheckbox label="Mixed" indeterminate />
      <PdxCheckbox label="Disabled" disabled />
      <PdxCheckbox label="Disabled checked" disabled defaultChecked />
      <PdxCheckbox
        label="Invalid"
        state="Error"
        message="Select at least one target."
      />
    </div>
  ),
};

/** A parent whose mixed state is derived from its children. */
export const MixedParent: Story = {
  render: () => {
    const [targets, setTargets] = useState<Record<string, boolean>>({
      web: true,
      export: false,
    });
    const values = Object.values(targets);
    const allChecked = values.every(Boolean);
    const someChecked = values.some(Boolean);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <PdxCheckbox
          checked={allChecked}
          indeterminate={someChecked && !allChecked}
          label="All targets"
          onCheckedChange={(checked) =>
            setTargets({ web: checked, export: checked })
          }
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            paddingLeft: '24px',
          }}
        >
          <PdxCheckbox
            checked={targets.web}
            label="Web preview"
            onCheckedChange={(checked) =>
              setTargets((current) => ({ ...current, web: checked }))
            }
          />
          <PdxCheckbox
            checked={targets.export}
            label="Standalone export"
            onCheckedChange={(checked) =>
              setTargets((current) => ({ ...current, export: checked }))
            }
          />
        </div>
      </div>
    );
  },
};
