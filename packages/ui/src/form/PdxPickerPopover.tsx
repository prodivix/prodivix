import './PdxPickerPopover.scss';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { mergeClassNames } from '../foundation/component';
import type { ReactNode } from 'react';

export interface PdxPickerPopoverProps {
  /** Panel body: a listbox, a calendar grid, a set of channel sliders. */
  children: ReactNode;
  /** Extra class on the floating panel. */
  className?: string;
  /**
   * The field row. It anchors the panel, so the panel lines up with the whole
   * control rather than with whichever toggle happened to open it, and it
   * publishes `--radix-popover-trigger-width` as the field width.
   */
  control: ReactNode;
  /** Accessible name of the floating panel. */
  label: string;
  onOpenChange: (open: boolean) => void;
  /**
   * Runs as the panel takes focus. A combobox calls `preventDefault` to keep
   * focus on its field and drive the list through `aria-activedescendant`; a
   * grid panel calls `preventDefault` and then focuses its own roving cell.
   */
  onPanelOpenAutoFocus?: (event: Event) => void;
  open: boolean;
}

/**
 * One floating layer for every complex form control.
 *
 * The pickers differ in what they put inside the panel, not in how the panel
 * behaves: it is portalled so it never clips inside a scrolling editor pane, it
 * dismisses on Escape and on outside pointer input, and it returns focus to the
 * control it came from. Deciding that once is what keeps a date panel, a colour
 * panel and an option list feeling like the same product.
 */
function PdxPickerPopover({
  children,
  className,
  control,
  label,
  onOpenChange,
  onPanelOpenAutoFocus,
  open,
}: PdxPickerPopoverProps) {
  return (
    <PopoverPrimitive.Root onOpenChange={onOpenChange} open={open}>
      <PopoverPrimitive.Anchor className="PdxPickerAnchor">
        {control}
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          aria-label={label}
          className={mergeClassNames('PdxPickerPanel', className)}
          collisionPadding={8}
          onOpenAutoFocus={onPanelOpenAutoFocus}
          sideOffset={6}
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/**
 * The control that opens the panel. Rendered inside `control` so a picker can
 * decide whether the whole field toggles the panel (Select) or only an icon
 * button does (Date, Time, Colour), while Radix keeps toggle, `aria-expanded`
 * and outside-dismiss consistent either way.
 */
export const PdxPickerPopoverToggle = PopoverPrimitive.Trigger;

export default PdxPickerPopover;
