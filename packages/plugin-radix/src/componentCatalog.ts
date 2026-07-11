import type { ElementType } from 'react';
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

/**
 * Build-attested component aliases used by External Library descriptors.
 * Aliases stay unique across Radix packages even when their native exports
 * share names such as Root, Trigger, Portal, and Content.
 */
export const RADIX_COMPONENT_EXPORTS = Object.freeze({
  RadixSlot: Slot,
  RadixLabel: Label,
  RadixSeparator: Separator,
  AccordionRoot: Accordion.Root,
  AccordionItem: Accordion.Item,
  AccordionHeader: Accordion.Header,
  AccordionTrigger: Accordion.Trigger,
  AccordionContent: Accordion.Content,
  TabsRoot: Tabs.Root,
  TabsList: Tabs.List,
  TabsTrigger: Tabs.Trigger,
  TabsContent: Tabs.Content,
  DialogRoot: Dialog.Root,
  DialogTrigger: Dialog.Trigger,
  DialogPortal: Dialog.Portal,
  DialogOverlay: Dialog.Overlay,
  DialogContent: Dialog.Content,
  DialogTitle: Dialog.Title,
  DialogDescription: Dialog.Description,
  DialogClose: Dialog.Close,
  PopoverRoot: Popover.Root,
  PopoverTrigger: Popover.Trigger,
  PopoverPortal: Popover.Portal,
  PopoverContent: Popover.Content,
  TooltipProvider: Tooltip.Provider,
  TooltipRoot: Tooltip.Root,
  TooltipTrigger: Tooltip.Trigger,
  TooltipPortal: Tooltip.Portal,
  TooltipContent: Tooltip.Content,
  TooltipArrow: Tooltip.Arrow,
  DropdownMenuRoot: DropdownMenu.Root,
  DropdownMenuTrigger: DropdownMenu.Trigger,
  DropdownMenuPortal: DropdownMenu.Portal,
  DropdownMenuContent: DropdownMenu.Content,
  DropdownMenuItem: DropdownMenu.Item,
  SwitchRoot: Switch.Root,
  SwitchThumb: Switch.Thumb,
}) satisfies Readonly<Record<string, ElementType>>;
