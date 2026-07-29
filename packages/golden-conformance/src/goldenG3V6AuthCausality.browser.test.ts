import { createFirstPartyBrowserVerificationAdapterFactory } from '@prodivix/verification-browser';
import { describe, expect, it } from 'vitest';
import { createGoldenG3V6ArtifactTransport } from './goldenG3V6ArtifactTransport';
import {
  type GoldenG3V6BrowserAttempt,
  executeGoldenG3V6BrowserAttempt,
} from './goldenG3V6BrowserAttemptExecution';
import {
  createGoldenG3V6SecurityAuthorityRegistry,
  createGoldenG3V6TargetLeaseRegistry,
} from './goldenG3V6BrowserMatrixPorts';
import { createGoldenG3V6RuntimeControlRegistryImplementation } from './goldenG3V6RuntimeControlRegistry';
import {
  prepareGoldenG3V6AuthCausalityTarget,
  type GoldenG3V6AuthCausalityPreparedAttempt,
} from './goldenG3V6AuthCausality.testSupport';

const executePreparedAttempt = async (
  prepared: GoldenG3V6AuthCausalityPreparedAttempt,
  expectedOutcome: 'passed' | 'failed'
): Promise<GoldenG3V6BrowserAttempt> => {
  const leases = createGoldenG3V6TargetLeaseRegistry();
  const authorities = createGoldenG3V6SecurityAuthorityRegistry();
  const runtimeControls = createGoldenG3V6RuntimeControlRegistryImplementation({
    authFixtureSet: prepared.fixtureSet,
  });
  const artifactTransport = createGoldenG3V6ArtifactTransport();
  const factory = createFirstPartyBrowserVerificationAdapterFactory({
    targetLease: leases.port,
    runtimeControls: runtimeControls.port,
    securityObservationAuthority: authorities.port,
  });
  let attempt: GoldenG3V6BrowserAttempt | undefined;
  let primaryError: unknown;
  try {
    attempt = await executeGoldenG3V6BrowserAttempt({
      plan: prepared.plan,
      row: prepared.row,
      cell: prepared.cell,
      provider: prepared.provider,
      framework: prepared.framework,
      factory,
      leases,
      authorities,
      runtimeControls,
      artifactTransport,
      program: prepared.program,
      expectedOutcome,
    });
  } catch (error) {
    primaryError = error;
  }
  const cleanup = await Promise.allSettled([factory.dispose()]);
  const cleanupErrors = cleanup.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : []
  );
  expect(leases.snapshot().registered).toBe(0);
  expect(authorities.size()).toBe(0);
  expect(runtimeControls.snapshot()).toEqual({
    registered: 0,
    acquired: 0,
    started: 0,
    released: 0,
    active: 0,
  });
  expect(artifactTransport.snapshot()).toMatchObject({
    activeAttemptCount: 0,
    activeArtifactCount: 0,
  });
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      primaryError === undefined
        ? cleanupErrors
        : [primaryError, ...cleanupErrors],
      'Golden auth causality cleanup failed.'
    );
  }
  if (primaryError !== undefined) {
    throw primaryError;
  }
  if (!attempt) {
    throw new Error('Golden auth causality attempt produced no evidence.');
  }
  return attempt;
};

const assertExactFixtureCausality = (
  attempt: GoldenG3V6BrowserAttempt
): void => {
  const payload = attempt.result.report.payload;
  expect(payload.kind).toBe('e2e');
  if (payload.kind !== 'e2e') return;
  expect(attempt.runtimeControlEvidence).toMatchObject({
    fixtureProjectionMode: 'compiler-auth-fixture',
    fixtureRuntimeDispatchCount: 1,
    fixtureRequestCount: 1,
    fixtureDispatchCount: 1,
    fixtureResponseCount: 1,
  });
  expect(attempt.runtimeControlEvidence.fixtureRuntimeDispatchDigest).toMatch(
    /^sha256-[a-f0-9]{64}$/u
  );
  expect(attempt.runtimeControlEvidence.fixtureDispatchLedgerDigest).toMatch(
    /^sha256-[a-f0-9]{64}$/u
  );
  expect(attempt.runtimeControlEvidence.fixtureResponseDigest).toMatch(
    /^sha256-[a-f0-9]{64}$/u
  );
  expect(attempt.runtimeControlEvidence.fixtureResolutionDigest).toMatch(
    /^sha256-[a-f0-9]{64}$/u
  );
  expect(payload.behaviorAssertionReceipt).toMatchObject({
    attemptId: attempt.attemptId,
    cellId: attempt.cellId,
    executableSnapshotDigest: attempt.executableSnapshotDigest,
    scenarioProgramDigest: attempt.scenarioProgramDigest,
    runtimeFixtureBindingDigest:
      attempt.runtimeControlEvidence.fixtureRuntimeConsumptionBindingDigest,
  });
};

