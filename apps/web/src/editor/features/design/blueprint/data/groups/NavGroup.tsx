import {
  PdxAnchorNavigation,
  PdxBreadcrumb,
  PdxButton,
  PdxCollapse,
  PdxNav,
  PdxNavbar,
  PdxPagination,
  PdxOutlet,
  PdxRoute,
  PdxSidebar,
  PdxTabs,
  PdxText,
} from '@prodivix/ui';
import type { ComponentGroup } from '@/editor/features/design/blueprint/editor/model/types';
import { buildVariants } from '@/editor/features/design/blueprint/data/helpers';
import {
  NAV_COLUMNS,
  SIZE_OPTIONS,
} from '@/editor/features/design/blueprint/data/options';
import {
  ANCHOR_ITEMS,
  BREADCRUMB_ITEMS,
  COLLAPSE_ITEMS,
  NAVBAR_ITEMS,
  SIDEBAR_ITEMS,
  TAB_ITEMS,
} from '@/editor/features/design/blueprint/data/sampleData';

export const NAV_GROUP: ComponentGroup = {
  id: 'nav',
  title: '导航组件',
  items: [
    {
      id: 'nav',
      name: 'Nav',
      preview: (
        <PdxNav columns={2} backgroundStyle="Solid" style={{ width: 180 }}>
          <div className="PdxNavLeft">
            <PdxText size="Tiny">Brand</PdxText>
          </div>
          <div className="PdxNavRight">
            <PdxButton text="Login" size="Tiny" category="Ghost" />
          </div>
        </PdxNav>
      ),
      variants: buildVariants(
        NAV_COLUMNS,
        (columns) => (
          <PdxNav
            columns={columns}
            backgroundStyle="Solid"
            style={{ width: 180 }}
          >
            <div className="PdxNavLeft">
              <PdxText size="Tiny">Brand</PdxText>
            </div>
            <div className="PdxNavRight">
              <PdxButton
                text={columns === 2 ? 'Login' : 'Start'}
                size="Tiny"
                category="Ghost"
              />
            </div>
          </PdxNav>
        ),
        (columns) => `${columns} Col`
      ),
      scale: 0.55,
    },
    {
      id: 'navbar',
      name: 'Navbar',
      preview: <PdxNavbar size="Medium" brand="Pdx" items={NAVBAR_ITEMS} />,
      sizeOptions: SIZE_OPTIONS,
      renderPreview: ({ size }) => (
        <PdxNavbar
          size={(size ?? 'Medium') as 'Small' | 'Medium' | 'Large'}
          brand="Pdx"
          items={NAVBAR_ITEMS}
        />
      ),
      scale: 0.5,
    },
    {
      id: 'sidebar',
      name: 'Sidebar',
      preview: <PdxSidebar title="Menu" items={SIDEBAR_ITEMS} width={160} />,
      scale: 0.5,
    },
    {
      id: 'breadcrumb',
      name: 'Breadcrumb',
      preview: <PdxBreadcrumb items={BREADCRUMB_ITEMS} />,
      scale: 0.7,
    },
    {
      id: 'pagination',
      name: 'Pagination',
      preview: <PdxPagination page={2} total={50} />,
      scale: 0.6,
    },
    {
      id: 'anchor-navigation',
      name: 'AnchorNav',
      preview: (
        <PdxAnchorNavigation items={ANCHOR_ITEMS} orientation="Vertical" />
      ),
      variants: buildVariants(
        ['Vertical', 'Horizontal'] as const,
        (orientation) => (
          <PdxAnchorNavigation items={ANCHOR_ITEMS} orientation={orientation} />
        )
      ),
      scale: 0.6,
    },
    {
      id: 'route',
      name: 'Route',
      preview: (
        <PdxRoute>
          <div data-route-path="/">Home content</div>
          <div data-route-path="/about">About content</div>
          <div data-route-fallback>Fallback content</div>
        </PdxRoute>
      ),
      scale: 0.55,
    },
    {
      id: 'outlet',
      name: 'Outlet',
      preview: <PdxOutlet emptyText="Route content renders here" />,
      scale: 0.55,
    },
    {
      id: 'tabs',
      name: 'Tabs',
      preview: <PdxTabs items={TAB_ITEMS} />,
      scale: 0.55,
    },
    {
      id: 'collapse',
      name: 'Collapse',
      preview: (
        <PdxCollapse items={COLLAPSE_ITEMS} defaultActiveKeys={['panel-1']} />
      ),
      scale: 0.55,
    },
  ],
};
