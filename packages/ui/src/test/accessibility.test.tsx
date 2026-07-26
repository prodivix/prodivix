import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import PdxButton from '../button/PdxButton';
import PdxDivider from '../container/PdxDivider';
import PdxGrid from '../container/PdxGrid';
import PdxSpacer from '../container/PdxSpacer';
import PdxSplitter from '../container/PdxSplitter';
import PdxStack from '../container/PdxStack';
import PdxCheckList from '../data/PdxCheckList';
import PdxDataGrid from '../data/PdxDataGrid';
import PdxList from '../data/PdxList';
import PdxTable from '../data/PdxTable';
import PdxTree from '../data/PdxTree';
import PdxVirtualList from '../data/PdxVirtualList';
import PdxDrawer from '../feedback/PdxDrawer';
import PdxMessage from '../feedback/PdxMessage';
import PdxModal from '../feedback/PdxModal';
import PdxNotification from '../feedback/PdxNotification';
import PdxPopover from '../feedback/PdxPopover';
import PdxTooltip from '../feedback/PdxTooltip';
import PdxCheckbox from '../form/PdxCheckbox';
import PdxColorPicker from '../form/PdxColorPicker';
import PdxDatePicker from '../form/PdxDatePicker';
import PdxDateRangePicker from '../form/PdxDateRangePicker';
import PdxRegionPicker, { type PdxRegionOption } from '../form/PdxRegionPicker';
import PdxSelect from '../form/PdxSelect';
import PdxSwitch from '../form/PdxSwitch';
import PdxTimePicker from '../form/PdxTimePicker';
import PdxInput from '../input/PdxInput';
import PdxAnchorNavigation from '../nav/PdxAnchorNavigation';
import PdxBreadcrumb from '../nav/PdxBreadcrumb';
import PdxCollapse from '../nav/PdxCollapse';
import PdxNav from '../nav/PdxNav';
import PdxNavbar from '../nav/PdxNavbar';
import PdxPagination from '../nav/PdxPagination';
import PdxSidebar from '../nav/PdxSidebar';
import PdxTabs from '../nav/PdxTabs';

const frameworkOptions = [
  { label: 'React/Vite', value: 'react-vite' },
  { label: 'Vue/Vite', value: 'vue-vite' },
  { label: 'Remote runner', value: 'remote', disabled: true },
];

const regionOptions: PdxRegionOption[] = [
  {
    children: [
      {
        children: [{ label: 'Xihu', value: 'xihu' }],
        label: 'Hangzhou',
        value: 'hangzhou',
      },
    ],
    label: 'Zhejiang',
    value: 'zhejiang',
  },
];

