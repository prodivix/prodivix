import type { BehaviorScenarioProgram } from '@prodivix/behavior';
import {
  digestVerificationValue,
  type VerificationPlanCell,
} from '@prodivix/verification';
import { describe, expect, it } from 'vitest';
import type { BrowserVerificationCellInput } from './browserAdapter.types';
import {
  collectBrowserBehaviorAssertionObservation,
  createBrowserBehaviorAssertionReceipt,
} from './browserBehaviorAssertionReceipt';
import type { BrowserRuntimeControlAttestation } from './browserRuntimeControlPort';
import type { BrowserToolSession } from './browserVerificationPort';
import type {
  PlaywrightBehaviorCheck,
  PlaywrightBehaviorResult,
} from './playwrightPrivatePayload';

const sha = (character: string): string => `sha256-${character.repeat(64)}`;

const cell = {
  id: 'cell.behavior-receipt',
  scenarioId: 'scenario.behavior-receipt',
} as VerificationPlanCell;
const profile = {
  cellId: cell.id,
  scenarioId: 'scenario.behavior-receipt',
  executableSnapshotDigest: sha('1'),
  scenarioProgramDigest: sha('2'),
  controlProfileDigest: sha('3'),
  fixtureSetDigests: Object.freeze([sha('7')]),
  targetLeaseBindingDigest: sha('4'),
} as unknown as BrowserVerificationCellInput;
const sourceTrace = Object.freeze({
  workspaceDocumentId: 'document.catalog',
  path: '/nodes/catalog',
});
const program = {
  scenarioId: profile.scenarioId,
  programDigest: profile.scenarioProgramDigest,
  executableSnapshotDigest: profile.executableSnapshotDigest,
  controlProfileDigest: profile.controlProfileDigest,
  fixtureSetDigests: profile.fixtureSetDigests,
  sourceTrace: Object.freeze([
    Object.freeze({
      instructionId: 'instruction.visible',
      source: sourceTrace,
    }),
  ]),
  targetManifest: Object.freeze([
    Object.freeze({
      source: sourceTrace,
    }),
  ]),
} as BehaviorScenarioProgram;
const runtimeControlApplication = Object.freeze({
  network: Object.freeze({
    fixtureBindingDigest: sha('5'),
    fixtureRequestCount: 1,
    fixtureDispatchCount: 1,
    fixtureResponseCount: 1,
    fixtureDispatchLedgerDigest: sha('8'),
    fixtureResponseDigest: sha('9'),
    fixtureResolutionDigest: sha('a'),
    fixtureConsumptionLedgerDigest: sha('b'),
  }),
});

const issueRuntimeControlAttestation = (
  application: BrowserRuntimeControlAttestation['application'] = runtimeControlApplication as BrowserRuntimeControlAttestation['application']
): BrowserRuntimeControlAttestation => {
  const identity = Object.freeze({
    phase: 'initial' as const,
    attemptId: 'attempt.behavior-receipt',
    executableSnapshotDigest: profile.executableSnapshotDigest,
    targetLeaseBindingDigest: profile.targetLeaseBindingDigest,
    fixtureBindingDigest: sha('5'),
    application,
    applicationDigest: digestVerificationValue(application),
  });
  return Object.freeze({
    ...identity,
    attestationDigest: digestVerificationValue(identity),
  }) as BrowserRuntimeControlAttestation;
};

const runtimeControlAttestation = issueRuntimeControlAttestation(
  Object.freeze({
    ...runtimeControlApplication,
    network: Object.freeze({
      ...runtimeControlApplication.network,
    }),
  }) as BrowserRuntimeControlAttestation['application']
);
const passingCheck = Object.freeze({
  checkId: 'check.visible',
  stepId: 'step.visible',
  targetId: 'target.catalog',
  assertionCode: 'visible',
  status: 'passed',
  blackBox: true,
  durationMs: 4,
  diagnosticCodes: Object.freeze([]),
}) satisfies PlaywrightBehaviorCheck;
const passingResult = Object.freeze({
  scenarioId: program.scenarioId,
  verdict: 'passed',
  exitCode: 0,
  tool: Object.freeze({
    name: 'playwright',
    version: '1.61.1',
    schemaDigest: sha('6'),
  }),
  checks: Object.freeze([passingCheck]),
}) satisfies PlaywrightBehaviorResult;

const createReceipt = (
  overrides: Partial<
    Parameters<typeof createBrowserBehaviorAssertionReceipt>[0]
  > = {}
) =>
  createBrowserBehaviorAssertionReceipt({
    cell,
    profile,
    program,
    runtimeControlAttestation,
    result: passingResult,
    ...overrides,
  });

