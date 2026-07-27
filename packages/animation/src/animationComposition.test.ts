import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  animationWireMigrationIsDeterministic,
  compileAnimationComposition,
  decodeAnimationDefinition,
  encodeAnimationDefinition,
  executeAnimationCompositionProgram,
  validateAnimationDefinition,
  type AnimationCompositionProgram,
  type AnimationDefinition,
} from './index';

const migrationFixture = JSON.parse(
  readFileSync(
    new URL(
      '../../../specs/animation/fixtures/animation-v1-to-v2.json',
      import.meta.url
    ),
    'utf8'
  )
) as Readonly<{ source: unknown; expected: unknown }>;

const createDefinition = (): AnimationDefinition => ({
  target: { kind: 'pir-document', documentId: 'page-home' },
  timelines: [
    {
      id: 'fade',
      name: 'Fade',
      durationMs: 100,
      motionIntent: 'decorative',
      reducedMotion: { kind: 'final-state' },
      markers: [
        {
          id: 'content-ready',
          atMs: 100,
          kind: 'checkpoint',
          requiredInReducedMotion: true,
        },
      ],
      bindings: [],
    },
    {
      id: 'slide',
      name: 'Slide',
      durationMs: 60,
      motionIntent: 'spatial',
      reducedMotion: { kind: 'final-state' },
      markers: [
        {
          id: 'visual-midpoint',
          atMs: 30,
          kind: 'checkpoint',
          requiredInReducedMotion: false,
        },
      ],
      bindings: [],
    },
  ],
  compositions: [
    {
      id: 'page-enter',
      name: 'Page enter',
      motionIntent: 'spatial',
      root: {
        id: 'root',
        kind: 'sequence',
        children: [
          { id: 'fade-ref', kind: 'timeline-ref', timelineId: 'fade' },
          {
            id: 'parallel',
            kind: 'parallel',
            join: 'all',
            cancelLosers: false,
            children: [
              {
                id: 'handoff',
                kind: 'marker',
                markerId: 'route-handoff',
                markerKind: 'handoff',
                requiredInReducedMotion: true,
              },
              {
                id: 'stagger',
                kind: 'stagger',
                intervalMs: 10,
                children: [
                  {
                    id: 'slide-ref',
                    kind: 'timeline-ref',
                    timelineId: 'slide',
                  },
                  { id: 'hold', kind: 'hold', durationMs: 20 },
                ],
              },
            ],
          },
          {
            id: 'settle',
            kind: 'settle',
            markerId: 'route-handoff',
          },
        ],
      },
    },
  ],
  entryCompositionId: 'page-enter',
});

