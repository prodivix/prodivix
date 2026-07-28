import type { StateCreator } from 'zustand';
import type {
  VerificationClosure,
  VerificationImpactSet,
  VerificationPlan,
} from '@prodivix/verification';
import { isUnsafeObjectKey } from '@prodivix/shared/safety';
import type { VerificationEvidenceProjection } from '@/editor/features/verification/verificationEvidenceResourceModel';
import type { EditorStore } from './editorStore.shape';

export type VerificationProjection = Readonly<{
  impactSet: VerificationImpactSet;
  plan?: VerificationPlan;
  closure?: VerificationClosure;
}>;

export interface VerificationSlice {
  verificationProjectionByWorkspaceId: Readonly<
    Record<string, VerificationProjection>
  >;
  verificationEvidenceProjectionByWorkspaceId: Readonly<
    Record<string, VerificationEvidenceProjection>
  >;
  setVerificationProjection: (
    workspaceId: string,
    projection: VerificationProjection
  ) => void;
  clearVerificationProjection: (workspaceId: string) => void;
  setVerificationEvidenceProjection: (
    workspaceId: string,
    projection: VerificationEvidenceProjection
  ) => void;
  clearVerificationEvidenceProjection: (workspaceId: string) => void;
}

export const createVerificationSlice: StateCreator<
  EditorStore,
  [],
  [],
  VerificationSlice
> = (set) => ({
  verificationProjectionByWorkspaceId: {},
  verificationEvidenceProjectionByWorkspaceId: {},
  setVerificationProjection: (workspaceId, projection) =>
    set((state) =>
      isUnsafeObjectKey(workspaceId) ||
      projection.impactSet.workspaceId !== workspaceId
        ? state
        : {
            verificationProjectionByWorkspaceId: {
              ...state.verificationProjectionByWorkspaceId,
              [workspaceId]: projection,
            },
          }
    ),
  clearVerificationProjection: (workspaceId) =>
    set((state) => {
      if (isUnsafeObjectKey(workspaceId)) return state;
      if (!state.verificationProjectionByWorkspaceId[workspaceId]) {
        return state;
      }
      const next = { ...state.verificationProjectionByWorkspaceId };
      delete next[workspaceId];
      return { verificationProjectionByWorkspaceId: next };
    }),
  setVerificationEvidenceProjection: (workspaceId, projection) =>
    set((state) =>
      isUnsafeObjectKey(workspaceId) || projection.workspaceId !== workspaceId
        ? state
        : {
            verificationEvidenceProjectionByWorkspaceId: {
              ...state.verificationEvidenceProjectionByWorkspaceId,
              [workspaceId]: projection,
            },
          }
    ),
  clearVerificationEvidenceProjection: (workspaceId) =>
    set((state) => {
      if (isUnsafeObjectKey(workspaceId)) return state;
      if (!state.verificationEvidenceProjectionByWorkspaceId[workspaceId]) {
        return state;
      }
      const next = {
        ...state.verificationEvidenceProjectionByWorkspaceId,
      };
      delete next[workspaceId];
      return { verificationEvidenceProjectionByWorkspaceId: next };
    }),
});
