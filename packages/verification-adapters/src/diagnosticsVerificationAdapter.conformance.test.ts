import { canonicalJsonText } from '@prodivix/shared/canonical';
import {
  normalizeVerificationCheckReportCandidate,
  type VerificationNormalizedFinding,
} from '@prodivix/verification';
import { describe, expect, it } from 'vitest';
import {
  DIAGNOSTICS_VERIFICATION_ADAPTER_DESCRIPTOR,
  DIAGNOSTICS_VERIFICATION_ADAPTER_REGISTRATION,
  DIAGNOSTIC_VERIFICATION_SNAPSHOT_MEDIA_TYPE,
  FIRST_PARTY_STATIC_VERIFICATION_ADAPTER_REGISTRATIONS,
  FIRST_PARTY_VERIFICATION_INPUT_IDS,
  createDiagnosticsVerificationAdapter,
  encodeDiagnosticVerificationSnapshot,
} from './index';
import {
  adapterHarness,
  artifactSource,
  cellFor,
  createTestAbortSignal,
  prepareHarnessInvocation,
  sha,
  utf8,
} from './__tests__/verificationAdapterTestHarness';

const diagnosticCell = () =>
  cellFor(
    DIAGNOSTICS_VERIFICATION_ADAPTER_REGISTRATION,
    'diagnostics',
    'ci',
    ['diagnostic-snapshot'],
    ['trace']
  );

const snapshotBytes = (
  findings: readonly VerificationNormalizedFinding[] = []
): Readonly<{ cell: ReturnType<typeof diagnosticCell>; bytes: Uint8Array }> => {
  const cell = diagnosticCell();
  return {
    cell,
    bytes: encodeDiagnosticVerificationSnapshot({
      cellInputDigest: cell.inputDigest,
      workspaceSnapshotDigest: sha('workspace'),
      semanticIndexDigest: sha('semantic'),
      compilerProjectionDigest: sha('compiler'),
      findings,
      artifacts: [artifactSource('trace')],
    }),
  };
};

