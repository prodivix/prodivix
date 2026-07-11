import { act, createElement, type ElementType } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  OfficialReactSurfaceHostContext,
  type OfficialReactSurfaceHost,
} from '@prodivix/plugin-react-host';
import { GENERATED_OFFICIAL_PLUGIN_CATALOG } from '#radix/catalog.generated';
import { RADIX_COMPONENT_EXPORTS } from '#radix/componentCatalog';
import {
  RADIX_OFFICIAL_HOST_MODULE,
  createScopedRadixPortal,
  normalizeRadixControllableProps,
} from '#radix/hostModule';

const component = (name: keyof typeof RADIX_COMPONENT_EXPORTS): ElementType =>
  RADIX_COMPONENT_EXPORTS[name];

describe('Radix official Host Module', () => {
  it('matches the generated component and implementation catalogs', () => {
    expect(Object.keys(RADIX_COMPONENT_EXPORTS).sort()).toEqual(
      GENERATED_OFFICIAL_PLUGIN_CATALOG.components
        .map((item) => item.exportName)
        .sort()
    );
    expect(
      Object.keys(RADIX_OFFICIAL_HOST_MODULE.implementations).sort()
    ).toEqual(
      GENERATED_OFFICIAL_PLUGIN_CATALOG.hostImplementations
        .map((item) => item.id)
        .sort()
    );
  });

  it('normalizes controlled and uncontrolled state without dropping values', () => {
    expect(
      normalizeRadixControllableProps({
        open: false,
        defaultOpen: true,
        value: 'tab-2',
        defaultValue: 'tab-1',
        checked: true,
        defaultChecked: false,
        asChild: true,
      })
    ).toEqual({
      open: false,
      value: 'tab-2',
      checked: true,
      asChild: true,
    });
  });

  it('uses real Accordion, Tabs, and Switch public behavior', () => {
    const AccordionRoot = component('AccordionRoot');
    const AccordionItem = component('AccordionItem');
    const AccordionHeader = component('AccordionHeader');
    const AccordionTrigger = component('AccordionTrigger');
    const AccordionContent = component('AccordionContent');
    const TabsRoot = component('TabsRoot');
    const TabsList = component('TabsList');
    const TabsTrigger = component('TabsTrigger');
    const TabsContent = component('TabsContent');
    const SwitchRoot = component('SwitchRoot');
    const SwitchThumb = component('SwitchThumb');

    render(
      <>
        <AccordionRoot collapsible defaultValue="section" type="single">
          <AccordionItem value="section">
            <AccordionHeader>
              <AccordionTrigger>Section</AccordionTrigger>
            </AccordionHeader>
            <AccordionContent>Accordion details</AccordionContent>
          </AccordionItem>
        </AccordionRoot>
        <TabsRoot defaultValue="one">
          <TabsList aria-label="Example tabs">
            <TabsTrigger value="one">First tab</TabsTrigger>
            <TabsTrigger value="two">Second tab</TabsTrigger>
          </TabsList>
          <TabsContent value="one">First panel</TabsContent>
          <TabsContent value="two">Second panel</TabsContent>
        </TabsRoot>
        <SwitchRoot aria-label="Notifications" defaultChecked={false}>
          <SwitchThumb />
        </SwitchRoot>
      </>
    );

    const accordionTrigger = screen.getByRole('button', { name: 'Section' });
    expect(accordionTrigger.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(accordionTrigger);
    expect(accordionTrigger.getAttribute('aria-expanded')).toBe('false');

    const firstTab = screen.getByRole('tab', { name: 'First tab' });
    const secondTab = screen.getByRole('tab', { name: 'Second tab' });
    expect(firstTab.getAttribute('aria-selected')).toBe('true');
    fireEvent.mouseDown(secondTab, { button: 0, ctrlKey: false });
    fireEvent.click(secondTab);
    expect(secondTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel').textContent).toBe('Second panel');

    const switchControl = screen.getByRole('switch', {
      name: 'Notifications',
    });
    expect(switchControl.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(switchControl);
    expect(switchControl.getAttribute('aria-checked')).toBe('true');
  });

  it('renders portals only in the surface overlay and closes them on cleanup', () => {
    const overlay = document.createElement('div');
    overlay.setAttribute('aria-label', 'Blueprint overlay host');
    document.body.append(overlay);
    const cleanups = new Set<() => void | Promise<void>>();
    const host: OfficialReactSurfaceHost = Object.freeze({
      getStyleContainer: () => null,
      getOverlayContainer: () => overlay,
      registerCleanup: (dispose) => {
        cleanups.add(dispose);
        return Object.freeze({
          dispose: () => {
            cleanups.delete(dispose);
          },
        });
      },
    });
    const DialogRoot = component('DialogRoot');
    const DialogPortal = createScopedRadixPortal(component('DialogPortal'));
    const DialogContent = component('DialogContent');
    const DialogTitle = component('DialogTitle');
    const DialogDescription = component('DialogDescription');

    const view = render(
      <OfficialReactSurfaceHostContext.Provider value={host}>
        <DialogRoot defaultOpen modal={false}>
          <DialogPortal>
            <DialogContent>
              <DialogTitle>Scoped dialog</DialogTitle>
              <DialogDescription>Scoped description</DialogDescription>
            </DialogContent>
          </DialogPortal>
        </DialogRoot>
      </OfficialReactSurfaceHostContext.Provider>
    );

    expect(screen.getByRole('dialog', { name: 'Scoped dialog' })).toBeTruthy();
    expect(cleanups.size).toBe(1);
    act(() => {
      cleanups.forEach((dispose) => void dispose());
    });
    expect(screen.queryByRole('dialog', { name: 'Scoped dialog' })).toBeNull();

    view.unmount();
    overlay.remove();
    expect(cleanups.size).toBe(0);
  });

  it('does not fall back to document.body without a surface Host', () => {
    const DialogRoot = component('DialogRoot');
    const DialogPortal = createScopedRadixPortal(component('DialogPortal'));
    const DialogContent = component('DialogContent');

    render(
      createElement(
        DialogRoot,
        { defaultOpen: true, modal: false },
        createElement(
          DialogPortal,
          null,
          createElement(DialogContent, { 'aria-label': 'Unscoped dialog' })
        )
      )
    );

    expect(
      screen.queryByRole('dialog', { name: 'Unscoped dialog' })
    ).toBeNull();
  });
});
