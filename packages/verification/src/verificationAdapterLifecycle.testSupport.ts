import { expect, vi } from 'vitest';
import { computeVerificationArtifactContentDigest } from './verificationArtifactDescriptor';
import {
  createVerificationAdapterRegistration,
  createVerificationAdapterRegistrySnapshot,
} from './verificationAdapterRegistry';
import { createVerificationBehaviorAssertionReceipt } from './verificationBehaviorAssertionReceipt';
import { createVerificationAbortController } from './verificationAdapterLifecycle';
import { digestVerificationValue } from './verificationCanonical';
import { VERIFICATION_ADAPTER_SECURITY_OBSERVATION_RULE_IDS } from './verificationCheckReportCodec';
import type {
  ExecuteVerificationAdapterLifecycleInput,
  VerificationAdapter,
  VerificationAdapterArtifactStagingTransportPort,
  VerificationAdapterCleanupResult,
  VerificationAdapterFactory,
  VerificationAdapterPrepareInput,
} from './verificationAdapterRuntime.types';
import type {
  VerificationAdapterPreflight,
  VerificationCheckKind,
  VerificationPlanCell,
} from './verification.types';

export const sha = (value: string): string => digestVerificationValue(value);
const inputBytes = new Uint8Array([1, 3, 5, 7]);
const inputContentDigest = computeVerificationArtifactContentDigest(inputBytes);

type HarnessOptions = Readonly<{
  maximumDurationMs?: number;
  checkKind?: Extract<VerificationCheckKind, 'diagnostics' | 'security'>;
  preflight?: VerificationAdapterPreflight;
  prepareError?: Error;
  execute?: VerificationAdapter['execute'];
  cleanup?: VerificationAdapterCleanupResult;
  stage?: VerificationAdapterArtifactStagingTransportPort['stage'];
}>;

