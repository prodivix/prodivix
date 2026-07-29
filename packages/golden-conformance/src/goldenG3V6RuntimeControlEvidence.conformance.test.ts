import { describe, expect, it } from 'vitest';
import {
  createGoldenG3V6RuntimeControlRegistry,
  type GoldenG3V6ControlledProviderKind,
} from './goldenG3V6RuntimeControlEvidence';
import {
  GOLDEN_G3_V6_TEST_SIGNAL,
  acquireGoldenG3V6RuntimeControlTestLease,
  createGoldenG3V6RuntimeControlTestFixture,
  createGoldenG3V6RuntimeFixtureTestRequest,
  createGoldenG3V6RuntimeControlTestHost,
  goldenG3V6AbortedTestSignal,
} from './goldenG3V6RuntimeControlEvidence.testSupport';

const providers = Object.freeze([
  'browser',
  'remote',
  'export',
  'ci',
] as const satisfies readonly GoldenG3V6ControlledProviderKind[]);

const gatedDescribe = describe.runIf(
  process.env.PRODIVIX_VERIFY_G3_V6_ADAPTER_MATRIX === '1'
);

gatedDescribe('Golden G3 V6 runtime control authority', () => {
  it.each(providers)(
    'binds live initial/terminal/cleanup/retirement evidence for %s',
    async (providerKind) => {
      const fixture =
        await createGoldenG3V6RuntimeControlTestFixture(providerKind);
      try {
        const registry = createGoldenG3V6RuntimeControlRegistry();
        const { lease, registration } =
          await acquireGoldenG3V6RuntimeControlTestLease(registry, fixture);
        expect(lease.providerKind).toBe(providerKind);
        expect(
          lease.resourceManifest.resources.map(({ kind }) => kind)
        ).toEqual(expect.arrayContaining(['control-host', 'entry', 'bundle']));
        expect(
          lease.resourceManifest.resources.every(({ url }) => {
            const parsed = new URL(url);
            return (
              parsed.origin === fixture.input.targetLease.origin &&
              !parsed.search &&
              !parsed.hash &&
              !parsed.username &&
              !parsed.password
            );
          })
        ).toBe(true);
        expect(
          lease.resourceManifest.resources.some(({ url }) =>
            url.startsWith('data:')
          )
        ).toBe(false);

        const host = createGoldenG3V6RuntimeControlTestHost(lease);
        const started = await lease.start(host);
        expect(started.status).toBe('ready');
        if (started.status !== 'ready') return;
        await expect(lease.start(host)).rejects.toThrow(/single-use/u);

        const initial = await lease.attest('initial');
        expect(initial.phase).toBe('initial');
        expect(initial.remoteBindingDigest).toBe(
          registration.expectation.remoteBindingDigest
        );
        expect(() =>
          lease.sealTerminal({
            ...initial,
            phase: 'terminal',
          })
        ).toThrow(/digest|issued/u);

        const terminal = await lease.attest('terminal');
        lease.sealTerminal(terminal);
        expect(lease.terminalSealed()).toBe(true);
        expect(initial.attestationDigest).not.toBe(terminal.attestationDigest);
        expect(lease.liveWitness()).toMatchObject({
          schedulerStatus: 'idle',
          schedulerTurns: 1,
          schedulerPendingTaskCount: 0,
          schedulerPendingBarrierCount: 0,
          schedulerDroppedEventCount: 0,
          schedulerCompletedOperationCount: 1,
          fixtureDispatchCount: 1,
        });

        const cleanup = await started.session.cleanup();
        expect(cleanup.clean).toBe(true);
        const release = await registry.port.release(
          lease,
          terminal,
          GOLDEN_G3_V6_TEST_SIGNAL
        );
        expect(release).toEqual({
          status: 'clean',
          residualCanaryIds: [],
          diagnosticCodes: [],
        });
        expect(() => registration.assertReleased()).toThrow(
          /released and retired/u
        );

        const evidence = await registry.forceRetire(fixture.input.attemptId);
        expect(evidence).toBeDefined();
        expect(registration.assertReleased()).toEqual(evidence);
        expect(evidence).toMatchObject({
          attemptId: fixture.input.attemptId,
          providerKind,
          initialAttestationDigest: initial.attestationDigest,
          terminalAttestationDigest: terminal.attestationDigest,
          resourceManifestDigest:
            registration.expectation.resourceManifestDigest,
          fixtureBindingDigest: registration.expectation.fixtureBindingDigest,
          fixtureProjectionMode: 'compiler-auth-fixture',
          fixtureProjectionAuthorityDigest:
            registration.expectation.fixtureProjectionAuthorityDigest,
          fixtureRuntimeDispatchCount: 1,
          fixtureRequestCount: 1,
          fixtureDispatchCount: 1,
          fixtureResponseCount: 1,
        });
        expect(evidence?.fixtureRuntimeDispatchDigest).toMatch(
          /^sha256-[a-f0-9]{64}$/u
        );
        expect(evidence?.fixtureResponseDigest).toMatch(
          /^sha256-[a-f0-9]{64}$/u
        );
        expect(evidence?.fixtureResolutionDigest).toMatch(
          /^sha256-[a-f0-9]{64}$/u
        );
        expect(evidence?.fixtureRuntimeConsumptionBindingDigest).toMatch(
          /^sha256-[a-f0-9]{64}$/u
        );
        expect(evidence?.releaseReceiptDigest).toMatch(
          /^sha256-[a-f0-9]{64}$/u
        );
        expect(evidence?.retirementEvidenceDigest).toMatch(
          /^sha256-[a-f0-9]{64}$/u
        );
        expect(registry.snapshot()).toEqual({
          registered: 0,
          acquired: 0,
          started: 0,
          released: 0,
          active: 0,
        });

        const repeatedRetirement = await registry.forceRetire(
          fixture.input.attemptId
        );
        expect(repeatedRetirement?.evidenceDigest).toBe(
          evidence?.evidenceDigest
        );
        const repeatedRelease = await registry.port.release(
          lease,
          terminal,
          GOLDEN_G3_V6_TEST_SIGNAL
        );
        expect(repeatedRelease.status).toBe('failed');
        expect(repeatedRelease.diagnosticCodes).toEqual([
          'GOLDEN_RUNTIME_CONTROL_RELEASE_REPLAY',
        ]);
        expect(Object.isFrozen(registration.assertReleased())).toBe(true);
      } finally {
        await fixture.close();
      }
    }
  );

  it('dispatches only for one exact Compiler endpoint request', async () => {
    const fixture = await createGoldenG3V6RuntimeControlTestFixture('browser');
    try {
      const registry = createGoldenG3V6RuntimeControlRegistry();
      const { lease } = await acquireGoldenG3V6RuntimeControlTestLease(
        registry,
        fixture
      );
      const host = createGoldenG3V6RuntimeControlTestHost(lease);
      const started = await lease.start(host);
      expect(started.status).toBe('ready');
      if (started.status !== 'ready') return;
      expect(lease.resolveRuntimeFixture).toBeTypeOf('function');
      const exact = createGoldenG3V6RuntimeFixtureTestRequest(lease);
      const invalidRequests = [
        { ...exact, method: 'POST' },
        { ...exact, url: `${exact.url}?drift=1` },
        {
          ...exact,
          url: new URL('/__prodivix/runtime-fixture/wrong', exact.url).href,
        },
        { ...exact, invocationId: 'not canonical?' },
        { ...exact, attempt: exact.attempt + 1 },
      ];
      for (const request of invalidRequests) {
        await expect(
          lease.resolveRuntimeFixture!(
            request as Parameters<
              NonNullable<typeof lease.resolveRuntimeFixture>
            >[0]
          )
        ).rejects.toThrow();
        expect(started.session.network.events()).toHaveLength(0);
      }

      const initial = await lease.attest('initial');
      expect(initial.application.network).toMatchObject({
        fixtureRequestCount: 1,
        fixtureDispatchCount: 1,
        fixtureResponseCount: 1,
      });
      await expect(lease.resolveRuntimeFixture!(exact)).rejects.toThrow(
        /single-use/u
      );

      const terminal = await lease.attest('terminal');
      lease.sealTerminal(terminal);
      await started.session.cleanup();
      expect(
        await registry.port.release(lease, terminal, GOLDEN_G3_V6_TEST_SIGNAL)
      ).toMatchObject({ status: 'clean' });
      await registry.forceRetire(fixture.input.attemptId);
    } finally {
      await fixture.close();
    }
  });

  it('allows a deferred initial fixture and fails closed if the client still has not consumed it by terminal', async () => {
    const fixture = await createGoldenG3V6RuntimeControlTestFixture('browser');
    try {
      const registry = createGoldenG3V6RuntimeControlRegistry();
      const { lease, registration } =
        await acquireGoldenG3V6RuntimeControlTestLease(registry, fixture);
      const started = await lease.start(
        createGoldenG3V6RuntimeControlTestHost(lease, {
          skipRuntimeFixtureConsumption: true,
        })
      );
      expect(started.status).toBe('ready');
      if (started.status !== 'ready') return;
      const initial = await lease.attest('initial');
      expect(initial.application.network).toMatchObject({
        fixtureRequestCount: 0,
        fixtureDispatchCount: 0,
        fixtureResponseCount: 0,
      });
      await expect(lease.attest('terminal')).rejects.toThrow(
        /consumed fixture|request|dispatch|response/u
      );
      expect(started.session.network.events()).toHaveLength(0);
      await started.session.cleanup();
      expect(
        await registry.port.release(lease, undefined, GOLDEN_G3_V6_TEST_SIGNAL)
      ).toMatchObject({ status: 'failed' });
      expect(
        await registry.forceRetire(fixture.input.attemptId)
      ).toBeUndefined();
      expect(() => registration.assertReleased()).toThrow(
        /released and retired/u
      );
    } finally {
      await fixture.close();
    }
  });

  it('rejects redirect and control-route byte drift before registration', async () => {
    for (const serverOptions of [
      { redirectEntry: true },
      { driftControlHost: true },
    ]) {
      const fixture = await createGoldenG3V6RuntimeControlTestFixture(
        'browser',
        serverOptions
      );
      try {
        const registry = createGoldenG3V6RuntimeControlRegistry();
        await expect(registry.register(fixture.input)).rejects.toThrow();
        expect(registry.snapshot().registered).toBe(0);
      } finally {
        await fixture.close();
      }
    }
  });

  it('rejects snapshot, build, fixture, capability, and aborted acquire drift', async () => {
    const fixture = await createGoldenG3V6RuntimeControlTestFixture('browser');
    try {
      const fixtureSwapRegistry = createGoldenG3V6RuntimeControlRegistry();
      await expect(
        fixtureSwapRegistry.register({
          ...fixture.input,
          cell: {
            ...fixture.input.cell,
            fixtureSetRef: {
              ...fixture.input.cell.fixtureSetRef!,
              digest: `sha256-${'1'.repeat(64)}`,
            },
          },
        })
      ).rejects.toThrow(/target lease|registration/u);

      const snapshotSwapRegistry = createGoldenG3V6RuntimeControlRegistry();
      await expect(
        snapshotSwapRegistry.register({
          ...fixture.input,
          snapshot: {
            ...fixture.input.snapshot,
            contentDigest: `sha256-${'2'.repeat(64)}`,
          },
        })
      ).rejects.toThrow(/target lease|registration/u);

      const buildSwapRegistry = createGoldenG3V6RuntimeControlRegistry();
      await expect(
        buildSwapRegistry.register({
          ...fixture.input,
          buildBundle: {
            ...fixture.input.buildBundle,
            snapshotDigest: `sha256-${'3'.repeat(64)}`,
          },
        })
      ).rejects.toThrow(/build bundle/u);

      const missingReceiptRegistry = createGoldenG3V6RuntimeControlRegistry();
      const {
        fixtureProjectionReceipt: _fixtureProjectionReceipt,
        ...withoutReceipt
      } = fixture.input;
      await expect(
        missingReceiptRegistry.register(withoutReceipt)
      ).rejects.toThrow(/registration|target lease/u);

      const receiptSwapRegistry = createGoldenG3V6RuntimeControlRegistry();
      await expect(
        receiptSwapRegistry.register({
          ...fixture.input,
          fixtureProjectionReceipt: {
            ...fixture.input.fixtureProjectionReceipt!,
            receiptDigest: `sha256-${'5'.repeat(64)}`,
          },
        })
      ).rejects.toThrow(/receipt/u);

      const securityInjectionRegistry =
        createGoldenG3V6RuntimeControlRegistry();
      const { fixtureSetRef: _securityFixtureSetRef, ...securityCell } =
        fixture.input.cell;
      await expect(
        securityInjectionRegistry.register({
          ...fixture.input,
          cell: {
            ...securityCell,
            checkKind: 'security',
          },
        })
      ).rejects.toThrow(/registration|target lease/u);

      const registry = createGoldenG3V6RuntimeControlRegistry();
      const registration = await registry.register(fixture.input);
      const acquireInput = {
        cell: fixture.input.cell,
        targetLease: fixture.input.targetLease,
        attemptId: fixture.input.attemptId,
        generation: fixture.input.generation,
        providerKind: fixture.input.providerKind,
        executableSnapshotDigest: fixture.input.snapshot.contentDigest,
        expectedControlDigest: registration.expectation.expectedControlDigest,
        expectedCapabilitySnapshotDigest:
          registration.expectation.controlCapabilitySnapshotDigest,
        expectedControlCapabilityIds:
          registration.expectation.controlCapabilityIds,
      };
      await expect(
        registry.port.acquire(
          {
            ...acquireInput,
            expectedControlDigest: `sha256-${'4'.repeat(64)}`,
          },
          GOLDEN_G3_V6_TEST_SIGNAL
        )
      ).rejects.toThrow(/drifted/u);
      await expect(
        registry.port.acquire(acquireInput, goldenG3V6AbortedTestSignal())
      ).rejects.toThrow(/drifted/u);
      await registry.forceRetire(fixture.input.attemptId);
      expect(registry.snapshot().active).toBe(0);
    } finally {
      await fixture.close();
    }
  });

  it('cleans pre-start, blocked, initial-only, and residual failure paths', async () => {
    const preStartFixture =
      await createGoldenG3V6RuntimeControlTestFixture('browser');
    try {
      const registry = createGoldenG3V6RuntimeControlRegistry();
      const { lease } = await acquireGoldenG3V6RuntimeControlTestLease(
        registry,
        preStartFixture
      );
      expect(
        await registry.port.release(lease, undefined, GOLDEN_G3_V6_TEST_SIGNAL)
      ).toMatchObject({ status: 'clean' });
      expect(
        await registry.forceRetire(preStartFixture.input.attemptId)
      ).toBeUndefined();
      expect(registry.snapshot().active).toBe(0);
    } finally {
      await preStartFixture.close();
    }

    const blockedFixture =
      await createGoldenG3V6RuntimeControlTestFixture('browser');
    try {
      const registry = createGoldenG3V6RuntimeControlRegistry();
      const { lease } = await acquireGoldenG3V6RuntimeControlTestLease(
        registry,
        blockedFixture
      );
      const started = await lease.start(
        createGoldenG3V6RuntimeControlTestHost(lease, {
          applyDigestDrift: true,
        })
      );
      expect(started.status).toBe('blocked');
      expect(
        await registry.port.release(lease, undefined, GOLDEN_G3_V6_TEST_SIGNAL)
      ).toMatchObject({ status: 'clean' });
      await registry.forceRetire(blockedFixture.input.attemptId);
      expect(registry.snapshot().active).toBe(0);
    } finally {
      await blockedFixture.close();
    }

    const initialOnlyFixture =
      await createGoldenG3V6RuntimeControlTestFixture('browser');
    try {
      const registry = createGoldenG3V6RuntimeControlRegistry();
      const { lease, registration } =
        await acquireGoldenG3V6RuntimeControlTestLease(
          registry,
          initialOnlyFixture
        );
      const started = await lease.start(
        createGoldenG3V6RuntimeControlTestHost(lease)
      );
      expect(started.status).toBe('ready');
      if (started.status !== 'ready') return;
      await lease.attest('initial');
      await started.session.cleanup();
      expect(
        await registry.port.release(lease, undefined, GOLDEN_G3_V6_TEST_SIGNAL)
      ).toEqual({
        status: 'clean',
        residualCanaryIds: [],
        diagnosticCodes: [],
      });
      await registry.forceRetire(initialOnlyFixture.input.attemptId);
      expect(() => registration.assertReleased()).toThrow(
        /released and retired/u
      );
      expect(registry.snapshot().active).toBe(0);
    } finally {
      await initialOnlyFixture.close();
    }

    const residualFixture =
      await createGoldenG3V6RuntimeControlTestFixture('browser');
    try {
      const registry = createGoldenG3V6RuntimeControlRegistry();
      const { lease } = await acquireGoldenG3V6RuntimeControlTestLease(
        registry,
        residualFixture
      );
      const started = await lease.start(
        createGoldenG3V6RuntimeControlTestHost(lease, {
          cleanupResidualField: 'storage',
        })
      );
      expect(started.status).toBe('ready');
      if (started.status !== 'ready') return;
      await lease.attest('initial');
      const terminal = await lease.attest('terminal');
      lease.sealTerminal(terminal);
      expect((await started.session.cleanup()).clean).toBe(false);
      expect(
        await registry.port.release(lease, terminal, GOLDEN_G3_V6_TEST_SIGNAL)
      ).toMatchObject({
        status: 'failed',
        diagnosticCodes: ['GOLDEN_RUNTIME_CONTROL_CLEANUP_RESIDUAL'],
      });
      await expect(
        registry.forceRetire(residualFixture.input.attemptId)
      ).rejects.toThrow(/residual/u);
      expect(registry.snapshot().active).toBe(0);
    } finally {
      await residualFixture.close();
    }
  });
});
