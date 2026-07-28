import { describe, expect, it } from 'vitest';
import type {
  VerificationEvidence,
  VerificationPolicy,
} from './verification.types';
import { digestVerificationValue } from './verificationCanonical';
import { normalizeVerificationPolicy } from './verificationCodec';
import {
  compareVerificationEvidenceCompatibility,
  resolveVerificationComparisonPolicy,
  type VerificationComparisonAllowedMismatchField,
  type VerificationComparisonPolicy,
} from './verificationComparison';

const policy = (
  allowedMismatchFields: readonly VerificationComparisonAllowedMismatchField[],
  id = 'policy.comparison'
): VerificationPolicy => ({
  id,
  name: 'Comparison policy',
  defaultRequirement: 'advisory',
  rules: [
    {
      id: 'rule.comparison',
      requirement: 'advisory',
      checkKinds: ['e2e'],
      scenarioIds: [],
      scenarioTags: [],
      criticalities: [],
      impactedDomains: [],
      riskFlags: [],
      matrixProfileId: 'matrix.comparison',
      retryPolicyId: 'retry.comparison',
      evidenceTrust: 'local-unattested',
      controlProfileRef: {
        kind: 'preset',
        presetId: 'control.default',
        digest: digestVerificationValue('control'),
      },
    },
  ],
  matrixProfiles: [
    {
      id: 'matrix.comparison',
      name: 'Comparison matrix',
      matrix: {
        frameworkTargets: ['react-vite'],
        surfaces: ['preview'],
        browserEngines: ['chromium'],
        viewports: [{ id: 'desktop', width: 1_440, height: 900 }],
        colorSchemes: ['dark'],
        motions: ['reduced'],
        locales: ['en-US'],
      },
    },
  ],
  budgets: {
    maximumCells: 16,
    maximumCellsPerCheckKind: 16,
    maximumTargetExpansions: 4,
    maximumBrowserExpansions: 3,
    maximumClosureEvidenceRecords: 64,
    totalMs: 60_000,
    artifactBytes: 64 * 1_024 * 1_024,
    estimatedComputeUnits: 1_000,
    parallelism: 4,
  },
  retryPolicies: [
    {
      id: 'retry.comparison',
      maximumAttempts: 1,
      retryableOutcomes: [],
      stabilitySamples: 1,
      freshFixtureNamespace: true,
    },
  ],
  exemptions: [],
  artifactCapture: {
    defaultCapture: 'allowed',
    targets: [],
  },
  comparison: {
    allowedMismatchFields,
  },
  evidenceRequirements: {
    acceptedTrust: ['local-unattested'],
    maximumAgeMs: 60_000,
    requireAttestation: false,
    requireCompatibleIdentity: true,
    requiredArtifactKinds: [],
  },
  baselinePolicy: {
    visual: 'advisory',
    requireCompatibleIdentity: true,
  },
  retentionRequest: {
    successful: 'change',
    failed: 'change',
    protectReleaseEvidence: false,
  },
});

const resolvedPolicy = (
  allowedMismatchFields: readonly VerificationComparisonAllowedMismatchField[],
  id?: string
): VerificationComparisonPolicy => {
  const document = policy(allowedMismatchFields, id);
  return resolveVerificationComparisonPolicy(
    document,
    digestVerificationValue(normalizeVerificationPolicy(document))
  );
};

