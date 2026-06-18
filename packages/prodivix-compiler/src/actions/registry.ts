export type BuiltInActionName = 'navigate' | 'executeGraph';

export const isBuiltInActionName = (
  action: string | undefined
): action is BuiltInActionName =>
  action === 'navigate' || action === 'executeGraph';
