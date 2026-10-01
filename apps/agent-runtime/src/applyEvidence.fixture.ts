import {
  applyVerificationRunEvent,
  createVerificationRunEvent,
  createVerificationEvidenceVerifiedView,
  digestVerificationValue,
  type VerificationEvidence,
  type VerificationPlan,
  type VerificationRunSnapshot,
  type VerificationRunEventInput,
} from '@prodivix/verification';
import { time } from '#src/runtime.fixture.js';

/** Simulates already-promoted backend facts for consumer contract tests; this is not attestation or release evidence. */
export const completedVerificationFixture = (
  plan: VerificationPlan,
  initial: VerificationRunSnapshot,
  projectId: string,
  promote = true
) => {
  const evidence: VerificationEvidence[] = [];
  let run = initial;
  const append = (
    event: Omit<
      VerificationRunEventInput,
      'eventId' | 'runId' | 'cursor' | 'occurredAt'
    >
  ) => {
    const value = createVerificationRunEvent({
      ...event,
      eventId: `fixture.event.${run.cursor + 1}`,
      runId: run.runId,
      cursor: run.cursor + 1,
      occurredAt: time,
    } as VerificationRunEventInput);
    const result = applyVerificationRunEvent(run, value);
    if (result.status !== 'applied') throw new Error(result.message);
    run = result.snapshot;
  };
  append({ kind: 'run-started' });
  for (const selected of initial.cells) {
    const cell = plan.cells.find(({ id }) => id === selected.cellId)!;
    const candidateDigest = digestVerificationValue({
      runId: run.runId,
      cellId: cell.id,
    });
    append({
      kind: 'cell-started',
      cellId: cell.id,
      attemptId: selected.attemptId,
    } as Parameters<typeof append>[0]);
    append({
      kind: 'cell-reported',
      cellId: cell.id,
      attemptId: selected.attemptId,
      outcome: 'passed',
      candidateDigest,
    } as Parameters<typeof append>[0]);
    if (!promote) continue;
    const id = `evidence.${digestVerificationValue(cell.id).slice(7)}`;
    const d = digestVerificationValue('fixture.contract-only');
    const base: Omit<VerificationEvidence, 'manifestDigest'> = {
      id,
      projectId,
      workspaceId: plan.workspaceId,
      workspaceRevision: plan.targetRevision,
      partitionRevisions: plan.targetPartitionRevisions,
      executableSnapshotDigest: d,
      ...(cell.scenarioId
        ? {
            scenario: {
              id: cell.scenarioId,
              revision: 1,
              digest: d,
              programDigest: d,
            },
          }
        : {}),
      policyRevision: plan.policyRevision,
      policyDigest: plan.policyDigest,
      impactDigest: plan.impactDigest,
      planDigest: plan.planDigest,
      policyEvaluationInstant: plan.policyEvaluationInstant,
      cellId: cell.id,
      checkId: cell.checkId,
      checkKind: cell.checkKind,
      targetId: cell.targetId,
      attemptId: selected.attemptId,
      run: {
        runId: initial.runId,
        providerId: initial.providerId,
        surface: cell.surface,
        frameworkTarget: cell.frameworkTarget,
        runtimeZone: 'sandbox',
        ...(cell.browserEngine ? { browserEngine: cell.browserEngine } : {}),
        viewport: cell.viewport,
        devicePixelRatio: 1,
        colorScheme: cell.colorScheme,
        motion: cell.motion,
        locale: cell.locale,
        timezone: 'UTC',
        fontSetDigest: d,
        sandboxImageDigest: d,
      },
      timing: { startedAt: time, completedAt: time, durationMs: 0 },
      result: {
        outcome: 'passed',
        normalizedResultDigest: d,
        summary: { fixture: true },
        diagnosticCodes: [],
        appliedExemptionIds: cell.appliedExemptionIds,
      },
      provenance: {
        trust: 'remote-attested',
        producerId: 'fixture.contract-only',
        attestationDigest: d,
        issuedAt: time,
      },
      toolchain: {
        packageName: '@prodivix/verification-adapters',
        packageVersion: '0.1.0',
        buildDigest: d,
        toolchainDigest: cell.adapter.toolchainDigest,
        schemaDigest: d,
      },
      normalization: {
        packageName: '@prodivix/verification',
        packageVersion: '0.1.0',
        buildDigest: d,
        toolchainDigest: d,
        schemaDigest: d,
      },
      controls: {
        profileDigest: cell.controlProfileRef.digest ?? d,
        appliedDigest: d,
      },
      inputs: {
        executableSnapshotDigest: d,
        ...(cell.scenarioId ? { scenarioProgramDigest: d } : {}),
        fixtureSetDigests: cell.fixtureSetRef?.digest
          ? [cell.fixtureSetRef.digest]
          : [],
        ...(cell.baselineSetRef?.digest
          ? { baselineSetDigest: cell.baselineSetRef.digest }
          : {}),
        inputDigest: cell.inputDigest,
      },
      artifacts: [
        ...new Set([
          ...cell.artifactKinds,
          ...cell.evidenceRequirements.requiredArtifactKinds,
        ]),
      ].map((kind) => ({
        id: `artifact.${kind}`,
        path: `/fixture/${kind}.json`,
        kind,
        digest: d,
        size: 1,
        mediaType: 'application/json',
      })),
      sourceTraces: [],
      sourceTraceDigest: d,
      dependencyLockDigest: d,
      redactionPolicyId: 'fixture.redaction',
      targetPolicy: cell.targetPolicy,
      createdAt: time,
      retention: 'change',
    };
    evidence.push({ ...base, manifestDigest: digestVerificationValue(base) });
    append({
      kind: 'cell-promoted',
      cellId: cell.id,
      attemptId: selected.attemptId,
      candidateDigest,
      evidenceId: id,
    } as Parameters<typeof append>[0]);
  }
  append({ kind: 'run-completed' });
  return { run, evidence };
};

export const verificationViewFixture = (
  evidence: readonly VerificationEvidence[],
  revoked = false
) =>
  createVerificationEvidenceVerifiedView({
    closureEvaluationInstant: time,
    revocationRecordDigest: digestVerificationValue({ revoked }),
    records: evidence.map((item) => ({
      evidenceId: item.id,
      manifestDigest: item.manifestDigest,
      materializedEvidenceDigest: digestVerificationValue(item),
      effectiveTrust: item.provenance.trust,
      trustStatus: revoked ? ('revoked' as const) : ('verified' as const),
      attestationDigest: item.provenance.attestationDigest!,
      retentionState: 'active' as const,
      revocationRecordDigests: revoked
        ? [digestVerificationValue({ evidenceId: item.id, revoked })]
        : [],
      artifacts: item.artifacts.map((artifact) => ({
        artifactId: artifact.id,
        digest: artifact.digest,
        status: 'available' as const,
      })),
    })),
  });
