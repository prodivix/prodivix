import { describe, expect, it } from 'vitest';
import { validateWorkspaceSnapshot } from '@prodivix/workspace';
import {
  createGoldenG3BehaviorCompositionProgram,
  createGoldenG3CompositionReactSnapshot,
  createGoldenG3CompositionVueSnapshot,
  createGoldenG3NodeGraphProgram,
  GOLDEN_G3_COMPOSITION_IDS,
  GOLDEN_G3_COMPOSITION_WORKSPACE,
  runGoldenG3AnimationComposition,
  runGoldenG3BehaviorCompositionSurface,
  runGoldenG3OptimisticConflictJourney,
} from './goldenG3BehaviorCompositionFixture';

const fileText = (contents: string | Uint8Array): string =>
  typeof contents === 'string' ? contents : '';

describe('Golden G3 cross-domain Behavior composition', () => {
  it('keeps Scenario, NodeGraph, and Animation in one valid canonical Workspace', () => {
    expect(validateWorkspaceSnapshot(GOLDEN_G3_COMPOSITION_WORKSPACE)).toEqual(
      expect.objectContaining({ valid: true, issues: [] })
    );
    expect(
      GOLDEN_G3_COMPOSITION_WORKSPACE.docsById[GOLDEN_G3_COMPOSITION_IDS.graph]
        ?.type
    ).toBe('pir-graph');
    expect(
      GOLDEN_G3_COMPOSITION_WORKSPACE.docsById[
        GOLDEN_G3_COMPOSITION_IDS.animation
      ]?.type
    ).toBe('pir-animation');
  });

  it('compiles a deterministic cross-domain DAG with complete SourceTrace', () => {
    const first = createGoldenG3BehaviorCompositionProgram();
    const second = createGoldenG3BehaviorCompositionProgram();
    expect(second).toEqual(first);
    expect(first.requiredCapabilities).toEqual(
      expect.arrayContaining([
        'route.navigate',
        'route.location',
        'nodegraph.invoke',
        'nodegraph.nodegraph-output',
        'animation.play',
        'animation.composition-result',
        'animation.composition-marker',
      ])
    );
    const graph = first.instructions.find(
      ({ stepId }) => stepId === 'derive-catalog-state'
    );
    const animation = first.instructions.find(
      ({ stepId }) => stepId === 'play-detail-transition'
    );
    const barrier = first.instructions.find(
      ({ stepId }) => stepId === 'composition-joined'
    );
    expect(graph?.dependencyInstructionIds).toEqual(
      animation?.dependencyInstructionIds
    );
    expect(barrier?.dependencyInstructionIds).toEqual([
      graph?.id,
      animation?.id,
    ]);
    expect(first.sourceTrace.map(({ instructionId }) => instructionId)).toEqual(
      first.instructions.map(({ id }) => id)
    );
    const serialized = JSON.stringify(first).toLowerCase();
    ['queryselector', '"selector"', '"xpath"', '"domhandle"'].forEach(
      (canary) => expect(serialized).not.toContain(canary)
    );
  });

  it('compiles the invoked graph through the strict typed planner', () => {
    const first = createGoldenG3NodeGraphProgram();
    const second = createGoldenG3NodeGraphProgram();
    expect(second).toEqual(first);
    expect(first.executionWaves).toEqual([
      ['input'],
      ['derived-state'],
      ['complete'],
    ]);
    expect(first.programDigest).toMatch(/^sha256-[a-f0-9]{64}$/u);
    expect(first.sourceTrace).toContainEqual({
      kind: 'port',
      id: 'derived-state:in.control.prev',
      sourcePath: '/nodesById/derived-state/portsById/in.control.prev',
    });
  });

  it('preserves required Animation markers in full and reduced motion', async () => {
    const [full, reduced] = await Promise.all([
      runGoldenG3AnimationComposition('full'),
      runGoldenG3AnimationComposition('reduced'),
    ]);
    expect(full.status).toBe('completed');
    expect(reduced.status).toBe('completed');
    const requiredMarkers = (result: typeof full) =>
      result.observations
        .filter(({ kind }) => kind === 'marker-reached')
        .map(({ markerId }) => markerId);
    expect(requiredMarkers(full)).toEqual([GOLDEN_G3_COMPOSITION_IDS.marker]);
    expect(requiredMarkers(reduced)).toEqual(requiredMarkers(full));
    expect(reduced.logicalTimeMs).toBeLessThan(full.logicalTimeMs);
  });

  it('fences an optimistic mutation conflict, rolls back, and commits a typed retry', async () => {
    const result = await runGoldenG3OptimisticConflictJourney();
    expect(result).toMatchObject({
      staleRollback: 'rollback-skipped',
      rollback: 'rolled-back',
      retry: 'committed',
      conflictCode: 'DATA_OPTIMISTIC_CONFLICT',
      finalSnapshot: {
        value: [
          { id: 'p1', name: 'Alpha' },
          { id: 'p2', name: 'Beta' },
          { id: 'p3', name: 'Gamma confirmed' },
        ],
      },
    });
    expect(result.finalSnapshot.owner).toBeUndefined();
  });

  it('invokes concrete Preview, Export, and CI adapters for both motion modes', async () => {
    for (const motionMode of ['full', 'reduced'] as const) {
      const [preview, exported, ci] = await Promise.all([
        runGoldenG3BehaviorCompositionSurface('preview', motionMode),
        runGoldenG3BehaviorCompositionSurface('export', motionMode),
        runGoldenG3BehaviorCompositionSurface('ci', motionMode),
      ]);
      expect(preview.result).toEqual(exported.result);
      expect(exported.result).toEqual(ci.result);
      expect(ci.result).toMatchObject({
        status: 'completed',
        outputsByStepId: {
          'derive-catalog-state': {
            itemId: 'p2',
            optimisticCount: 2,
          },
          'play-detail-transition': {
            status: 'completed',
            compositionId: GOLDEN_G3_COMPOSITION_IDS.composition,
            motionMode,
          },
          'derived-state-observed': {
            itemId: 'p2',
            optimisticCount: 2,
          },
          'animation-composition-result': {
            status: 'completed',
          },
          'animation-required-marker': {
            markerId: GOLDEN_G3_COMPOSITION_IDS.marker,
            motionMode,
          },
          'route-location-stable': '/',
        },
      });
      for (const execution of [preview, exported, ci]) {
        expect(execution.evidence.route.adapterId).toContain(execution.surface);
        expect(execution.evidence.nodeGraph.adapterId).toContain(
          execution.surface
        );
        expect(execution.evidence.animation.adapterId).toContain(
          execution.surface
        );
        expect(execution.evidence.nodeGraph.artifactDigest).toMatch(
          /^sha256-[a-f0-9]{64}$/u
        );
        expect(execution.evidence.animation.artifactDigest).toMatch(
          /^sha256-[a-f0-9]{64}$/u
        );
        expect(
          execution.evidence.animation.result.observations
            .filter(({ kind }) => kind === 'marker-reached')
            .map(({ markerId }) => markerId)
        ).toEqual([GOLDEN_G3_COMPOSITION_IDS.marker]);
        expect(
          execution.evidence.route.result.observations.map(({ kind }) => kind)
        ).toEqual(
          expect.arrayContaining([
            'guard-completed',
            'loader-completed',
            'handoff-reached',
            'outlet-committed',
            'navigation-completed',
          ])
        );
      }
    }
  });

  it('projects the same standalone NodeGraph and Animation owners to React and Vue targets', () => {
    const react = createGoldenG3CompositionReactSnapshot();
    const vue = createGoldenG3CompositionVueSnapshot();
    expect(react.target.framework).toBe('react');
    expect(vue.target.framework).toBe('vue');
    for (const snapshot of [react, vue]) {
      const source = snapshot.files
        .map(({ contents }) => fileText(contents))
        .join('\n');
      expect(source).toContain(GOLDEN_G3_COMPOSITION_IDS.graph);
      expect(source).toContain(GOLDEN_G3_COMPOSITION_IDS.animation);
      expect(source).toContain('createNodeGraphExecutor');
      expect(source).toContain('createAnimationHandle');
    }
  });
});