const evidence = (
  id: string,
  overrides: Partial<VerificationEvidence> = {}
): VerificationEvidence => {
  const { manifestDigest: _manifestDigest, ...normalizedOverrides } = overrides;
  const manifest = {
    id,
    projectId: 'project:verification',
    workspaceId: 'workspace:verification',
    workspaceRevision: 7,
    partitionRevisions: {
      workspaceRev: 7,
      routeRev: 3,
      opSeq: 11,
      documentRevisions: {},
    },
    executableSnapshotDigest: 'sha256-executable',
    scenario: {
      id: 'scenario:checkout',
      revision: 2,
      digest: 'sha256-scenario',
      programDigest: 'sha256-program',
    },
    policyRevision: 4,
    policyDigest: 'sha256-policy',
    impactDigest: 'sha256-impact',
    planDigest: 'sha256-plan',
    policyEvaluationInstant: '2026-07-28T00:00:00.000Z',
    cellId: 'cell:checkout',
    checkId: 'check:e2e',
    checkKind: 'e2e' as const,
    targetId: 'target:react-vite',
    attemptId: `attempt:${id}`,
    run: {
      runId: `run:${id}`,
      providerId: 'ci',
      surface: 'ci' as const,
      frameworkTarget: 'react-vite',
      runtimeZone: 'browser',
      browserEngine: 'chromium' as const,
      operatingSystemIdentity: 'linux-x64',
      viewport: { id: 'desktop', width: 1_440, height: 900 },
      devicePixelRatio: 2,
      colorScheme: 'dark' as const,
      motion: 'reduced' as const,
      locale: 'en-US',
      timezone: 'Etc/UTC',
      fontSetDigest: 'sha256-fonts',
      sandboxImageDigest: 'sha256-sandbox',
    },
    timing: {
      startedAt: '2026-07-28T00:00:01.000Z',
      completedAt: '2026-07-28T00:00:02.000Z',
      durationMs: 1_000,
    },
    result: {
      outcome: 'passed' as const,
      normalizedResultDigest: 'sha256-result',
      summary: { passed: true },
      diagnosticCodes: [],
      appliedExemptionIds: [],
    },
    provenance: {
      trust: 'ci-attested' as const,
      producerId: 'github-actions',
      attestationDigest: 'sha256-attestation',
      issuedAt: '2026-07-28T00:00:02.000Z',
      ci: {
        repository: 'prodivix/prodivix',
        ref: 'refs/heads/main',
        commit: `sha1-${'a'.repeat(40)}`,
      },
    },
    toolchain: {
      packageName: '@prodivix/browser-adapter',
      packageVersion: '4.2.1',
      buildDigest: 'sha256-build',
      toolchainDigest: 'sha256-toolchain',
      schemaDigest: 'sha256-schema',
    },
    normalization: {
      packageName: '@prodivix/verification',
      packageVersion: '0.0.1',
      buildDigest: 'sha256-normalization-build',
      toolchainDigest: 'sha256-normalization-toolchain',
      schemaDigest: 'sha256-normalization-schema',
    },
    controls: {
      profileDigest: 'sha256-controls',
      appliedDigest: 'sha256-applied-controls',
    },
    inputs: {
      executableSnapshotDigest: 'sha256-executable',
      scenarioProgramDigest: 'sha256-program',
      fixtureSetDigests: ['sha256-fixture'],
      baselineSetDigest: 'sha256-baseline',
      inputDigest: 'sha256-input',
    },
    artifacts: [],
    sourceTraceDigest: 'sha256-source-trace',
    dependencyLockDigest: 'sha256-lock',
    redactionPolicyId: 'redaction:v1',
    targetPolicy: {
      authority: 'verification-policy' as const,
      policyDigest: 'sha256-policy',
      semanticTargetId: 'target:react-vite',
      capture: 'allowed' as const,
    },
    createdAt: '2026-07-28T00:00:02.000Z',
    retention: 'change' as const,
    ...normalizedOverrides,
  };
  return {
    ...manifest,
    manifestDigest: digestVerificationValue(manifest),
  } as VerificationEvidence;
};