describe('representative component accessibility', () => {
  it('has no automatically detectable violations', async () => {
    const { container } = render(
      <main>
        <PdxButton text="Save" variant="Primary" />
        <label>
          Project name
          <PdxInput />
        </label>
        <PdxMessage text="Saved" type="Success" />
        <PdxTabs
          aria-label="Project sections"
          items={[
            { key: 'overview', label: 'Overview', content: 'Overview content' },
            { key: 'activity', label: 'Activity', content: 'Activity content' },
          ]}
        />
      </main>
    );

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  // The four record surfaces at once, each with its rows made operable. A
  // sortable header must be a real button with `aria-sort` on the header cell,
  // a selectable row must carry `aria-selected` under a role that allows it,
  // and a selectable list must become a named `listbox` of `option`s.
  it('composes the record surfaces with sorting and selection without violations', async () => {
    const { container } = render(
      <main>
        <PdxTable
          columns={[
            { key: 'name', title: 'Name', dataIndex: 'name', sortable: true },
            { key: 'role', title: 'Role', dataIndex: 'role' },
          ]}
          data={[
            { name: 'Alice', role: 'Designer' },
            { name: 'Ben', role: 'Developer' },
          ]}
          defaultSelectedRowKeys={['Alice']}
          rowKey="name"
          selectionMode="Multiple"
          stickyHeader
          title="Team members"
        />
        <PdxTable
          aria-label="Empty roster"
          columns={[{ key: 'name', title: 'Name', dataIndex: 'name' }]}
          data={[]}
        />
        <PdxDataGrid
          columns={[
            {
              key: 'product',
              title: 'Product',
              dataIndex: 'product',
              sortable: true,
            },
            { key: 'stock', title: 'Stock', dataIndex: 'stock' },
          ]}
          data={[
            { product: 'Notebook', stock: 24 },
            { product: 'Marker', stock: 80 },
          ]}
          defaultSelectedRowKeys={['Notebook']}
          rowKey="product"
          selectionMode="Single"
        />
        <PdxDataGrid
          columns={[{ key: 'product', title: 'Product', dataIndex: 'product' }]}
          data={[]}
        />
        <PdxList
          aria-label="Meetings"
          defaultSelectedKeys={['review']}
          items={[
            { id: 'review', title: 'Design review', description: 'Today' },
            { id: 'sync', title: 'Product sync', disabled: true },
          ]}
          selectionMode="Multiple"
        />
        <PdxList items={[{ id: 'plain', title: 'Read only', extra: 'now' }]} />
        <PdxCheckList
          description="Choose where operational alerts are delivered."
          items={[
            { label: 'Email notifications', value: 'email', checked: true },
            { label: 'SMS alerts', value: 'sms', disabled: true },
          ]}
          label="Notification channels"
          message="Select at least one channel."
          state="Error"
        />
        <PdxCheckList items={[]} label="Archived channels" />
      </main>
    );

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  // A `tree` may only own `treeitem`/`group`, and `aria-expanded` belongs on
  // the item. An expand affordance rendered as a sibling button violates both
  // and axe reports it as aria-required-children.
  it('renders a tree whose items own their own groups', async () => {
    const { container } = render(
      <main>
        <PdxTree
          data={[
            {
              id: 'root',
              label: 'Root',
              children: [{ id: 'child', label: 'Child' }],
            },
          ]}
          defaultExpandedKeys={['root']}
        />
      </main>
    );

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  // Every navigation surface a page can carry at once. Landmarks have to stay
  // distinguishable, lists have to stay lists, and `aria-controls` has to point
  // at something that exists even while its panel is collapsed.
  it('composes the navigation surfaces without landmark or relationship violations', async () => {
    const { container } = render(
      <main>
        <PdxNav navigationLabel="Utility">
          <PdxNav.Left>
            <PdxNav.Heading heading="Prodivix" />
          </PdxNav.Left>
        </PdxNav>
        <PdxNavbar
          brand="Prodivix"
          items={[
            { label: 'Overview', href: '#overview', active: true },
            { label: 'Projects', href: '#projects' },
            { label: 'Billing', disabled: true },
          ]}
        />
        <PdxSidebar
          collapsed
          items={[
            { label: 'Overview', href: '#overview', active: true },
            { label: 'Archive', href: '#archive', disabled: true },
          ]}
          title="Workspace"
        />
        <PdxBreadcrumb
          items={[
            { label: 'Home', href: '#home' },
            { label: 'Library', href: '#library' },
            { label: 'Data' },
          ]}
        />
        <PdxAnchorNavigation
          activeId="usage"
          items={[
            { id: 'intro', label: 'Introduction' },
            { id: 'usage', label: 'Usage' },
          ]}
        />
        <PdxCollapse
          items={[
            { key: 'first', title: 'Connection', content: 'Connection' },
            {
              key: 'second',
              title: 'Locked',
              content: 'Locked',
              disabled: true,
            },
          ]}
        />
        <PdxPagination page={3} total={100} />
      </main>
    );

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  // The two editor primitives. A `separator` that can be resized must expose
  // its value and range, and a windowed `listbox` must keep `aria-setsize` on
  // the real total and `aria-activedescendant` pointing at a mounted option.
  it('composes the resizable and windowed surfaces without violations', async () => {
    const { container } = render(
      <main>
        <PdxSplitter
          defaultSizes={[200]}
          panes={[
            {
              key: 'sidebar',
              label: 'Sidebar',
              content: 'Sidebar content',
              minSize: 120,
              maxSize: 400,
            },
            { key: 'editor', content: 'Editor content' },
          ]}
        />
        <PdxVirtualList
          aria-label="Project files"
          defaultSelectedKey="file-2"
          height={160}
          items={Array.from({ length: 200 }, (_unused, index) => ({
            key: `file-${index}`,
            content: `File ${index + 1}`,
          }))}
          rowHeight={32}
        />
      </main>
    );

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  // The binary controls and the layout primitives together. A checkbox in the
  // mixed state, a `switch` that owns its own name, a labelled `separator` and
  // spacing elements that must stay out of the accessibility tree.
  it('composes the binary controls and layout primitives without violations', async () => {
    const { container } = render(
      <main>
        <PdxStack gap="Medium">
          <PdxCheckbox
            defaultChecked
            description="Applied to every export target."
            label="Minify output"
          />
          <PdxCheckbox indeterminate label="All targets" />
          <PdxCheckbox
            label="Publish on save"
            message="Select at least one target."
            state="Error"
          />
          <PdxCheckbox disabled label="Locked" />
          <PdxSwitch label="Live preview" />
          <PdxSwitch
            defaultChecked
            description="Every accepted transaction is committed immediately."
            label="Auto commit"
          />
          <PdxSwitch disabled label="Managed by policy" />
          <PdxDivider label="Advanced" />
          <PdxSpacer size="Medium" />
          <PdxGrid columns={2} columnsMedium={3}>
            <span>Blueprint</span>
            <span>NodeGraph</span>
          </PdxGrid>
          <PdxStack direction="Row">
            <span>Left</span>
            <PdxSpacer flexible />
            <PdxDivider orientation="Vertical" />
            <span>Right</span>
          </PdxStack>
        </PdxStack>
      </main>
    );

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  // The feedback surfaces that stay in the page. Both are live regions, so the
  // role, its politeness and the decorative icon have to agree.
  it('composes the announcing feedback surfaces without violations', async () => {
    const { container } = render(
      <main>
        <PdxMessage closable text="Draft saved" type="Success" />
        <PdxMessage text="Upload failed" type="Danger" />
        <PdxNotification
          actions={<PdxButton size="Small" text="Install" />}
          closable
          description="Version 2.4.0 is available."
          title="Update ready"
        />
        <PdxNotification title="Deploy failed" type="Danger" />
      </main>
    );

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  // The floating surfaces are portalled to the body, so the whole document is
  // the subject: a dialog has to keep its name and description, and the
  // content it hides has to stay hidden from both the reader and the Tab key.
  it.each([
    [
      'modal',
      <PdxModal
        description="Nothing is saved until you confirm."
        footer={<PdxButton size="Small" text="Confirm" />}
        key="modal"
        open
        title="Review changes"
      >
        Two files changed.
      </PdxModal>,
    ],
    [
      'drawer',
      <PdxDrawer
        description="Applies to the selected layer."
        key="drawer"
        open
        title="Layer settings"
      >
        <PdxButton size="Small" text="Reset" />
      </PdxDrawer>,
    ],
  ])('opens the %s without violations', async (_name, surface) => {
    render(surface);

    const results = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  // Popover and tooltip do not dim the page, so they coexist with it. The
  // tooltip must describe its trigger without becoming a tab stop, and the
  // popover panel must carry a name of its own.
  //
  // `region` is the one rule that cannot apply: it asks that page content sit
  // inside a landmark, and the node it reports is the positioning host Radix
  // appends to `<body>`, not markup this package emits.
  it('opens the transient floating surfaces without violations', async () => {
    render(
      <main>
        <PdxPopover
          content="Duplicate, rename or delete."
          defaultOpen
          panelLabel="Node actions"
          title="Node actions"
        >
          <PdxButton size="Small" text="More" />
        </PdxPopover>
        <PdxTooltip content="Removes the file permanently" defaultOpen>
          <PdxButton size="Small" text="Delete" />
        </PdxTooltip>
      </main>
    );

    const results = await axe.run(document.body, {
      rules: {
        'color-contrast': { enabled: false },
        region: { enabled: false },
      },
    });
    expect(results.violations).toEqual([]);
  });

  // The complex form controls while closed. Each is a labelled field, and the
  // panel ids their triggers point at must not be claimed before the panel that
  // owns them exists.
  it('composes the complex form controls without violations', async () => {
    const { container } = render(
      <main>
        <PdxSelect
          description="Used for every new route."
          label="Framework"
          options={frameworkOptions}
          value="react-vite"
        />
        <PdxSelect
          label="Target"
          message="Choose a target."
          options={frameworkOptions}
          required
          state="Error"
        />
        <PdxDatePicker
          description="Campaigns start at midnight."
          label="Start date"
          value="2026-01-22"
        />
        <PdxDateRangePicker
          endValue="2026-01-28"
          label="Campaign"
          startValue="2026-01-22"
        />
        <PdxTimePicker label="Start time" value="09:30" />
        <PdxColorPicker label="Theme colour" value="#2F6FED" />
        <PdxColorPicker label="Accent" showTextInput={false} value="#FFB007" />
        <PdxRegionPicker
          label="Region"
          options={regionOptions}
          value={{ city: 'hangzhou', province: 'zhejiang' }}
        />
      </main>
    );

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  // Every picker panel in turn. The combobox pattern needs an
  // `aria-activedescendant` that resolves to a mounted option, the calendar
  // needs a grid whose cells stay gridcells under real rows, and the colour
  // channels each need a name of their own.
  //
  // `region` is disabled for the same reason as the other floating surfaces:
  // the node it reports is the positioning host Radix appends to `<body>`.
  it.each([
    {
      label: 'option list',
      openBy: { name: 'Framework', role: 'combobox' as const },
      surface: (
        <PdxSelect
          key="select"
          label="Framework"
          options={frameworkOptions}
          value="react-vite"
        />
      ),
    },
    {
      label: 'calendar',
      openBy: { name: /Choose date,/, role: 'button' as const },
      surface: (
        <PdxDatePicker key="date" label="Start date" value="2026-01-22" />
      ),
    },
    {
      label: 'range calendar',
      openBy: { name: /Choose date range/, role: 'button' as const },
      surface: (
        <PdxDateRangePicker
          endValue="2026-01-28"
          key="range"
          label="Campaign"
          startValue="2026-01-22"
        />
      ),
    },
    {
      label: 'time list',
      openBy: { name: /Choose time/, role: 'button' as const },
      surface: <PdxTimePicker key="time" label="Start time" value="09:30" />,
    },
    {
      label: 'colour channels',
      openBy: { name: /Adjust colour/, role: 'button' as const },
      surface: (
        <PdxColorPicker key="colour" label="Theme colour" value="#2F6FED" />
      ),
    },
  ])(
    'opens the $label panel without violations',
    async ({ openBy, surface }) => {
      const user = userEvent.setup();
      render(<main>{surface}</main>);

      await user.click(screen.getByRole(openBy.role, { name: openBy.name }));

      const results = await axe.run(document.body, {
        rules: {
          'color-contrast': { enabled: false },
          region: { enabled: false },
        },
      });
      expect(results.violations).toEqual([]);
    }
  );
});
