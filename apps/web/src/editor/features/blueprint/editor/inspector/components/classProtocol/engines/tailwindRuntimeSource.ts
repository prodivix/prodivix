import runtimeSnapshot from '@/editor/features/blueprint/editor/inspector/components/classProtocol/tailwind.runtime.snapshot.json';

type RuntimeSnapshot = {
  classes?: string[];
  variants?: string[];
};

const snapshot = runtimeSnapshot as RuntimeSnapshot;

const dedupe = (items: string[]) => [...new Set(items.filter(Boolean))];

export const TAILWIND_RUNTIME_CLASSES = dedupe(snapshot.classes ?? []);
export const TAILWIND_RUNTIME_VARIANTS = dedupe(snapshot.variants ?? []);
