import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  beginCodeAuthoringSessionSave,
  completeCodeAuthoringSessionSave,
  createCodeAuthoringRequest,
  createCodeAuthoringSession,
  getActiveCodeAuthoringDraft,
  isCodeAuthoringDraftDirty,
  isCodeAuthoringDraftStale,
  reconcileCodeAuthoringSessionArtifact,
  updateCodeAuthoringSessionDraft,
} from './codeAuthoring';

const createRequest = () =>
  createCodeAuthoringRequest({
    requestId: 'request-1',
    workspaceId: 'workspace-1',
    presentation: 'workspace',
    origin: { surface: 'code-workspace' },
  });

describe('CodeAuthoringRequest and CodeAuthoringSession properties', () => {
  it.each(['constructor', 'toString', '__proto__'])(
    'edits an opaque artifact id %s without inheriting a draft',
    (artifactId) => {
      let session = createCodeAuthoringSession(createRequest());
      session = reconcileCodeAuthoringSessionArtifact(session, {
        artifactId,
        revision: '1',
        source: 'canonical',
      });
      session = updateCodeAuthoringSessionDraft(session, 'edited');
      expect(getActiveCodeAuthoringDraft(session)?.source).toBe('edited');
      session = completeCodeAuthoringSessionSave(session, {
        artifactId,
        revision: '2',
        source: 'edited',
      });
      expect(getActiveCodeAuthoringDraft(session)?.baseline.source).toBe(
        'edited'
      );
    }
  );
  it('normalizes capabilities and rejects a cross-artifact SourceSpan', () => {
    const request = createCodeAuthoringRequest({
      requestId: 'request-1',
      workspaceId: 'workspace-1',
      presentation: 'compact',
      artifactId: 'artifact-1',
      origin: { surface: 'inspector' },
      capabilityIds: [
        'save-source',
        'edit-source',
        'save-source',
        'semantic-navigation',
      ],
    });
    expect(request.capabilityIds).toEqual([
      'edit-source',
      'save-source',
      'semantic-navigation',
    ]);
    expect(() =>
      createCodeAuthoringRequest({
        requestId: 'request-2',
        workspaceId: 'workspace-1',
        presentation: 'compact',
        artifactId: 'artifact-1',
        sourceSpan: {
          artifactId: 'artifact-2',
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 2,
        },
        origin: { surface: 'issues-panel' },
      })
    ).toThrow(/requested artifact/);
  });

  it('preserves every local draft while switching artifacts', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (firstDraft, secondDraft) => {
        let session = createCodeAuthoringSession(createRequest());
        session = reconcileCodeAuthoringSessionArtifact(session, {
          artifactId: 'first',
          revision: '1',
          source: 'first canonical',
        });
        session = updateCodeAuthoringSessionDraft(session, firstDraft);
        session = reconcileCodeAuthoringSessionArtifact(session, {
          artifactId: 'second',
          revision: '1',
          source: 'second canonical',
        });
        session = updateCodeAuthoringSessionDraft(session, secondDraft);
        session = reconcileCodeAuthoringSessionArtifact(session, {
          artifactId: 'first',
          revision: '1',
          source: 'first canonical',
        });

        expect(getActiveCodeAuthoringDraft(session)?.source).toBe(firstDraft);
        expect(session.draftsByArtifactId.second?.source).toBe(secondDraft);
      })
    );
  });

  it('keeps concurrent canonical changes explicit and preserves edits made during save', () => {
    let session = createCodeAuthoringSession(createRequest());
    session = reconcileCodeAuthoringSessionArtifact(session, {
      artifactId: 'artifact-1',
      revision: '1',
      source: 'canonical',
    });
    session = updateCodeAuthoringSessionDraft(session, 'first draft');
    session = reconcileCodeAuthoringSessionArtifact(session, {
      artifactId: 'artifact-1',
      revision: '2',
      source: 'remote change',
    });
    expect(
      isCodeAuthoringDraftStale(getActiveCodeAuthoringDraft(session)!)
    ).toBe(true);

    session = reconcileCodeAuthoringSessionArtifact(session, {
      artifactId: 'artifact-1',
      revision: '3',
      source: 'first draft',
    });
    session = beginCodeAuthoringSessionSave(session);
    session = updateCodeAuthoringSessionDraft(session, 'second draft');
    session = completeCodeAuthoringSessionSave(session, {
      artifactId: 'artifact-1',
      revision: '3',
      source: 'first draft',
    });

    const active = getActiveCodeAuthoringDraft(session)!;
    expect(active.source).toBe('second draft');
    expect(isCodeAuthoringDraftDirty(active)).toBe(true);
    expect(isCodeAuthoringDraftStale(active)).toBe(false);
  });
});
