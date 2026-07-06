const collapsedButtonBase =
  'inline-flex h-8 w-6 items-center justify-center border-0 bg-(--bg-canvas) p-0 text-(--text-muted) shadow-(--shadow-md) hover:text-(--text-primary)';

export const leftCollapsedButtonClassName = `${collapsedButtonBase} rounded-l-none rounded-r-full pr-0.5`;

export const rightCollapsedButtonClassName = `${collapsedButtonBase} rounded-l-full rounded-r-none pl-0.5`;

export const headerCollapseButtonClassName =
  'inline-flex items-center justify-center gap-1.5 rounded-full border-0 bg-transparent px-1.5 py-0.5 text-(--text-muted) hover:text-(--text-primary)';
