export const DRAG_THRESHOLD = 3;
const WHEEL_LINE_HEIGHT = 16;
const WHEEL_PAGE_SIZE = 800;

export const getTimestamp = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

export const parseDimension = (
  value: string,
  fallback: number,
  min: number
) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(min, parsed);
};

export const isInteractiveTarget = (target: HTMLElement | null) => {
  if (!target) return false;
  return Boolean(
    target.closest(
      'button, input, textarea, select, option, a, label, [contenteditable="true"]'
    )
  );
};

export const isNodeTarget = (target: HTMLElement | null) => {
  if (!target) return false;
  return Boolean(target.closest('[data-pir-id], [data-pir-node-id]'));
};

export const normalizeWheelDelta = (event: WheelEvent) => {
  if (event.deltaMode === 1) {
    return {
      x: event.deltaX * WHEEL_LINE_HEIGHT,
      y: event.deltaY * WHEEL_LINE_HEIGHT,
    };
  }
  if (event.deltaMode === 2) {
    const pageWidth =
      typeof window === 'undefined' ? WHEEL_PAGE_SIZE : window.innerWidth;
    const pageHeight =
      typeof window === 'undefined' ? WHEEL_PAGE_SIZE : window.innerHeight;
    return { x: event.deltaX * pageWidth, y: event.deltaY * pageHeight };
  }
  return { x: event.deltaX, y: event.deltaY };
};

export const canConsumeScroll = (
  element: HTMLElement,
  deltaX: number,
  deltaY: number
) => {
  const maxScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth);
  const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
  if (maxScrollLeft === 0 && maxScrollTop === 0) return false;
  const canScrollLeft = deltaX < 0 && element.scrollLeft > 0;
  const canScrollRight = deltaX > 0 && element.scrollLeft < maxScrollLeft;
  const canScrollUp = deltaY < 0 && element.scrollTop > 0;
  const canScrollDown = deltaY > 0 && element.scrollTop < maxScrollTop;
  return canScrollLeft || canScrollRight || canScrollUp || canScrollDown;
};
