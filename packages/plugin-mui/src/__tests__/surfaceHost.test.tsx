import { Dialog, Snackbar } from '@mui/material';
import {
  OfficialReactSurfaceHostContext,
  type OfficialReactSurfaceHost,
} from '@prodivix/plugin-react-host';
import { render, screen, waitFor, within } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { MUI_COMPONENTS } from '#mui-plugin/componentCatalog';
import { MUI_ICON_IMPLEMENTATION } from '#mui-plugin/hostModule';
import { wrapMuiComponent } from '#mui-plugin/muiSurfaceHost';

type ControlledHost = Readonly<{
  host: OfficialReactSurfaceHost;
  styleContainer: HTMLDivElement;
  overlayContainer: HTMLDivElement | null;
  leaseCount(): number;
  runOwnerCleanup(): Promise<void>;
}>;

const createControlledHost = (withOverlay = true): ControlledHost => {
  const styleContainer = document.createElement('div');
  const overlayContainer = withOverlay ? document.createElement('div') : null;
  const cleanups = new Set<() => void | Promise<void>>();
  return Object.freeze({
    styleContainer,
    overlayContainer,
    leaseCount: () => cleanups.size,
    runOwnerCleanup: async () => {
      const current = [...cleanups];
      cleanups.clear();
      for (const cleanup of current) await cleanup();
    },
    host: Object.freeze({
      getStyleContainer: () => styleContainer,
      getOverlayContainer: () => overlayContainer,
      registerCleanup: (cleanup: () => void | Promise<void>) => {
        cleanups.add(cleanup);
        let disposed = false;
        return Object.freeze({
          dispose: () => {
            if (disposed) return;
            disposed = true;
            cleanups.delete(cleanup);
          },
        });
      },
    }),
  });
};

const renderWithHost = (
  host: OfficialReactSurfaceHost,
  element: React.ReactNode
) =>
  render(
    <OfficialReactSurfaceHostContext.Provider value={host}>
      {element}
    </OfficialReactSurfaceHostContext.Provider>
  );

describe('Material UI controlled surface host', () => {
  it('fails closed without mutating global document surfaces', async () => {
    const mutations: MutationRecord[] = [];
    const observer = new MutationObserver((records) =>
      mutations.push(...records)
    );
    observer.observe(document.head, { childList: true, subtree: true });
    observer.observe(document.body, { childList: true, subtree: true });
    const detachedContainer = document.createElement('div');
    const WrappedButton = wrapMuiComponent(MUI_COMPONENTS.Button);

    const view = render(createElement(WrappedButton, null, 'Button'), {
      container: detachedContainer,
    });
    await waitFor(() => expect(detachedContainer).toBeEmptyDOMElement());
    view.unmount();
    observer.disconnect();

    expect(mutations).toEqual([]);
  });

  it('registers and releases an owner-scoped Emotion style lease', async () => {
    const controlled = createControlledHost();
    const WrappedButton = wrapMuiComponent(MUI_COMPONENTS.Button);
    const view = renderWithHost(
      controlled.host,
      createElement(WrappedButton, null, 'Button')
    );

    expect(screen.getByRole('button', { name: 'Button' })).toBeVisible();
    expect(controlled.leaseCount()).toBe(1);

    await controlled.runOwnerCleanup();
    expect(controlled.leaseCount()).toBe(0);
    view.unmount();
    expect(controlled.leaseCount()).toBe(0);
  });

  it('shares one Emotion cache lease across sibling components', () => {
    const controlled = createControlledHost();
    const WrappedButton = wrapMuiComponent(MUI_COMPONENTS.Button);

    const view = renderWithHost(
      controlled.host,
      <>
        <WrappedButton>First</WrappedButton>
        <WrappedButton>Second</WrappedButton>
      </>
    );

    expect(screen.getByRole('button', { name: 'First' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Second' })).toBeVisible();
    expect(controlled.leaseCount()).toBe(1);
    view.unmount();
    expect(controlled.leaseCount()).toBe(0);
  });

  it('renders cached icon exports through the owner-scoped MUI surface', () => {
    const controlled = createControlledHost();
    const WrappedAddIcon = MUI_ICON_IMPLEMENTATION.resolveExport('Add');
    expect(WrappedAddIcon).not.toBeNull();

    renderWithHost(
      controlled.host,
      createElement(WrappedAddIcon!, { 'aria-label': 'Add icon' })
    );

    expect(screen.getByLabelText('Add icon')).toBeVisible();
    expect(controlled.leaseCount()).toBe(1);
  });

  it('does not render overlay components when no controlled overlay exists', () => {
    const controlled = createControlledHost(false);
    const WrappedDialog = wrapMuiComponent(Dialog);
    const WrappedSnackbar = wrapMuiComponent(Snackbar);

    renderWithHost(
      controlled.host,
      <>
        <WrappedDialog open>Dialog</WrappedDialog>
        <WrappedSnackbar open message="Notice" />
      </>
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Notice')).not.toBeInTheDocument();
  });

  it('renders Dialog and Snackbar only inside the controlled overlay', () => {
    const controlled = createControlledHost(true);
    const WrappedDialog = wrapMuiComponent(Dialog);
    const WrappedSnackbar = wrapMuiComponent(Snackbar);

    renderWithHost(
      controlled.host,
      <>
        <WrappedDialog open>Dialog content</WrappedDialog>
        <WrappedSnackbar open message="Notice" />
      </>
    );

    expect(
      within(controlled.overlayContainer!).getByRole('dialog')
    ).toHaveTextContent('Dialog content');
    expect(
      within(controlled.overlayContainer!).getByText('Notice')
    ).toHaveTextContent('Notice');
  });
});