const gatedDescribe = describe.runIf(
  process.env.PRODIVIX_VERIFY_G3_V6_ADAPTER_MATRIX === '1'
);

gatedDescribe('Golden G3 V6 React/Vue product Auth fixture causality', () => {
  for (const frameworkTarget of ['react-vite', 'vue-vite'] as const) {
    it(`${frameworkTarget} binds positive and adversarial Auth outcomes to the real product DOM and Host ledger`, async () => {
      const prepared = await prepareGoldenG3V6AuthCausalityTarget({
        frameworkTarget,
      });
      try {
        expect(prepared).toMatchObject({
          frameworkTarget,
          buildCount: 1,
          immutableExecutableBuildDigest: expect.stringMatching(
            /^sha256-[a-f0-9]{64}$/u
          ),
          toolchainAuthorityRequestDigest: expect.stringMatching(
            /^sha256-[a-f0-9]{64}$/u
          ),
        });
        const projectedProjects = Object.values(prepared.attempts).map(
          ({ framework }) => framework.testProject
        );
        expect(
          new Set(projectedProjects.map(({ origin }) => origin)).size
        ).toBe(4);
        expect(
          new Set(
            projectedProjects.map(
              ({ toolchain }) => toolchain!.authorityReceipt.requestDigest
            )
          )
        ).toEqual(new Set([prepared.toolchainAuthorityRequestDigest]));

        const positive = await executePreparedAttempt(
          prepared.attempts.positive,
          'passed'
        );
        assertExactFixtureCausality(positive);
        expect(positive.result.report.payload).toMatchObject({
          kind: 'e2e',
          steps: expect.arrayContaining([
            expect.objectContaining({
              assertionCode: 'catalog-auth-principal-equals',
              status: 'passed',
              blackBox: true,
            }),
          ]),
        });

        const wrongPrincipal = await executePreparedAttempt(
          prepared.attempts['wrong-principal'],
          'failed'
        );
        assertExactFixtureCausality(wrongPrincipal);
        expect(wrongPrincipal.result.report.payload).toMatchObject({
          kind: 'e2e',
          steps: expect.arrayContaining([
            expect.objectContaining({
              assertionCode: 'catalog-auth-principal-equals',
              status: 'failed',
              blackBox: true,
            }),
          ]),
        });

        const missingPermission = await executePreparedAttempt(
          prepared.attempts['missing-permission'],
          'passed'
        );
        assertExactFixtureCausality(missingPermission);
        expect(missingPermission.result.report.payload).toMatchObject({
          kind: 'e2e',
          steps: expect.arrayContaining([
            expect.objectContaining({
              assertionCode: 'catalog-route-runtime-denied',
              status: 'passed',
              blackBox: true,
            }),
          ]),
        });

        expect(
          new Set(
            [positive, wrongPrincipal, missingPermission].map(
              ({ targetOriginDigest }) => targetOriginDigest
            )
          ).size
        ).toBe(3);
        expect(
          new Set(
            [positive, wrongPrincipal, missingPermission].map(
              ({ runtimeControlEvidence }) =>
                runtimeControlEvidence.fixtureConsumptionLedgerDigest
            )
          ).size
        ).toBe(3);

        await expect(
          executePreparedAttempt(prepared.attempts.unconsumed, 'passed')
        ).rejects.toThrow(
          /GOLDEN_RUNTIME_CONTROL_TERMINAL_ATTESTATION_MISSING/u
        );
      } finally {
        await prepared.dispose();
      }
    }, 600_000);
  }
});
