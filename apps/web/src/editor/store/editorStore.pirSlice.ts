import type { StateCreator } from 'zustand';
import type { PIRDocument } from '@/core/types/engine.types';
import { createDefaultPirDoc } from '@/pir/resolvePirDocument';
import type { EditorStore } from './editorStore.shape';

export interface PirSlice {
  pirDoc: PIRDocument;
  pirDocRevision: number;
  setPirDoc: (doc: PIRDocument) => void;
  updatePirDoc: (updater: (doc: PIRDocument) => PIRDocument) => void;
}

export const createPirSlice: StateCreator<EditorStore, [], [], PirSlice> = (
  set
) => ({
  pirDoc: createDefaultPirDoc(),
  pirDocRevision: 0,
  setPirDoc: (doc) =>
    set((state) => {
      if (doc === state.pirDoc) return state;
      const nextRevision = state.pirDocRevision + 1;
      if (!state.activeDocumentId) {
        return { pirDoc: doc, pirDocRevision: nextRevision };
      }
      const activeDocument =
        state.workspaceDocumentsById[state.activeDocumentId];
      if (!activeDocument) {
        return { pirDoc: doc, pirDocRevision: nextRevision };
      }
      return {
        pirDoc: doc,
        pirDocRevision: nextRevision,
        workspaceDocumentsById: {
          ...state.workspaceDocumentsById,
          [state.activeDocumentId]: {
            ...activeDocument,
            content: doc,
          },
        },
      };
    }),
  updatePirDoc: (updater) =>
    set((state) => {
      const nextPirDoc = updater(state.pirDoc);
      if (nextPirDoc === state.pirDoc) {
        return state;
      }
      if (!state.activeDocumentId) {
        return {
          pirDoc: nextPirDoc,
          pirDocRevision: state.pirDocRevision + 1,
        };
      }
      const activeDocument =
        state.workspaceDocumentsById[state.activeDocumentId];
      if (!activeDocument) {
        return {
          pirDoc: nextPirDoc,
          pirDocRevision: state.pirDocRevision + 1,
        };
      }
      return {
        pirDoc: nextPirDoc,
        pirDocRevision: state.pirDocRevision + 1,
        workspaceDocumentsById: {
          ...state.workspaceDocumentsById,
          [state.activeDocumentId]: {
            ...activeDocument,
            content: nextPirDoc,
          },
        },
      };
    }),
});
