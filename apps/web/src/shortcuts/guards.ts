export const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest('[data-editor-native-history]')) return true;
  if (target.isContentEditable) return true;
  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
};

export const isEditableEvent = (event: Event): boolean =>
  event.composedPath().some((target) => isEditableTarget(target));

export const hasModifierKey = (event: KeyboardEvent) =>
  event.metaKey || event.ctrlKey || event.altKey || event.shiftKey;

export const isPrimaryShortcut = (event: KeyboardEvent) =>
  event.metaKey || event.ctrlKey;
