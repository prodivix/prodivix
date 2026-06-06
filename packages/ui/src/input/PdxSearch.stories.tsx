import type { Meta, StoryObj } from '@storybook/react';
import PdxSearch from './PdxSearch';
import { useState } from 'react';

const meta: Meta<typeof PdxSearch> = {
  title: 'Components/Search',
  component: PdxSearch,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['Small', 'Medium', 'Large'],
      description: '搜索框尺寸',
    },
    disabled: {
      control: 'boolean',
      description: '是否禁用',
    },
    onClear: { action: 'cleared' },
    onSearch: { action: 'searched' },
    onChange: { action: 'changed' },
  },
};

export default meta;
type Story = StoryObj<typeof PdxSearch>;

export const Default: Story = {
  args: {
    placeholder: 'Search...',
    size: 'Medium',
  },
};

export const Sizes: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        width: '300px',
      }}
    >
      <PdxSearch size="Small" placeholder="Small search" />
      <PdxSearch size="Medium" placeholder="Medium search" />
      <PdxSearch size="Large" placeholder="Large search" />
    </div>
  ),
};

export const WithValue: Story = {
  args: {
    placeholder: 'Search...',
    value: 'Search query',
  },
};

export const Disabled: Story = {
  args: {
    placeholder: 'Search...',
    disabled: true,
    value: 'Cannot search',
  },
};

export const Controlled: Story = {
  render: () => {
    const [value, setValue] = useState('');
    const handleClear = () => {
      setValue('');
    };
    const handleSearch = (searchValue: string) => {
      console.log('Searching for:', searchValue);
    };
    return (
      <div style={{ width: '300px' }}>
        <PdxSearch
          placeholder="Type to search..."
          value={value}
          onChange={setValue}
          onClear={handleClear}
          onSearch={handleSearch}
        />
        <p style={{ marginTop: '8px' }}>Value: {value || '(empty)'}</p>
      </div>
    );
  },
};

export const CustomPlaceholder: Story = {
  args: {
    placeholder: 'Search for items, users, or content...',
    size: 'Medium',
  },
};

export const WithSearchAction: Story = {
  render: () => {
    const [value, setValue] = useState('');
    const [searchResults, setSearchResults] = useState<string[]>([]);

    const handleSearch = (searchValue: string) => {
      if (searchValue.trim()) {
        setSearchResults([
          `Result 1 for "${searchValue}"`,
          `Result 2 for "${searchValue}"`,
          `Result 3 for "${searchValue}"`,
        ]);
      } else {
        setSearchResults([]);
      }
    };

    const handleClear = () => {
      setValue('');
      setSearchResults([]);
    };

    return (
      <div style={{ width: '400px' }}>
        <PdxSearch
          placeholder="Search and press Enter..."
          value={value}
          onChange={setValue}
          onClear={handleClear}
          onSearch={handleSearch}
        />
        {searchResults.length > 0 && (
          <div
            style={{
              marginTop: '12px',
              padding: '12px',
              border: '1px solid var(--text-muted)',
              borderRadius: '6px',
            }}
          >
            {searchResults.map((result, index) => (
              <div
                key={index}
                style={{
                  padding: '8px 0',
                  borderBottom:
                    index < searchResults.length - 1
                      ? '1px solid var(--text-muted)'
                      : 'none',
                }}
              >
                {result}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  },
};