describe('Verification Evidence comparison compatibility', () => {
  it('treats separate attempts with the same semantic inputs as exact-compatible', () => {
    const left = evidence('evidence:left');
    const right = evidence('evidence:right', {
      timing: {
        startedAt: '2026-07-28T00:00:03.000Z',
        completedAt: '2026-07-28T00:00:04.000Z',
        durationMs: 1_000,
      },
      result: {
        outcome: 'failed',
        normalizedResultDigest: 'sha256-other-result',
        summary: { passed: false },
        diagnosticCodes: ['VER-4001'],
        appliedExemptionIds: [],
      },
    });
    const comparison = compareVerificationEvidenceCompatibility(left, right);
    expect(comparison).toMatchObject({
      compatibility: 'exact-compatible',
      mismatchFields: [],
    });
    expect(
      compareVerificationEvidenceCompatibility(right, left).comparisonDigest
    ).toBe(comparison.comparisonDigest);
  });

  it('requires an explicit policy to approve a controlled mismatch', () => {
    const left = evidence('evidence:left');
    const right = evidence('evidence:right', {
      run: {
        ...left.run,
        runId: 'run:right',
        operatingSystemIdentity: 'windows-x64',
      },
    });
    expect(compareVerificationEvidenceCompatibility(left, right)).toMatchObject(
      {
        compatibility: 'view-only',
        mismatchFields: ['operating-system'],
      }
    );
    expect(
      compareVerificationEvidenceCompatibility(
        left,
        right,
        resolvedPolicy(['operating-system'], 'comparison-policy.platform')
      )
    ).toMatchObject({
      compatibility: 'policy-compatible',
      mismatchFields: ['operating-system'],
      policyId: 'comparison-policy.platform',
    });
  });

  it('rejects semantic lineage drift even when a policy asks to permit it', () => {
    const left = evidence('evidence:left');
    const right = evidence('evidence:right', {
      checkId: 'check:security',
      checkKind: 'security',
      scenario: {
        ...left.scenario!,
        id: 'scenario:other',
      },
    });
    expect(compareVerificationEvidenceCompatibility(left, right)).toMatchObject(
      {
        compatibility: 'incompatible',
        mismatchFields: ['check-id', 'check-kind', 'scenario-id'],
      }
    );
    expect(() =>
      resolvedPolicy(
        ['check-id' as VerificationComparisonAllowedMismatchField],
        'comparison-policy.unsafe'
      )
    ).toThrow('valid full Policy');

    const changedProgram = evidence('evidence:changed-program', {
      scenario: {
        ...left.scenario!,
        revision: 3,
        digest: 'sha256-changed-scenario',
        programDigest: 'sha256-changed-program',
      },
    });
    expect(
      compareVerificationEvidenceCompatibility(left, changedProgram)
    ).toMatchObject({
      compatibility: 'incompatible',
      mismatchFields: [
        'scenario-digest',
        'scenario-program',
        'scenario-revision',
      ],
    });
    expect(() =>
      resolvedPolicy(
        ['scenario-program' as VerificationComparisonAllowedMismatchField],
        'comparison-policy.unsafe-program'
      )
    ).toThrow('valid full Policy');
  });

  it('accepts only an exact resolver-branded full-Policy projection', () => {
    const document = policy(['operating-system'], 'comparison-policy.resolved');
    const policyDigest = digestVerificationValue(
      normalizeVerificationPolicy(document)
    );
    const resolved = resolveVerificationComparisonPolicy(
      document,
      policyDigest
    );
    expect(resolved).toEqual({
      authority: 'verification-policy',
      policyId: 'comparison-policy.resolved',
      policyDigest,
      allowedMismatchFields: ['operating-system'],
    });

    expect(() =>
      resolveVerificationComparisonPolicy(document, digestVerificationValue({}))
    ).toThrow('does not match');

    const changedAllowlist = policy(
      ['browser-engine', 'operating-system'],
      'comparison-policy.resolved'
    );
    expect(
      digestVerificationValue(normalizeVerificationPolicy(changedAllowlist))
    ).not.toBe(policyDigest);

    const left = evidence('evidence:left');
    const right = evidence('evidence:right', {
      run: {
        ...left.run,
        runId: 'run:right',
        operatingSystemIdentity: 'windows-x64',
      },
    });
    expect(() =>
      compareVerificationEvidenceCompatibility(left, right, {
        id: 'comparison-policy.legacy',
        digest: policyDigest,
        allowedMismatchFields: ['operating-system'],
      } as unknown as VerificationComparisonPolicy)
    ).toThrow('resolver-owned projection');
    expect(() =>
      compareVerificationEvidenceCompatibility(
        left,
        right,
        structuredClone(resolved)
      )
    ).toThrow('resolver-owned projection');
  });

  it('compares the complete matrix and normalization identity before diffing', () => {
    const left = evidence('evidence:left');
    const right = evidence('evidence:right', {
      run: {
        ...left.run,
        runId: 'run:right',
        viewport: { id: 'mobile', width: 390, height: 844 },
        devicePixelRatio: 3,
        colorScheme: 'light',
        motion: 'full',
        locale: 'zh-CN',
        timezone: 'Asia/Shanghai',
        fontSetDigest: 'sha256-other-fonts',
        sandboxImageDigest: 'sha256-other-sandbox',
      },
      normalization: {
        ...left.normalization,
        packageName: '@prodivix/verification-next',
        packageVersion: '0.1.0',
        buildDigest: 'sha256-other-normalization-build',
        toolchainDigest: 'sha256-other-normalization-toolchain',
        schemaDigest: 'sha256-other-normalization-schema',
      },
    });
    const expectedMismatches = [
      'color-scheme',
      'device-pixel-ratio',
      'font-set',
      'locale',
      'motion',
      'normalization-build',
      'normalization-package',
      'normalization-schema',
      'normalization-toolchain',
      'normalization-version',
      'sandbox-image',
      'timezone',
      'viewport',
    ] as const;
    expect(compareVerificationEvidenceCompatibility(left, right)).toMatchObject(
      {
        compatibility: 'view-only',
        mismatchFields: expectedMismatches,
      }
    );
    expect(
      compareVerificationEvidenceCompatibility(
        left,
        right,
        resolvedPolicy(
          expectedMismatches,
          'comparison-policy.environment-normalization'
        )
      )
    ).toMatchObject({
      compatibility: 'policy-compatible',
      mismatchFields: expectedMismatches,
    });
  });

  it('rejects target lineage drift and never lets policy make it compatible', () => {
    const left = evidence('evidence:left');
    const right = evidence('evidence:right', {
      targetId: 'target:vue-vite',
      targetPolicy: {
        ...left.targetPolicy,
        semanticTargetId: 'target:vue-vite',
      },
    });
    expect(compareVerificationEvidenceCompatibility(left, right)).toMatchObject(
      {
        compatibility: 'incompatible',
        mismatchFields: ['target-id', 'target-policy'],
      }
    );
    expect(() =>
      resolvedPolicy(
        ['target-id' as VerificationComparisonAllowedMismatchField],
        'comparison-policy.unsafe-target'
      )
    ).toThrow('valid full Policy');
  });

  it('sorts mismatch fields and policy fields before digesting', () => {
    const left = evidence('evidence:left');
    const right = evidence('evidence:right', {
      inputs: {
        ...left.inputs,
        baselineSetDigest: 'sha256-other-baseline',
      },
      toolchain: {
        ...left.toolchain,
        packageVersion: '4.3.0',
        buildDigest: 'sha256-other-build',
      },
    });
    const first = compareVerificationEvidenceCompatibility(
      left,
      right,
      resolvedPolicy(
        ['tool-version', 'baseline-set', 'tool-build'],
        'comparison-policy.upgrade'
      )
    );
    const second = compareVerificationEvidenceCompatibility(
      left,
      right,
      resolvedPolicy(
        ['tool-build', 'tool-version', 'baseline-set'],
        'comparison-policy.upgrade'
      )
    );
    expect(first).toMatchObject({
      compatibility: 'policy-compatible',
      mismatchFields: ['baseline-set', 'tool-build', 'tool-version'],
    });
    expect(second.comparisonDigest).toBe(first.comparisonDigest);
    expect(() => resolvedPolicy([], ' comparison-policy.upgrade')).toThrow(
      'valid full Policy'
    );
  });
});
