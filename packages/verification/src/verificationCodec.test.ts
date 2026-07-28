import { describe, expect, it } from 'vitest';
import { BEHAVIOR_DIAGNOSTIC_REGISTRY } from '@prodivix/behavior';
import {
  buildDiagnosticPresentation,
  createDiagnosticIssueCollectionState,
  queryDiagnosticIssues,
  upsertDiagnosticProviderSnapshot,
} from '@prodivix/diagnostics';
import {
  VERIFICATION_DIAGNOSTIC_REGISTRY,
  decodeVerificationBaselineSet,
  decodeVerificationPolicy,
  digestVerificationValue,
  encodeVerificationBaselineSet,
  encodeVerificationPolicy,
  validateVerificationDocument,
  verificationPolicyWireSchema,
  type VerificationBaselineSet,
  type VerificationPolicy,
} from './index';

const digest = `sha256-${'b'.repeat(64)}`;

export const verificationPolicyFixture: VerificationPolicy = {
  id: 'policy.default',
  name: 'Default verification policy',
  defaultRequirement: 'advisory',
  rules: [
    {
      id: 'rule.critical-browser',
      requirement: 'required',
      checkKinds: ['e2e', 'visual'],
      scenarioIds: [],
      scenarioTags: [],
      criticalities: ['critical'],
      impactedDomains: [],
      riskFlags: [],
      matrixProfileId: 'matrix.critical-browser',
      retryPolicyId: 'retry.infrastructure',
      evidenceTrust: 'ci-attested',
      controlProfileRef: {
        kind: 'workspace',
        documentId: 'control.hermetic',
        digest,
      },
      fixtureSetRef: {
        documentId: 'fixture.catalog',
        digest,
      },
      baselineSetRef: {
        documentId: 'baseline.catalog',
        digest,
      },
    },
  ],
  matrixProfiles: [
    {
      id: 'matrix.critical-browser',
      name: 'Critical browser matrix',
      matrix: {
        frameworkTargets: ['react-vite'],
        surfaces: ['ci', 'export', 'preview'],
        browserEngines: ['chromium'],
        viewports: [{ id: 'desktop', width: 1280, height: 720 }],
        colorSchemes: ['dark', 'light'],
        motions: ['full', 'reduced'],
        locales: ['en-US'],
      },
    },
  ],
  budgets: {
    maximumCells: 500,
    maximumCellsPerCheckKind: 100,
    maximumTargetExpansions: 8,
    maximumBrowserExpansions: 3,
    maximumClosureEvidenceRecords: 1_000,
    totalMs: 600_000,
    artifactBytes: 100_000_000,
    estimatedComputeUnits: 10_000,
    parallelism: 8,
  },
  retryPolicies: [
    {
      id: 'retry.infrastructure',
      maximumAttempts: 2,
      retryableOutcomes: ['infrastructure-error'],
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
    allowedMismatchFields: ['browser-engine', 'operating-system'],
  },
  evidenceRequirements: {
    acceptedTrust: ['ci-attested'],
    maximumAgeMs: 86_400_000,
    requireAttestation: true,
    requireCompatibleIdentity: true,
    requiredArtifactKinds: ['replay-record', 'screenshot'],
  },
  baselinePolicy: {
    visual: 'required-when-observed',
    requireCompatibleIdentity: true,
  },
  retentionRequest: {
    successful: 'change',
    failed: 'release',
    protectReleaseEvidence: true,
  },
};

export const verificationBaselineSetFixture: VerificationBaselineSet = {
  id: 'baseline.catalog',
  name: 'Catalog visual baselines',
  entries: [
    {
      id: 'baseline.catalog.empty',
      scenarioId: 'scenario.catalog.create',
      stepId: 'step.observe',
      targetId: 'catalog.list',
      frameworkTarget: 'react-vite',
      surface: 'ci',
      browserEngine: 'chromium',
      viewport: {
        id: 'desktop',
        width: 1280,
        height: 720,
      },
      colorScheme: 'light',
      motion: 'reduced',
      locale: 'en-US',
      devicePixelRatio: 1,
      asset: {
        assetDocumentId: 'asset.baseline.catalog.empty',
        digest,
        mediaType: 'image/png',
      },
      normalizerDigest: digest,
      adoptedAt: '2026-07-20T00:00:00Z',
      adoptedBy: 'principal.owner',
    },
  ],
};

describe('Verification document codecs', () => {
  it('pins the strict VerificationPolicy wire schema', () => {
    expect(digestVerificationValue(verificationPolicyWireSchema)).toBe(
      'sha256-8e5c0fa96f23ea2945e30cef3e3abc66ee4bb5a37a660d9f6561b43d0c4159c6'
    );
  });

  it('round-trips Policy and BaselineSet without current-model wire versions', () => {
    const policy = decodeVerificationPolicy(
      encodeVerificationPolicy(verificationPolicyFixture)
    );
    const baseline = decodeVerificationBaselineSet(
      encodeVerificationBaselineSet(verificationBaselineSetFixture)
    );

    expect(policy).toEqual({ ok: true, value: verificationPolicyFixture });
    expect(baseline).toEqual({
      ok: true,
      value: verificationBaselineSetFixture,
    });
    expect(Object.hasOwn(policy.ok ? policy.value : {}, 'wireVersion')).toBe(
      false
    );
  });

  it('fails closed for future wire versions and duplicate baseline identity', () => {
    expect(
      decodeVerificationPolicy({
        ...encodeVerificationPolicy(verificationPolicyFixture),
        wireVersion: 2,
      })
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'VER-2001', path: '/wireVersion' }],
    });

    expect(
      validateVerificationDocument('verification-baseline-set', {
        ...verificationBaselineSetFixture,
        entries: [
          verificationBaselineSetFixture.entries[0],
          {
            ...verificationBaselineSetFixture.entries[0],
            id: 'baseline.catalog.duplicate',
          },
        ],
      }).ok
    ).toBe(false);
  });

  it('rejects a duplicate policy selector with conflicting closure requirements', () => {
    expect(
      validateVerificationDocument('verification-policy', {
        ...verificationPolicyFixture,
        rules: [
          verificationPolicyFixture.rules[0],
          {
            ...verificationPolicyFixture.rules[0],
            id: 'rule.conflict',
            requirement: 'advisory',
          },
        ],
      }).ok
    ).toBe(false);

    expect(
      validateVerificationDocument('verification-policy', {
        ...verificationPolicyFixture,
        rules: [
          {
            ...verificationPolicyFixture.rules[0],
            matrixProfileId: 'matrix.missing',
          },
        ],
      }).ok
    ).toBe(false);
  });

  it('rejects impossible retry sampling and non-canonical exemption instants', () => {
    expect(
      validateVerificationDocument('verification-policy', {
        ...verificationPolicyFixture,
        retryPolicies: [
          {
            ...verificationPolicyFixture.retryPolicies[0],
            maximumAttempts: 1,
            stabilitySamples: 2,
          },
        ],
      }).ok
    ).toBe(false);

    expect(
      validateVerificationDocument('verification-policy', {
        ...verificationPolicyFixture,
        exemptions: [
          {
            id: 'exemption.invalid-instant',
            ruleId: verificationPolicyFixture.rules[0]!.id,
            targetId: 'scenario.catalog.create',
            reason: 'Invalid UTC instant must fail closed.',
            actorRef: 'principal.owner',
            createdAt: '2026-07-28T08:00:00+08:00',
            expiresAt: '2026-07-29T00:00:00.000Z',
            reducesTo: 'advisory',
            issueRef: 'issue.invalid-instant',
          },
        ],
      }).ok
    ).toBe(false);
  });

  it('canonicalizes artifact capture overrides and rejects duplicate or privileged retention input', () => {
    const encoded = encodeVerificationPolicy({
      ...verificationPolicyFixture,
      artifactCapture: {
        defaultCapture: 'masked',
        targets: [
          { targetId: 'target.z', capture: 'allowed' },
          { targetId: 'target.a', capture: 'forbidden-sensitive' },
        ],
      },
    });
    const decoded = decodeVerificationPolicy(encoded);
    expect(decoded).toMatchObject({
      ok: true,
      value: {
        artifactCapture: {
          defaultCapture: 'masked',
          targets: [
            { targetId: 'target.a', capture: 'forbidden-sensitive' },
            { targetId: 'target.z', capture: 'allowed' },
          ],
        },
      },
    });

    expect(
      validateVerificationDocument('verification-policy', {
        ...verificationPolicyFixture,
        artifactCapture: {
          defaultCapture: 'allowed',
          targets: [
            { targetId: 'target.same', capture: 'allowed' },
            { targetId: 'target.same', capture: 'masked' },
          ],
        },
      })
    ).toMatchObject({
      ok: false,
      issues: [{ path: '/artifactCapture/targets/1/targetId' }],
    });

    const privilegedRetention = structuredClone(
      encodeVerificationPolicy(verificationPolicyFixture)
    ) as unknown as {
      retentionRequest: { successful: string };
    };
    privilegedRetention.retentionRequest.successful = 'legal-hold';
    expect(decodeVerificationPolicy(privilegedRetention)).toMatchObject({
      ok: false,
      issues: [{ path: '/retentionRequest/successful' }],
    });
  });

  it('owns a strict canonical comparison mismatch allowlist in Policy', () => {
    const unsorted: VerificationPolicy = {
      ...verificationPolicyFixture,
      comparison: {
        allowedMismatchFields: ['operating-system', 'browser-engine'],
      },
    };
    expect(encodeVerificationPolicy(unsorted)).toMatchObject({
      comparison: {
        allowedMismatchFields: ['browser-engine', 'operating-system'],
      },
    });

    const duplicate = {
      ...verificationPolicyFixture,
      comparison: {
        allowedMismatchFields: ['browser-engine', 'browser-engine'],
      },
    } as VerificationPolicy;
    expect(() => encodeVerificationPolicy(duplicate)).toThrow();

    const forbidden = structuredClone(
      encodeVerificationPolicy(verificationPolicyFixture)
    ) as unknown as {
      comparison: { allowedMismatchFields: string[] };
    };
    forbidden.comparison.allowedMismatchFields = ['check-id'];
    expect(decodeVerificationPolicy(forbidden)).toMatchObject({ ok: false });

    const missing = structuredClone(
      encodeVerificationPolicy(verificationPolicyFixture)
    ) as unknown as { comparison?: unknown };
    delete missing.comparison;
    expect(decodeVerificationPolicy(missing)).toMatchObject({ ok: false });

    const unknown = structuredClone(
      encodeVerificationPolicy(verificationPolicyFixture)
    );
    const comparison = unknown.comparison as typeof unknown.comparison &
      Record<string, unknown>;
    comparison.legacyId = 'comparison:legacy';
    expect(decodeVerificationPolicy(unknown)).toMatchObject({ ok: false });
  });

  it('exports the complete VER registry under the Verification domain', () => {
    expect(Object.keys(VERIFICATION_DIAGNOSTIC_REGISTRY)).toHaveLength(18);
    expect(VERIFICATION_DIAGNOSTIC_REGISTRY['VER-5002']).toMatchObject({
      domain: 'verification',
      severity: 'fatal',
      stage: 'promote',
    });
    const exemptionDefinition = VERIFICATION_DIAGNOSTIC_REGISTRY['VER-2002'];
    const presentation = buildDiagnosticPresentation({
      diagnostic: {
        code: exemptionDefinition.code,
        domain: exemptionDefinition.domain,
        severity: exemptionDefinition.severity,
        message: 'The exemption expired.',
        targetRef: {
          kind: 'verification-policy',
          documentId: 'policy.default',
        },
      },
      definition: exemptionDefinition,
    });
    expect(
      presentation.actions.find(({ id }) => id === 'create-exemption')
    ).toMatchObject({ enabled: true });
  });

  it('projects BHV and VER registry diagnostics into the unified Issues store', () => {
    const behavior = BEHAVIOR_DIAGNOSTIC_REGISTRY['BHV-1001'];
    const verification = VERIFICATION_DIAGNOSTIC_REGISTRY['VER-2001'];
    const result = upsertDiagnosticProviderSnapshot(
      createDiagnosticIssueCollectionState('workspace-g3'),
      {
        providerId: 'g3-contract-validator',
        workspaceId: 'workspace-g3',
        revision: { key: 'workspace-1', sequence: 1 },
        collectedAt: 1,
        diagnostics: [
          {
            code: behavior.code,
            domain: behavior.domain,
            severity: behavior.severity,
            message: 'Scenario contract is invalid.',
            targetRef: {
              kind: 'behavior-scenario',
              documentId: 'scenario.catalog',
            },
          },
          {
            code: verification.code,
            domain: verification.domain,
            severity: verification.severity,
            message: 'Policy contract is invalid.',
            targetRef: {
              kind: 'verification-policy',
              documentId: 'policy.default',
            },
          },
        ],
      }
    );
    expect(result.status).toBe('updated');
    expect(
      queryDiagnosticIssues(result.state, {
        domains: ['behavior', 'verification'],
      }).map(({ diagnostic }) => diagnostic.code)
    ).toEqual(['BHV-1001', 'VER-2001']);
  });
});