describe('diagnostics verification adapter conformance', () => {
  it('exports the controlled Golden V6 descriptor and registration', () => {
    expect(FIRST_PARTY_STATIC_VERIFICATION_ADAPTER_REGISTRATIONS).toHaveLength(
      4
    );
    expect(DIAGNOSTICS_VERIFICATION_ADAPTER_DESCRIPTOR).toMatchObject({
      id: 'adapter:g3-v6:diagnostics',
      checkKinds: ['diagnostics'],
      surfaces: ['ci'],
      targets: ['react-vite', 'vue-vite'],
      browserEngines: [],
      inputKinds: ['diagnostic-snapshot'],
      artifactKinds: ['trace'],
    });
  });

  it('keeps generic adapter-construction internals outside the public package surface', async () => {
    const publicApi = await import('./index');
    expect(publicApi).not.toHaveProperty(
      'createStaticVerificationAdapterFactory'
    );
    expect(publicApi).not.toHaveProperty('VerificationAdapterContractError');
  });

  it('produces a typed candidate and preserves logical artifact identity through Core normalization', async () => {
    const { cell, bytes } = snapshotBytes();
    const harness = adapterHarness(
      DIAGNOSTICS_VERIFICATION_ADAPTER_REGISTRATION,
      createDiagnosticsVerificationAdapter,
      cell,
      [
        {
          id: FIRST_PARTY_VERIFICATION_INPUT_IDS.diagnosticSnapshot,
          kind: 'diagnostic-snapshot',
          mediaType: DIAGNOSTIC_VERIFICATION_SNAPSHOT_MEDIA_TYPE,
          bytes,
        },
      ]
    );

    await expect(
      harness.adapter.preflight(cell, harness.context)
    ).resolves.toEqual({ status: 'supported' });
    const invocation = await prepareHarnessInvocation(harness);
    expect(invocation).toMatchObject({
      controlCapabilitySnapshotDigest:
        harness.context.controlCapabilitySnapshotDigest,
      appliedControlDigest: harness.context.appliedControlDigest,
    });
    const candidate = await harness.adapter.execute(invocation, harness.sink);
    expect(candidate).toMatchObject({
      checkKind: 'diagnostics',
      inputDigest: cell.inputDigest,
      terminal: { status: 'completed', exitCode: 0 },
      payload: { kind: 'diagnostics', findings: [] },
      artifacts: [{ id: 'artifact:trace', kind: 'trace' }],
    });
    expect(candidate).not.toHaveProperty('evidence');
    expect(candidate).not.toHaveProperty('trust');
    expect(candidate).not.toHaveProperty('retention');

    const normalized = normalizeVerificationCheckReportCandidate(candidate);
    expect(normalized).toMatchObject({
      status: 'ready',
      report: {
        verdict: 'passed',
        artifacts: [
          {
            id: 'artifact:trace',
            digest: candidate.artifacts[0]!.digest,
          },
        ],
      },
    });
    await expect(
      harness.adapter.cleanup({
        planDigest: invocation.planDigest,
        cellId: invocation.cellId,
        attemptId: invocation.attemptId,
        generation: invocation.generation,
        cause: 'success',
        invocation,
        abortSignal: createTestAbortSignal(),
      })
    ).resolves.toEqual({
      status: 'clean',
      residualCanaryIds: [],
      diagnosticCodes: [],
    });
  });

  it('reports blocking findings as product diagnostics without claiming Evidence', async () => {
    const { cell, bytes } = snapshotBytes([
      {
        ruleId: 'compiler.type-error',
        severity: 'error',
        targetId: 'target:catalog',
        messageKey: 'compiler.type-error',
        count: 1,
        diagnosticCodes: ['COD-2001'],
      },
    ]);
    const harness = adapterHarness(
      DIAGNOSTICS_VERIFICATION_ADAPTER_REGISTRATION,
      createDiagnosticsVerificationAdapter,
      cell,
      [
        {
          id: FIRST_PARTY_VERIFICATION_INPUT_IDS.diagnosticSnapshot,
          kind: 'diagnostic-snapshot',
          mediaType: DIAGNOSTIC_VERIFICATION_SNAPSHOT_MEDIA_TYPE,
          bytes,
        },
      ]
    );
    const invocation = await prepareHarnessInvocation(harness);
    const candidate = await harness.adapter.execute(invocation, harness.sink);
    expect(normalizeVerificationCheckReportCandidate(candidate)).toMatchObject({
      status: 'ready',
      report: {
        verdict: 'failed',
        failureClass: 'product-diagnostic-build',
      },
    });
  });

  it('treats manifest cellInputDigest as an additional Plan correlation check', async () => {
    const { cell, bytes } = snapshotBytes();
    const value = JSON.parse(new TextDecoder().decode(bytes)) as Record<
      string,
      unknown
    >;
    value.cellInputDigest = sha('drifted-cell-input');
    const drifted = utf8(canonicalJsonText(value));
    const harness = adapterHarness(
      DIAGNOSTICS_VERIFICATION_ADAPTER_REGISTRATION,
      createDiagnosticsVerificationAdapter,
      cell,
      [
        {
          id: FIRST_PARTY_VERIFICATION_INPUT_IDS.diagnosticSnapshot,
          kind: 'diagnostic-snapshot',
          mediaType: DIAGNOSTIC_VERIFICATION_SNAPSHOT_MEDIA_TYPE,
          bytes: drifted,
        },
      ]
    );
    await expect(harness.adapter.prepare(harness.prepareInput)).rejects.toThrow(
      /exact Plan cell input digest/u
    );
  });

  it('rejects non-canonical or shape-extended diagnostic snapshots', async () => {
    const { cell, bytes } = snapshotBytes();
    const value = JSON.parse(new TextDecoder().decode(bytes)) as Record<
      string,
      unknown
    >;
    value.unexpected = true;
    const extended = utf8(canonicalJsonText(value));
    const harness = adapterHarness(
      DIAGNOSTICS_VERIFICATION_ADAPTER_REGISTRATION,
      createDiagnosticsVerificationAdapter,
      cell,
      [
        {
          id: FIRST_PARTY_VERIFICATION_INPUT_IDS.diagnosticSnapshot,
          kind: 'diagnostic-snapshot',
          mediaType: DIAGNOSTIC_VERIFICATION_SNAPSHOT_MEDIA_TYPE,
          bytes: extended,
        },
      ]
    );
    await expect(harness.adapter.prepare(harness.prepareInput)).rejects.toThrow(
      /unknown, missing, or unsafe fields/u
    );

    const pretty = utf8(
      JSON.stringify(JSON.parse(new TextDecoder().decode(bytes)), null, 2)
    );
    const nonCanonical = adapterHarness(
      DIAGNOSTICS_VERIFICATION_ADAPTER_REGISTRATION,
      createDiagnosticsVerificationAdapter,
      cell,
      [
        {
          id: FIRST_PARTY_VERIFICATION_INPUT_IDS.diagnosticSnapshot,
          kind: 'diagnostic-snapshot',
          mediaType: DIAGNOSTIC_VERIFICATION_SNAPSHOT_MEDIA_TYPE,
          bytes: pretty,
        },
      ]
    );
    await expect(
      nonCanonical.adapter.prepare(nonCanonical.prepareInput)
    ).rejects.toThrow(/canonical JSON/u);
  });
});
