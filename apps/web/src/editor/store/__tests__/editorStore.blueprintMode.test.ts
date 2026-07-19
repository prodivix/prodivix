import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_BLUEPRINT_STATE, useEditorStore } from '../useEditorStore';

describe('Blueprint mode preferences', () => {
  beforeEach(() => {
    useEditorStore.setState({
      blueprintStateByProject: {},
      runtimeStateByProject: {},
    });
  });

  it('preserves authoring selection and viewport preferences across all modes', () => {
    const projectId = 'mode-project';
    useEditorStore.getState().setBlueprintState(projectId, {
      zoom: 135,
      pan: { x: 24, y: 48 },
      selectedId: 'node-selected',
      routePreviewPath: '/catalog',
      canvasMode: 'design',
    });

    useEditorStore
      .getState()
      .setBlueprintState(projectId, { canvasMode: 'interactive' });
    useEditorStore
      .getState()
      .setBlueprintState(projectId, { canvasMode: 'run' });

    expect(
      useEditorStore.getState().blueprintStateByProject[projectId]
    ).toEqual({
      ...DEFAULT_BLUEPRINT_STATE,
      zoom: 135,
      pan: { x: 24, y: 48 },
      selectedId: 'node-selected',
      routePreviewPath: '/catalog',
      canvasMode: 'run',
    });
  });

  it('keeps disposable runtime state outside the authoring preference record', () => {
    const projectId = 'runtime-project';
    useEditorStore
      .getState()
      .setBlueprintState(projectId, { canvasMode: 'run', zoom: 110 });
    useEditorStore.getState().patchRuntimeState(projectId, {
      'collection:catalog': { status: 'success', value: [1, 2] },
    });

    useEditorStore.getState().resetRuntimeState(projectId);

    expect(
      useEditorStore.getState().runtimeStateByProject[projectId]
    ).toBeUndefined();
    expect(
      useEditorStore.getState().blueprintStateByProject[projectId]
    ).toMatchObject({ canvasMode: 'run', zoom: 110 });
  });
});
