import type { AnimationIdFactory } from '@prodivix/animation';

export const createBrowserAnimationIdFactory = (): AnimationIdFactory => {
  let fallbackSequence = 0;
  return (kind) => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return `${kind}-${crypto.randomUUID()}`;
    }
    fallbackSequence += 1;
    return `${kind}-${Date.now().toString(36)}-${fallbackSequence.toString(36)}`;
  };
};
