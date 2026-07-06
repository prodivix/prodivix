import type {
  QuickViewportPreset,
  RouteItem,
  ViewportPreset,
} from '@/editor/features/blueprint/editor/model/types';
import { Laptop, Monitor, Smartphone, Tablet, Watch } from 'lucide-react';

export const DEFAULT_ROUTES: RouteItem[] = [
  { id: 'home', path: '/' },
  { id: 'product', path: '/product/:id' },
  { id: 'search', path: '/search?q=:keyword' },
];

export const VIEWPORT_QUICK_PRESETS: QuickViewportPreset[] = [
  {
    id: 'quick-desktop',
    labelKey: 'viewport.quickPresets.desktop',
    width: '1440',
    height: '900',
  },
  {
    id: 'quick-hd',
    labelKey: 'viewport.quickPresets.hd',
    width: '1280',
    height: '720',
  },
  {
    id: 'quick-ipad',
    labelKey: 'viewport.quickPresets.ipad',
    width: '1024',
    height: '768',
  },
  {
    id: 'quick-iphone',
    labelKey: 'viewport.quickPresets.iphone',
    width: '390',
    height: '844',
  },
  {
    id: 'quick-se',
    labelKey: 'viewport.quickPresets.se',
    width: '375',
    height: '667',
  },
];

export const VIEWPORT_DEVICE_PRESETS: ViewportPreset[] = [
  {
    id: 'desktop-fhd',
    nameKey: 'devices.desktopFhd',
    kind: 'Desktop',
    kindKey: 'devices.kinds.desktop',
    width: '1920',
    height: '1080',
    icon: Monitor,
  },
  {
    id: 'desktop-hd',
    nameKey: 'devices.desktopHd',
    kind: 'Desktop',
    kindKey: 'devices.kinds.desktop',
    width: '1366',
    height: '768',
    icon: Monitor,
  },
  {
    id: 'macbook-air-13',
    nameKey: 'devices.macbookAir13',
    kind: 'Laptop',
    kindKey: 'devices.kinds.laptop',
    width: '1440',
    height: '900',
    icon: Laptop,
  },
  {
    id: 'macbook-pro-14',
    nameKey: 'devices.macbookPro14',
    kind: 'Laptop',
    kindKey: 'devices.kinds.laptop',
    width: '1512',
    height: '982',
    icon: Laptop,
  },
  {
    id: 'ipad-pro-11',
    nameKey: 'devices.ipadPro11',
    kind: 'Tablet',
    kindKey: 'devices.kinds.tablet',
    width: '834',
    height: '1194',
    icon: Tablet,
  },
  {
    id: 'ipad-mini',
    nameKey: 'devices.ipadMini',
    kind: 'Tablet',
    kindKey: 'devices.kinds.tablet',
    width: '768',
    height: '1024',
    icon: Tablet,
  },
  {
    id: 'pixel-8',
    nameKey: 'devices.pixel8',
    kind: 'Phone',
    kindKey: 'devices.kinds.phone',
    width: '412',
    height: '915',
    icon: Smartphone,
  },
  {
    id: 'iphone-15-pro',
    nameKey: 'devices.iphone15Pro',
    kind: 'Phone',
    kindKey: 'devices.kinds.phone',
    width: '393',
    height: '852',
    icon: Smartphone,
  },
  {
    id: 'iphone-13',
    nameKey: 'devices.iphone13',
    kind: 'Phone',
    kindKey: 'devices.kinds.phone',
    width: '390',
    height: '844',
    icon: Smartphone,
  },
  {
    id: 'iphone-se',
    nameKey: 'devices.iphoneSe',
    kind: 'Phone',
    kindKey: 'devices.kinds.phone',
    width: '375',
    height: '667',
    icon: Smartphone,
  },
  {
    id: 'watch-41',
    nameKey: 'devices.watch41',
    kind: 'Watch',
    kindKey: 'devices.kinds.watch',
    width: '198',
    height: '242',
    icon: Watch,
  },
];

export const VIEWPORT_ZOOM_RANGE = {
  min: 50,
  max: 160,
  step: 5,
  default: 100,
};

export const DEFAULT_PREVIEW_SCALE = 0.72;
export const COMPACT_PREVIEW_SCALE = 0.6;