describe('Animation composition compiler and runtime', () => {
  it('compiles stable full/reduced programs with equivalent required markers', () => {
    const definition = createDefinition();
    const first = compileAnimationComposition({ definition });
    const second = compileAnimationComposition({
      definition: {
        ...definition,
        'x-animationEditor': {
          version: 1,
          cursorMs: 73,
          zoom: 1.5,
        },
      },
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(first.bundle.full.requiredMarkerIds).toEqual([
      'content-ready',
      'route-handoff',
    ]);
    expect(first.bundle.reduced.requiredMarkerIds).toEqual(
      first.bundle.full.requiredMarkerIds
    );
    expect(first.bundle.full.durationMs).toBe(160);
    expect(first.bundle.reduced.durationMs).toBe(30);
    expect(first.bundle.full.programDigest).toBe(
      second.bundle.full.programDigest
    );
    expect(first.bundle.reduced.programDigest).toBe(
      second.bundle.reduced.programDigest
    );
    const changed = compileAnimationComposition({
      definition: {
        ...definition,
        timelines: definition.timelines.map((timeline) =>
          timeline.id === 'fade'
            ? { ...timeline, name: 'Changed semantic timeline' }
            : timeline
        ),
      },
    });
    expect(changed.ok).toBe(true);
    if (changed.ok) {
      expect(changed.bundle.full.programDigest).not.toBe(
        first.bundle.full.programDigest
      );
    }
  });

  it('executes exact program order against an explicit logical clock', async () => {
    const compiled = compileAnimationComposition({
      definition: createDefinition(),
    });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const advanced: number[] = [];
    const effects: string[] = [];
    const observations: string[] = [];
    const result = await executeAnimationCompositionProgram({
      program: compiled.bundle.reduced,
      instanceId: 'instance-1',
      generation: 'route-generation-7',
      animationDocumentId: 'animation-document',
      targetDocumentId: 'page-home',
      signal: { aborted: false },
      runtime: {
        clock: {
          advanceTo(logicalTimeMs) {
            advanced.push(logicalTimeMs);
          },
        },
        effects: {
          apply(event) {
            effects.push(`${event.sequence}:${event.kind}:${event.atMs}`);
          },
        },
        observations: {
          publish(observation) {
            observations.push(
              `${observation.sequence}:${observation.kind}:${observation.logicalTimeMs}`
            );
          },
        },
      },
    });

    expect(result.status).toBe('completed');
    expect(result.logicalTimeMs).toBe(30);
    expect(advanced).toEqual([...advanced].sort((left, right) => left - right));
    expect(effects).toHaveLength(compiled.bundle.reduced.events.length);
    expect(
      result.observations
        .filter(({ kind }) => kind === 'marker-reached')
        .map(({ markerId }) => markerId)
    ).toEqual(['content-ready', 'route-handoff']);
    expect(observations.at(0)).toBe('0:composition-started:0');
    expect(observations.at(-1)).toContain('composition-completed:30');
  });

  it('fails closed on cancellation and sanitizes runtime failures', async () => {
    const compiled = compileAnimationComposition({
      definition: createDefinition(),
    });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const publish = vi.fn();
    const result = await executeAnimationCompositionProgram({
      program: compiled.bundle.full,
      instanceId: 'instance-1',
      generation: 'generation-1',
      animationDocumentId: 'animation-document',
      targetDocumentId: 'page-home',
      signal: { aborted: false },
      runtime: {
        clock: { advanceTo: () => undefined },
        effects: {
          apply() {
            throw new Error('effect\nfailed\twith details');
          },
        },
        observations: { publish },
      },
    });
    expect(result).toMatchObject({
      status: 'failed',
      reason: 'effect failed with details',
    });
    expect(publish).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'composition-failed' })
    );
  });

  it('rejects unbounded timelines, late settle markers, and budget overflow', () => {
    const unbounded = createDefinition();
    unbounded.timelines[0] = {
      ...unbounded.timelines[0]!,
      iterations: 'infinite',
    };
    expect(compileAnimationComposition({ definition: unbounded })).toEqual(
      expect.objectContaining({
        ok: false,
        issues: expect.arrayContaining([
          expect.objectContaining({
            code: 'ANIMATION_COMPOSITION_UNBOUNDED',
          }),
        ]),
      })
    );

    const lateMarker = createDefinition();
    lateMarker.compositions[0] = {
      ...lateMarker.compositions[0]!,
      root: {
        id: 'late-root',
        kind: 'sequence',
        children: [
          {
            id: 'early-settle',
            kind: 'settle',
            markerId: 'late-marker',
          },
          {
            id: 'late-marker-node',
            kind: 'marker',
            markerId: 'late-marker',
            markerKind: 'settle',
            requiredInReducedMotion: true,
          },
        ],
      },
    };
    expect(compileAnimationComposition({ definition: lateMarker })).toEqual(
      expect.objectContaining({
        ok: false,
        issues: expect.arrayContaining([
          expect.objectContaining({
            code: 'ANIMATION_COMPOSITION_MARKER_INVALID',
          }),
        ]),
      })
    );

    expect(
      compileAnimationComposition({
        definition: createDefinition(),
        budgets: { maximumDurationMs: 50 },
      })
    ).toEqual(
      expect.objectContaining({
        ok: false,
        issues: expect.arrayContaining([
          expect.objectContaining({
            code: 'ANIMATION_COMPOSITION_BUDGET_EXCEEDED',
          }),
        ]),
      })
    );
  });

  it('rejects a reduced root that drops required semantic markers', () => {
    const definition = createDefinition();
    definition.compositions[0] = {
      ...definition.compositions[0]!,
      reducedRoot: {
        id: 'reduced-only',
        kind: 'hold',
        durationMs: 10,
      },
    };
    expect(compileAnimationComposition({ definition })).toMatchObject({
      ok: false,
      issues: [{ code: 'ANIMATION_COMPOSITION_REDUCED_SEMANTICS_MISMATCH' }],
    });
  });
});

describe('Animation current/wire boundary', () => {
  const legacy = migrationFixture.source;

  it('deterministically migrates v1 and writes only wire v2', () => {
    const decoded = decodeAnimationDefinition(legacy);
    expect(decoded).toMatchObject({
      ok: true,
      sourceWireVersion: 1,
      appliedMigrations: [{ fromVersion: 1, toVersion: 2 }],
      value: {
        timelines: [
          {
            motionIntent: 'decorative',
            reducedMotion: { kind: 'final-state' },
            markers: [],
          },
        ],
        compositions: [],
      },
    });
    expect(animationWireMigrationIsDeterministic(legacy)).toBe(true);
    if (!decoded.ok) return;
    expect(encodeAnimationDefinition(decoded.value)).toEqual(
      migrationFixture.expected
    );
    expect(encodeAnimationDefinition(decoded.value)).toMatchObject({
      version: 2,
      compositions: [],
    });
    expect(validateAnimationDefinition(decoded.value).valid).toBe(true);
  });

  it('keeps wire versions out of the current domain and rejects drift', () => {
    expect(
      validateAnimationDefinition({
        ...createDefinition(),
        version: 2,
      })
    ).toMatchObject({
      valid: false,
      issues: [{ path: '/version' }],
    });
    expect(
      decodeAnimationDefinition({
        ...encodeAnimationDefinition(createDefinition()),
        unknown: true,
      })
    ).toMatchObject({ ok: false });
  });

  it('keeps program types JSON-only and immutable by convention', () => {
    const compiled = compileAnimationComposition({
      definition: createDefinition(),
    });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const program: AnimationCompositionProgram = compiled.bundle.full;
    expect(JSON.parse(JSON.stringify(program))).toEqual(program);
    expect(program.programDigest).toMatch(/^sha256-[a-f0-9]{64}$/u);
  });
});