export const createHarness = (options: HarnessOptions = {}) => {
  const checkKind = options.checkKind ?? 'diagnostics';
  const calls: string[] = [];
  const cleanupInputs: Parameters<VerificationAdapter['cleanup']>[0][] = [];
  const externalAbort = createVerificationAbortController();
  const registration = createVerificationAdapterRegistration(
    {
      id: 'adapter:lifecycle',
      implementation: {
        packageName: '@prodivix/lifecycle-test-adapter',
        packageVersion: '1.0.0',
        buildDigest: sha('build'),
        toolchainDigest: sha('toolchain'),
        schemaDigest: sha('schema'),
      },
      checkKinds: [checkKind],
      surfaces: ['ci'],
      targets: ['react-vite'],
      browserEngines: [],
      controlCapabilities: [],
      inputKinds: ['executable-snapshot'],
      artifactKinds: ['trace'],
      budgets: {
        maximumDurationMs: options.maximumDurationMs ?? 1_000,
        maximumArtifactBytes: 1_024,
        maximumEvents: 8,
      },
      trustInputs: ['local-unattested'],
    },
    { runtimeZones: ['node'] }
  );
  const registrySnapshot = createVerificationAdapterRegistrySnapshot([
    registration,
  ]);
  const cell: VerificationPlanCell = Object.freeze({
    id: 'cell:lifecycle',
    checkId: 'check:lifecycle',
    checkKind,
    targetId: 'target:lifecycle',
    targetPolicy: Object.freeze({
      authority: 'verification-policy',
      policyDigest: sha('policy'),
      semanticTargetId: 'target:lifecycle',
      capture: 'allowed',
    }),
    frameworkTarget: 'react-vite',
    surface: 'ci',
    viewport: Object.freeze({ id: 'desktop', width: 1280, height: 720 }),
    colorScheme: 'light',
    motion: 'full',
    locale: 'en-US',
    controlProfileRef: Object.freeze({
      kind: 'preset',
      presetId: 'control:default',
      digest: sha('control-profile'),
    }),
    adapter: registration.identity,
    requirement: 'required',
    policyRuleIds: Object.freeze(['rule:lifecycle']),
    appliedExemptionIds: Object.freeze([]),
    retryPolicy: Object.freeze({
      id: 'retry:lifecycle',
      maximumAttempts: 1,
      retryableOutcomes: Object.freeze([]),
      stabilitySamples: 1,
      freshFixtureNamespace: true,
    }),
    evidenceRequirements: Object.freeze({
      acceptedTrust: Object.freeze(['local-unattested'] as const),
      maximumAgeMs: 60_000,
      requireAttestation: false,
      requireCompatibleIdentity: true,
      requiredArtifactKinds: Object.freeze([]),
    }),
    resources: Object.freeze([]),
    inputKinds: Object.freeze(['executable-snapshot'] as const),
    artifactKinds: Object.freeze(['trace'] as const),
    estimatedCost: Object.freeze({
      durationMs: 10,
      artifactBytes: 4,
      computeUnits: 1,
    }),
    preflight: Object.freeze({ status: 'supported' }),
    dependencyCellIds: Object.freeze([]),
    inputDigest: sha('cell-input'),
    ...(checkKind === 'security'
      ? { scenarioId: 'scenario:lifecycle-security' }
      : {}),
  });
  const rawRead = vi.fn(async () => new Uint8Array(inputBytes));
  const rawStage = vi.fn<
    VerificationAdapterArtifactStagingTransportPort['stage']
  >(
    options.stage ??
      (async ({ artifact: { id, mediaType, bytes } }) => ({
        status: 'staged' as const,
        stagingArtifactId: `opaque:${id}`,
        digest: computeVerificationArtifactContentDigest(bytes),
        size: bytes.byteLength,
        mediaType,
      }))
  );
  const retireAttempt = vi.fn(
    async ({
      planDigest,
      cellId,
      attemptId,
      generation,
    }: {
      planDigest: string;
      cellId: string;
      attemptId: string;
      generation: number;
    }) => ({
      status: 'retired' as const,
      planDigest,
      cellId,
      attemptId,
      generation,
    })
  );
  let preparedInput: VerificationAdapterPrepareInput | undefined;
  const factory: VerificationAdapterFactory = (factoryContext) => {
    calls.push('factory');
    expect(factoryContext.identity).toEqual(registration.identity);
    expect(factoryContext.tool).toEqual(registration.tool);
    const adapter: VerificationAdapter = Object.freeze({
      preflight: async () => {
        calls.push('preflight');
        return options.preflight ?? { status: 'supported' };
      },
      prepare: async (input) => {
        calls.push('prepare');
        preparedInput = input;
        if (options.prepareError) throw options.prepareError;
        return Object.freeze({
          invocationId: 'invocation:lifecycle',
          planDigest: input.planDigest,
          cellId: input.cell.id,
          adapterId: input.cell.adapter.adapterId,
          attemptId: input.attemptId,
          generation: input.generation,
          providerKind: input.providerKind,
          inputDigest: input.cell.inputDigest,
          controlCapabilitySnapshotDigest:
            input.controlCapabilitySnapshotDigest,
          appliedControlDigest: input.appliedControlDigest,
          confirmedCursor: 0,
          state: 'running',
        });
      },
      execute:
        options.execute ??
        (async (invocation, sink) => {
          calls.push('execute');
          expect(invocation.resolvedInputSetDigest).toMatch(
            /^sha256-[a-f0-9]{64}$/u
          );
          await preparedInput!.context.inputResolver.read(
            preparedInput!.context.inputRefs[0]!,
            preparedInput!.context.abortSignal
          );
          sink.emit({
            kind: 'progress',
            eventId: 'event:complete',
            messageKey: 'verification.complete',
            completed: 1,
            total: 1,
          });
          const reportCoordinates = Object.freeze({
            format: 'prodivix.verification-check-report-candidate',
            version: 1,
            cellId: invocation.cellId,
            attemptId: invocation.attemptId,
            inputDigest: invocation.inputDigest,
            adapter: registration.identity,
            tool: registration.tool!,
            terminal: Object.freeze({
              status: 'completed',
              complete: true,
              exitCode: 0,
            }),
            artifacts: Object.freeze([]),
            diagnosticCodes: Object.freeze([]),
          });
          return checkKind === 'security'
            ? Object.freeze({
                ...reportCoordinates,
                checkKind: 'security' as const,
                payload: Object.freeze({
                  kind: 'security' as const,
                  observedRuleIds:
                    VERIFICATION_ADAPTER_SECURITY_OBSERVATION_RULE_IDS,
                  findings: Object.freeze([]),
                  behaviorAssertionReceipt:
                    createVerificationBehaviorAssertionReceipt({
                      attemptId: invocation.attemptId,
                      cellId: invocation.cellId,
                      scenarioId: cell.scenarioId!,
                      executableSnapshotDigest: inputContentDigest,
                      scenarioProgramDigest: sha(
                        'lifecycle-security-scenario-program'
                      ),
                      controlProfileDigest: cell.controlProfileRef.digest!,
                      fixtureSetDigests: [],
                      targetLeaseBindingDigest: sha(
                        'lifecycle-security-target-lease'
                      ),
                      runtimeFixtureBindingDigest: sha(
                        'lifecycle-security-runtime-fixture'
                      ),
                      blackBoxAssertionSetDigest: sha(
                        'lifecycle-security-black-box-assertions'
                      ),
                    }),
                }),
              })
            : Object.freeze({
                ...reportCoordinates,
                checkKind: 'diagnostics' as const,
                payload: Object.freeze({
                  kind: 'diagnostics' as const,
                  findings: Object.freeze([]),
                }),
              });
        }),
      cleanup: async (input) => {
        calls.push('cleanup');
        cleanupInputs.push(input);
        return (
          options.cleanup ?? {
            status: 'clean',
            residualCanaryIds: [],
            diagnosticCodes: [],
          }
        );
      },
    });
    return adapter;
  };
  const lifecycleInput: ExecuteVerificationAdapterLifecycleInput = {
    factory,
    registrySnapshot,
    planDigest: sha('plan'),
    cell,
    attemptId: 'attempt:lifecycle',
    generation: 1,
    providerKind: 'local',
    context: {
      registrySnapshotDigest: registrySnapshot.snapshotDigest,
      adapter: registration.identity,
      runtimeZone: 'node',
      runtimeEnvironmentDigest: sha('runtime-environment'),
      inputDigest: cell.inputDigest,
      executableSnapshotDigest: inputContentDigest,
      ...(checkKind === 'security'
        ? {
            scenarioProgramDigest: sha('lifecycle-security-scenario-program'),
          }
        : {}),
      controlProfileDigest: cell.controlProfileRef.digest!,
      fixtureSetDigests: Object.freeze([]),
      controlCapabilityIds: Object.freeze([]),
      controlCapabilitySnapshotDigest: sha('control-capabilities'),
      appliedControlDigest: sha('applied-controls'),
      inputRefs: Object.freeze([
        Object.freeze({
          id: 'input:executable',
          kind: 'executable-snapshot',
          digest: inputContentDigest,
          size: inputBytes.byteLength,
          mediaType: 'application/octet-stream',
        }),
      ]),
      inputResolver: { read: rawRead },
      artifactStaging: { stage: rawStage },
      abortSignal: externalAbort.signal,
    },
    artifactRetirement: { retireAttempt },
  };
  return {
    calls,
    cleanupInputs,
    retireAttempt,
    externalAbort,
    lifecycleInput,
    rawRead,
    rawStage,
    registration,
  };
};
