import { create } from 'zustand';
import type { CodeSlotKind } from '@prodivix/authoring';

export type CodeAuthoringOverlayPresentation = 'compact' | 'maximized';

export type CodeAuthoringOverlayRequestInput = Readonly<{
  workspaceId: string;
  artifactId: string;
  presentation: CodeAuthoringOverlayPresentation;
  slotId?: string;
}>;

export type CodeAuthoringOverlayRequest = CodeAuthoringOverlayRequestInput &
  Readonly<{ id: number }>;

type CodeAuthoringOverlayStore = {
  request: CodeAuthoringOverlayRequest | null;
  open: (request: CodeAuthoringOverlayRequestInput) => void;
  close: (requestId?: number) => void;
};

let nextRequestId = 0;

export const resolveCodeAuthoringPresentation = (
  slotKind: CodeSlotKind
): CodeAuthoringOverlayPresentation => {
  switch (slotKind) {
    case 'event-handler':
    case 'validator':
    case 'animation-function':
      return 'compact';
    default:
      return 'maximized';
  }
};

export const useCodeAuthoringOverlayStore = create<CodeAuthoringOverlayStore>()(
  (set) => ({
    request: null,
    open: (request) => {
      nextRequestId += 1;
      set({ request: { ...request, id: nextRequestId } });
    },
    close: (requestId) =>
      set((state) => {
        if (!state.request || (requestId && state.request.id !== requestId)) {
          return state;
        }
        return { request: null };
      }),
  })
);

export const openCodeAuthoringOverlay = (
  request: CodeAuthoringOverlayRequestInput
) => useCodeAuthoringOverlayStore.getState().open(request);

export const closeCodeAuthoringOverlay = (requestId?: number) =>
  useCodeAuthoringOverlayStore.getState().close(requestId);
