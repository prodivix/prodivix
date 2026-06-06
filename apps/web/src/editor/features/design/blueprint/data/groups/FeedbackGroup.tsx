import {
  PdxButton,
  PdxDrawer,
  PdxEmpty,
  PdxMessage,
  PdxModal,
  PdxNotification,
  PdxPopover,
  PdxSkeleton,
  PdxText,
  PdxTooltip,
} from '@prodivix/ui';
import type { ComponentGroup } from '@/editor/features/design/blueprint/editor/model/types';
import { buildVariants } from '@/editor/features/design/blueprint/data/helpers';
import {
  DRAWER_PLACEMENTS,
  MESSAGE_TYPES,
  NOTIFICATION_TYPES,
  SKELETON_VARIANTS,
  SIZE_OPTIONS,
  TOOLTIP_PLACEMENTS,
} from '@/editor/features/design/blueprint/data/options';

export const FEEDBACK_GROUP: ComponentGroup = {
  id: 'feedback',
  title: '反馈组件',
  items: [
    {
      id: 'modal',
      name: 'Modal',
      preview: (
        <PdxModal
          open
          size="Medium"
          title="Modal"
          footer={<PdxButton text="OK" size="Tiny" category="Primary" />}
        >
          <PdxText size="Tiny">Details</PdxText>
        </PdxModal>
      ),
      sizeOptions: SIZE_OPTIONS,
      renderPreview: ({ size }) => (
        <PdxModal
          open
          size={(size ?? 'Medium') as 'Small' | 'Medium' | 'Large'}
          title="Modal"
          footer={<PdxButton text="OK" size="Tiny" category="Primary" />}
        >
          <PdxText size="Tiny">Details</PdxText>
        </PdxModal>
      ),
      scale: 0.45,
    },
    {
      id: 'drawer',
      name: 'Drawer',
      preview: (
        <PdxDrawer open placement="Right" size={160} title="Drawer">
          <PdxText size="Tiny">Content</PdxText>
        </PdxDrawer>
      ),
      variants: buildVariants(DRAWER_PLACEMENTS, (placement) => (
        <PdxDrawer open placement={placement} size={140} title="Drawer">
          <PdxText size="Tiny">Content</PdxText>
        </PdxDrawer>
      )),
      scale: 0.45,
    },
    {
      id: 'tooltip',
      name: 'Tooltip',
      preview: (
        <PdxTooltip content="Tooltip" placement="Top">
          <PdxButton text="Hover" size="Tiny" category="Secondary" />
        </PdxTooltip>
      ),
      variants: buildVariants(TOOLTIP_PLACEMENTS, (placement) => (
        <PdxTooltip content={placement} placement={placement}>
          <PdxButton text="Hover" size="Tiny" category="Secondary" />
        </PdxTooltip>
      )),
      scale: 0.8,
    },
    {
      id: 'popover',
      name: 'Popover',
      preview: (
        <PdxPopover title="Popover" content="Details" defaultOpen>
          <PdxButton text="More" size="Tiny" category="Secondary" />
        </PdxPopover>
      ),
      scale: 0.8,
    },
    {
      id: 'message',
      name: 'Message',
      preview: <PdxMessage text="Saved" type="Success" />,
      statusOptions: MESSAGE_TYPES.map((status) => ({
        id: status,
        label: status,
        value: status,
      })),
      defaultStatus: 'Success',
      renderPreview: ({ status }) => (
        <PdxMessage
          text="Saved"
          type={
            (status ?? 'Success') as 'Info' | 'Success' | 'Warning' | 'Danger'
          }
        />
      ),
      variants: buildVariants(MESSAGE_TYPES, (type) => (
        <PdxMessage text={type} type={type} />
      )),
      scale: 0.8,
    },
    {
      id: 'notification',
      name: 'Notification',
      preview: (
        <PdxNotification
          title="Update"
          description="Latest changes"
          type="Info"
        />
      ),
      statusOptions: NOTIFICATION_TYPES.map((status) => ({
        id: status,
        label: status,
        value: status,
      })),
      defaultStatus: 'Info',
      renderPreview: ({ status }) => (
        <PdxNotification
          title="Update"
          description="Latest changes"
          type={(status ?? 'Info') as 'Info' | 'Success' | 'Warning' | 'Danger'}
        />
      ),
      variants: buildVariants(NOTIFICATION_TYPES, (type) => (
        <PdxNotification
          title={type}
          description="Latest changes"
          type={type}
        />
      )),
      scale: 0.6,
    },
    {
      id: 'empty',
      name: 'Empty',
      preview: <PdxEmpty title="No data" description="Nothing here" />,
      scale: 0.7,
    },
    {
      id: 'skeleton',
      name: 'Skeleton',
      preview: <PdxSkeleton variant="Text" lines={2} />,
      variants: buildVariants(SKELETON_VARIANTS, (variant) => (
        <PdxSkeleton variant={variant} lines={variant === 'Text' ? 2 : 1} />
      )),
      scale: 0.8,
    },
  ],
};