const rawBehaviorReport = (
  check: PlaywrightBehaviorCheck = passingCheck
): unknown =>
  Object.freeze({
    format: 'prodivix.playwright-browser-report',
    version: 1,
    tool: passingResult.tool,
    scenarioId: passingResult.scenarioId,
    complete: true,
    exitCode: check.status === 'passed' ? 0 : 1,
    checks: Object.freeze([check]),
  });

describe('browser Behavior assertion receipt', () => {
  it('binds the live attempt and an actual non-empty black-box assertion set', () => {
    const receipt = createReceipt();
    expect(receipt).toMatchObject({
      attemptId: runtimeControlAttestation.attemptId,
      cellId: cell.id,
      scenarioId: program.scenarioId,
      executableSnapshotDigest: program.executableSnapshotDigest,
      scenarioProgramDigest: program.programDigest,
      controlProfileDigest: program.controlProfileDigest,
      fixtureSetDigests: [sha('7')],
      targetLeaseBindingDigest: profile.targetLeaseBindingDigest,
    });
    expect(receipt.runtimeFixtureBindingDigest).toMatch(
      /^sha256-[a-f0-9]{64}$/u
    );
    expect(receipt.runtimeFixtureBindingDigest).not.toBe(
      runtimeControlAttestation.fixtureBindingDigest
    );
    expect(receipt.blackBoxAssertionSetDigest).toMatch(
      /^sha256-[a-f0-9]{64}$/u
    );
  });

  it('binds failed checks and rejects empty or mixed non-black-box actual observations', () => {
    const emptyResult = Object.freeze({
      ...passingResult,
      checks: Object.freeze([]),
    });
    expect(() => createReceipt({ result: emptyResult })).toThrow(
      /non-empty internally consistent black-box result/u
    );

    const failedResult = Object.freeze({
      ...passingResult,
      verdict: 'failed' as const,
      exitCode: 1,
      checks: Object.freeze([
        Object.freeze({
          ...passingCheck,
          status: 'failed' as const,
          diagnosticCodes: Object.freeze(['VER-BROWSER-ASSERTION-FAILED']),
        }),
      ]),
    });
    expect(createReceipt({ result: failedResult })).toMatchObject({
      attemptId: runtimeControlAttestation.attemptId,
      cellId: cell.id,
      scenarioId: program.scenarioId,
    });
    expect(
      createReceipt({ result: failedResult }).blackBoxAssertionSetDigest
    ).not.toBe(
      createReceipt({ result: passingResult }).blackBoxAssertionSetDigest
    );

    const mixedResult = Object.freeze({
      ...passingResult,
      checks: Object.freeze([
        passingCheck,
        Object.freeze({
          ...passingCheck,
          checkId: 'check.private-state',
          assertionCode: 'private-state',
          blackBox: false,
        }),
      ]),
    });
    expect(() => createReceipt({ result: mixedResult })).toThrow(
      /non-empty internally consistent black-box result/u
    );
  });

  it('accepts only exact Program or target SourceTrace members', () => {
    const tracedResult = Object.freeze({
      ...passingResult,
      checks: Object.freeze([
        Object.freeze({
          ...passingCheck,
          sourceTraceDigest: digestVerificationValue(sourceTrace),
        }),
      ]),
    });
    expect(createReceipt({ result: tracedResult })).toMatchObject({
      scenarioId: program.scenarioId,
    });
    expect(() =>
      createReceipt({
        result: Object.freeze({
          ...passingResult,
          checks: Object.freeze([
            Object.freeze({
              ...passingCheck,
              sourceTraceDigest: sha('f'),
            }),
          ]),
        }),
      })
    ).toThrow(/non-empty internally consistent black-box result/u);
  });

  it('rejects an expected Program hash substitute and Fixture or lease drift', () => {
    expect(() =>
      createReceipt({
        program: Object.freeze({
          ...program,
          programDigest: sha('a'),
        }),
      })
    ).toThrow(/drifted from its live attempt/u);
    expect(() =>
      createReceipt({
        program: Object.freeze({
          ...program,
          fixtureSetDigests: Object.freeze([sha('b')]),
        }),
      })
    ).toThrow(/drifted from its live attempt/u);
    expect(() =>
      createReceipt({
        runtimeControlAttestation: Object.freeze({
          ...runtimeControlAttestation,
          targetLeaseBindingDigest: sha('c'),
        }),
      })
    ).toThrow(/drifted from its live attempt/u);
  });

  it.each([
    ['request count', { fixtureRequestCount: 0 }],
    ['dispatch count', { fixtureDispatchCount: 0 }],
    ['response count', { fixtureResponseCount: 0 }],
    ['dispatch ledger', { fixtureDispatchLedgerDigest: 'not-a-digest' }],
    ['response digest', { fixtureResponseDigest: null }],
    ['resolution digest', { fixtureResolutionDigest: null }],
    ['consumption ledger', { fixtureConsumptionLedgerDigest: 'not-a-digest' }],
  ])(
    'rejects causal runtime Fixture %s drift before report projection',
    (_label, networkDrift) => {
      expect(() =>
        createReceipt({
          runtimeControlAttestation: issueRuntimeControlAttestation(
            Object.freeze({
              ...runtimeControlAttestation.application,
              network: Object.freeze({
                ...runtimeControlAttestation.application.network,
                ...networkDrift,
              }),
            })
          ),
        })
      ).toThrow(/exact causal runtime Fixture request/u);
    }
  );

  it('accepts an exact fixtureless observation and rejects a hidden Fixture response', () => {
    const fixturelessProfile = Object.freeze({
      ...profile,
      fixtureSetDigests: Object.freeze([]),
    });
    const fixturelessProgram = Object.freeze({
      ...program,
      fixtureSetDigests: Object.freeze([]),
    });
    const fixturelessAttestation = issueRuntimeControlAttestation(
      Object.freeze({
        ...runtimeControlAttestation.application,
        network: Object.freeze({
          ...runtimeControlAttestation.application.network,
          fixtureRequestCount: 0,
          fixtureDispatchCount: 0,
          fixtureResponseCount: 0,
          fixtureDispatchLedgerDigest: digestVerificationValue([]),
          fixtureResponseDigest: null,
          fixtureResolutionDigest: null,
          fixtureConsumptionLedgerDigest: digestVerificationValue([]),
        }),
      })
    );
    const receipt = createReceipt({
      profile: fixturelessProfile,
      program: fixturelessProgram,
      runtimeControlAttestation: fixturelessAttestation,
    });
    expect(receipt.fixtureSetDigests).toEqual([]);

    expect(() =>
      createReceipt({
        profile: fixturelessProfile,
        program: fixturelessProgram,
        runtimeControlAttestation: issueRuntimeControlAttestation(
          Object.freeze({
            ...fixturelessAttestation.application,
            network: Object.freeze({
              ...fixturelessAttestation.application.network,
              fixtureResponseDigest: sha('c'),
            }),
          })
        ),
      })
    ).toThrow(/exact fixtureless observation/u);
  });

  it('rejects mutation of an issued request, dispatch, or response ledger before receipt projection', () => {
    for (const networkDrift of [
      { fixtureRequestCount: 0 },
      { fixtureDispatchLedgerDigest: sha('c') },
      { fixtureResponseDigest: sha('d') },
    ]) {
      expect(() =>
        createReceipt({
          runtimeControlAttestation: Object.freeze({
            ...runtimeControlAttestation,
            application: Object.freeze({
              ...runtimeControlAttestation.application,
              network: Object.freeze({
                ...runtimeControlAttestation.application.network,
                ...networkDrift,
              }),
            }),
          }),
        })
      ).toThrow(/intact authority-issued runtime control attestation/u);
    }
  });

  it('binds a failed live DOM observation without substituting Program expectations', async () => {
    const failedCheck = Object.freeze({
      ...passingCheck,
      status: 'failed' as const,
      diagnosticCodes: Object.freeze(['VER-BROWSER-ASSERTION-FAILED']),
    });
    const session = {
      runtimeControlAttestation,
      executeBehavior: async () => rawBehaviorReport(failedCheck),
    } as unknown as BrowserToolSession;
    const observation = await collectBrowserBehaviorAssertionObservation({
      cell,
      profile,
      program,
      session,
    });
    expect(observation.result).toMatchObject({
      verdict: 'failed',
      exitCode: 1,
    });
    expect(observation.receipt.blackBoxAssertionSetDigest).toMatch(
      /^sha256-[a-f0-9]{64}$/u
    );
  });

  it('derives collection from the decoded live session payload', async () => {
    const session = {
      runtimeControlAttestation,
      executeBehavior: async () => rawBehaviorReport(),
    } as unknown as BrowserToolSession;
    await expect(
      collectBrowserBehaviorAssertionObservation({
        cell,
        profile,
        program,
        session,
      })
    ).resolves.toMatchObject({
      result: {
        scenarioId: program.scenarioId,
        verdict: 'passed',
        checks: [{ checkId: passingCheck.checkId, blackBox: true }],
      },
      receipt: {
        attemptId: runtimeControlAttestation.attemptId,
        scenarioProgramDigest: program.programDigest,
      },
    });
  });
});
