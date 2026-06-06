import { PdxText } from '@prodivix/ui';
import { Home, Settings } from 'lucide-react';
import { createPlaceholderSvg } from './placeholders';

export const NAVBAR_ITEMS = [
  { label: 'Home', href: '#', active: true },
  { label: 'Docs', href: '#' },
];

export const SIDEBAR_ITEMS = [
  { label: 'Overview', href: '#', active: true, icon: <Home size={14} /> },
  { label: 'Settings', href: '#', icon: <Settings size={14} /> },
];

export const BREADCRUMB_ITEMS = [
  { label: 'Home', href: '#' },
  { label: 'Library', href: '#' },
  { label: 'Assets' },
];

export const ANCHOR_ITEMS = [
  { id: 'intro', label: 'Intro' },
  { id: 'usage', label: 'Usage' },
];

export const TAB_ITEMS = [
  {
    key: 'design',
    label: 'Design',
    content: <PdxText size="Tiny">Panel</PdxText>,
  },
  {
    key: 'code',
    label: 'Code',
    content: <PdxText size="Tiny">Snippet</PdxText>,
  },
];

export const COLLAPSE_ITEMS = [
  {
    key: 'panel-1',
    title: 'Panel 1',
    content: <PdxText size="Tiny">Details</PdxText>,
  },
  {
    key: 'panel-2',
    title: 'Panel 2',
    content: <PdxText size="Tiny">More</PdxText>,
  },
];

export const TABLE_COLUMNS = [
  { key: 'name', title: 'Name', dataIndex: 'name' },
  { key: 'status', title: 'Status', dataIndex: 'status' },
];

export const TABLE_DATA = [
  { name: 'Alpha', status: 'Ready' },
  { name: 'Beta', status: 'Review' },
];

export const GRID_COLUMNS = [
  { key: 'title', title: 'Title', dataIndex: 'title' },
  { key: 'value', title: 'Value', dataIndex: 'value', align: 'Right' },
] satisfies Array<{
  key: string;
  title: string;
  dataIndex: string;
  align?: 'Left' | 'Center' | 'Right';
}>;

export const GRID_DATA = [
  { title: 'Users', value: '128' },
  { title: 'Clicks', value: '42' },
];

export const LIST_ITEMS = [
  { title: 'Checklist', description: 'Setup tasks' },
  { title: 'Review', description: 'Design pass' },
];

export const CHECKLIST_ITEMS = [
  { label: 'Wireframes', value: 'wireframes', checked: true },
  { label: 'Prototype', value: 'prototype' },
];

export const TREE_DATA = [
  {
    id: 'root',
    label: 'Root',
    children: [
      { id: 'child-1', label: 'Child 1' },
      { id: 'child-2', label: 'Child 2' },
    ],
  },
];

export const TREE_SELECT_OPTIONS = [
  {
    id: 'group-1',
    label: 'Group',
    children: [
      { id: 'option-1', label: 'Option 1' },
      { id: 'option-2', label: 'Option 2' },
    ],
  },
];

export const REGION_OPTIONS = [
  {
    label: 'East',
    value: 'east',
    children: [
      {
        label: 'Metro',
        value: 'metro',
        children: [
          { label: 'Downtown', value: 'downtown' },
          { label: 'Uptown', value: 'uptown' },
        ],
      },
    ],
  },
];

export const TIMELINE_ITEMS = [
  { title: 'Draft', time: '09:00', status: 'Success' },
  { title: 'Review', time: '10:30', status: 'Warning' },
] satisfies Array<{
  title: string;
  time: string;
  status: 'Default' | 'Success' | 'Warning' | 'Danger';
}>;

export const STEPS_ITEMS = [
  { title: 'Collect' },
  { title: 'Design' },
  { title: 'Ship' },
];

export const GALLERY_IMAGES = [
  { src: createPlaceholderSvg('A', 120, 90), alt: 'A' },
  { src: createPlaceholderSvg('B', 120, 90), alt: 'B' },
  { src: createPlaceholderSvg('C', 120, 90), alt: 'C' },
];
