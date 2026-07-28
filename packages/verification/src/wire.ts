import { verificationArtifactEnvelopeWireSchema } from './verificationArtifactEnvelopeSchema';
import { verificationEvidenceCandidateWireSchema } from './verificationEvidenceCandidateSchema';
import { verificationEvidenceManifestWireSchema } from './verificationEvidenceManifestCodec';
import { verificationEvidenceVerifiedViewWireSchema } from './verificationEvidenceVerifiedViewCodec';
import {
  MAXIMUM_VERIFICATION_COMPARISON_ALLOWED_MISMATCH_FIELDS,
  VERIFICATION_COMPARISON_ALLOWED_MISMATCH_FIELDS,
} from './verificationComparisonPolicyFields';
import { MAXIMUM_VERIFICATION_CLOSURE_EVIDENCE_RECORDS } from './verificationPlannerGraph';

const canonicalStringSchema = {
  type: 'string',
  minLength: 1,
  maxLength: 512,
  pattern: '^\\S(?:[\\s\\S]*\\S)?$',
} as const;

const canonicalIdSchema = {
  ...canonicalStringSchema,
  maxLength: 256,
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$',
} as const;

const digestSchema = {
  type: 'string',
  pattern: '^sha256-[a-f0-9]{64}$',
} as const;

const canonicalIdArraySchema = {
  type: 'array',
  maxItems: 512,
  uniqueItems: true,
  items: { $ref: '#/$defs/canonicalId' },
} as const;

const controlProfileRefSchema = {
  oneOf: [
    {
      type: 'object',
      required: ['kind', 'documentId'],
      properties: {
        kind: { const: 'workspace' },
        documentId: { $ref: '#/$defs/canonicalId' },
        digest: { $ref: '#/$defs/digest' },
      },
      additionalProperties: false,
    },
    {
      type: 'object',
      required: ['kind', 'presetId', 'digest'],
      properties: {
        kind: { const: 'preset' },
        presetId: { $ref: '#/$defs/canonicalId' },
        digest: { $ref: '#/$defs/digest' },
      },
      additionalProperties: false,
    },
  ],
} as const;

const documentDigestRefSchema = {
  type: 'object',
  required: ['documentId'],
  properties: {
    documentId: { $ref: '#/$defs/canonicalId' },
    digest: { $ref: '#/$defs/digest' },
  },
  additionalProperties: false,
} as const;

const viewportSchema = {
  type: 'object',
  required: ['id', 'width', 'height'],
  properties: {
    id: { $ref: '#/$defs/canonicalId' },
    width: {
      type: 'integer',
      minimum: 1,
      maximum: 16_384,
    },
    height: {
      type: 'integer',
      minimum: 1,
      maximum: 16_384,
    },
  },
  additionalProperties: false,
} as const;

const matrixSchema = {
  type: 'object',
  required: [
    'frameworkTargets',
    'surfaces',
    'browserEngines',
    'viewports',
    'colorSchemes',
    'motions',
    'locales',
  ],
  properties: {
    frameworkTargets: {
      type: 'array',
      minItems: 1,
      maxItems: 32,
      uniqueItems: true,
      items: { $ref: '#/$defs/canonicalId' },
    },
    surfaces: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      uniqueItems: true,
      items: { enum: ['preview', 'export', 'ci'] },
    },
    browserEngines: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      uniqueItems: true,
      items: { enum: ['chromium', 'firefox', 'webkit'] },
    },
    viewports: {
      type: 'array',
      minItems: 1,
      maxItems: 64,
      items: { $ref: '#/$defs/viewport' },
    },
    colorSchemes: {
      type: 'array',
      minItems: 1,
      maxItems: 2,
      uniqueItems: true,
      items: { enum: ['light', 'dark'] },
    },
    motions: {
      type: 'array',
      minItems: 1,
      maxItems: 2,
      uniqueItems: true,
      items: { enum: ['full', 'reduced'] },
    },
    locales: {
      type: 'array',
      minItems: 1,
      maxItems: 64,
      uniqueItems: true,
      items: { $ref: '#/$defs/canonicalString' },
    },
  },
  additionalProperties: false,
} as const;

const checkKindSchema = {
  enum: [
    'diagnostics',
    'build',
    'unit',
    'integration',
    'e2e',
    'visual',
    'accessibility',
    'performance',
    'security',
  ],
} as const;

const evidenceTrustSchema = {
  enum: [
    'local-unattested',
    'remote-attested',
    'ci-attested',
    'imported-untrusted',
  ],
} as const;

const artifactKindSchema = {
  enum: [
    'screenshot',
    'visual-diff',
    'accessibility-report',
    'trace',
    'network-summary',
    'console-summary',
    'coverage-summary',
    'performance-profile',
    'security-report',
    'build-log',
    'replay-record',
  ],
} as const;

const artifactCaptureSchema = {
  enum: ['allowed', 'masked', 'forbidden-sensitive'],
} as const;

const candidateRetentionClassSchema = {
  enum: ['session', 'change', 'release'],
} as const;

/** Numeric evolution metadata is intentionally confined to this wire schema. */
export const verificationPolicyWireSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://prodivix.dev/schemas/verification/policy/v1.json',
  title: 'Prodivix VerificationPolicy wire document',
  type: 'object',
  required: [
    'wireVersion',
    'id',
    'name',
    'defaultRequirement',
    'rules',
    'matrixProfiles',
    'retryPolicies',
    'exemptions',
    'budgets',
    'artifactCapture',
    'comparison',
    'evidenceRequirements',
    'baselinePolicy',
    'retentionRequest',
  ],
  properties: {
    wireVersion: { const: 1 },
    id: { $ref: '#/$defs/canonicalId' },
    name: { $ref: '#/$defs/canonicalString' },
    defaultRequirement: {
      enum: ['required', 'advisory', 'forbidden'],
    },
    rules: {
      type: 'array',
      minItems: 1,
      maxItems: 512,
      items: { $ref: '#/$defs/rule' },
    },
    matrixProfiles: {
      type: 'array',
      minItems: 1,
      maxItems: 128,
      items: { $ref: '#/$defs/matrixProfile' },
    },
    retryPolicies: {
      type: 'array',
      minItems: 1,
      maxItems: 128,
      items: { $ref: '#/$defs/retryPolicy' },
    },
    exemptions: {
      type: 'array',
      maxItems: 512,
      items: { $ref: '#/$defs/exemption' },
    },
    artifactCapture: { $ref: '#/$defs/artifactCapturePolicy' },
    comparison: { $ref: '#/$defs/comparisonPolicy' },
    budgets: {
      type: 'object',
      required: [
        'maximumCells',
        'maximumCellsPerCheckKind',
        'maximumTargetExpansions',
        'maximumBrowserExpansions',
        'maximumClosureEvidenceRecords',
        'totalMs',
        'artifactBytes',
        'estimatedComputeUnits',
        'parallelism',
      ],
      properties: {
        maximumCells: {
          type: 'integer',
          minimum: 1,
          maximum: 100_000,
        },
        maximumCellsPerCheckKind: {
          type: 'integer',
          minimum: 1,
          maximum: 100_000,
        },
        maximumTargetExpansions: {
          type: 'integer',
          minimum: 1,
          maximum: 1_024,
        },
        maximumBrowserExpansions: {
          type: 'integer',
          minimum: 1,
          maximum: 3,
        },
        maximumClosureEvidenceRecords: {
          type: 'integer',
          minimum: 1,
          maximum: MAXIMUM_VERIFICATION_CLOSURE_EVIDENCE_RECORDS,
        },
        totalMs: {
          type: 'integer',
          minimum: 1,
          maximum: 604_800_000,
        },
        artifactBytes: {
          type: 'integer',
          minimum: 0,
          maximum: 10_737_418_240,
        },
        estimatedComputeUnits: {
          type: 'integer',
          minimum: 1,
          maximum: 1_000_000_000,
        },
        parallelism: {
          type: 'integer',
          minimum: 1,
          maximum: 1_024,
        },
      },
      additionalProperties: false,
    },
    evidenceRequirements: {
      $ref: '#/$defs/evidenceRequirements',
    },
    baselinePolicy: {
      type: 'object',
      required: ['visual', 'requireCompatibleIdentity'],
      properties: {
        visual: {
          enum: ['required-when-observed', 'advisory', 'forbidden'],
        },
        requireCompatibleIdentity: { const: true },
      },
      additionalProperties: false,
    },
    retentionRequest: {
      type: 'object',
      required: ['successful', 'failed', 'protectReleaseEvidence'],
      properties: {
        successful: { $ref: '#/$defs/candidateRetentionClass' },
        failed: { $ref: '#/$defs/candidateRetentionClass' },
        protectReleaseEvidence: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
  $defs: {
    canonicalString: canonicalStringSchema,
    canonicalId: canonicalIdSchema,
    digest: digestSchema,
    canonicalIdArray: canonicalIdArraySchema,
    controlProfileRef: controlProfileRefSchema,
    documentDigestRef: documentDigestRefSchema,
    viewport: viewportSchema,
    matrix: matrixSchema,
    checkKind: checkKindSchema,
    evidenceTrust: evidenceTrustSchema,
    artifactKind: artifactKindSchema,
    artifactCapture: artifactCaptureSchema,
    candidateRetentionClass: candidateRetentionClassSchema,
    artifactCaptureTarget: {
      type: 'object',
      required: ['targetId', 'capture'],
      properties: {
        targetId: { $ref: '#/$defs/canonicalId' },
        capture: { $ref: '#/$defs/artifactCapture' },
      },
      additionalProperties: false,
    },
    artifactCapturePolicy: {
      type: 'object',
      required: ['defaultCapture', 'targets'],
      properties: {
        defaultCapture: { $ref: '#/$defs/artifactCapture' },
        targets: {
          type: 'array',
          maxItems: 512,
          items: { $ref: '#/$defs/artifactCaptureTarget' },
        },
      },
      additionalProperties: false,
    },
    matrixProfile: {
      type: 'object',
      required: ['id', 'name', 'matrix'],
      properties: {
        id: { $ref: '#/$defs/canonicalId' },
        name: { $ref: '#/$defs/canonicalString' },
        matrix: { $ref: '#/$defs/matrix' },
      },
      additionalProperties: false,
    },
    retryPolicy: {
      type: 'object',
      required: [
        'id',
        'maximumAttempts',
        'retryableOutcomes',
        'stabilitySamples',
        'freshFixtureNamespace',
      ],
      properties: {
        id: { $ref: '#/$defs/canonicalId' },
        maximumAttempts: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
        },
        retryableOutcomes: {
          type: 'array',
          maxItems: 1,
          uniqueItems: true,
          items: { const: 'infrastructure-error' },
        },
        stabilitySamples: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
        },
        freshFixtureNamespace: { const: true },
      },
      additionalProperties: false,
    },
    comparisonPolicy: {
      type: 'object',
      required: ['allowedMismatchFields'],
      properties: {
        allowedMismatchFields: {
          type: 'array',
          maxItems: MAXIMUM_VERIFICATION_COMPARISON_ALLOWED_MISMATCH_FIELDS,
          uniqueItems: true,
          items: {
            enum: VERIFICATION_COMPARISON_ALLOWED_MISMATCH_FIELDS,
          },
        },
      },
      additionalProperties: false,
    },
    evidenceRequirements: {
      type: 'object',
      required: [
        'acceptedTrust',
        'maximumAgeMs',
        'requireAttestation',
        'requireCompatibleIdentity',
        'requiredArtifactKinds',
      ],
      properties: {
        acceptedTrust: {
          type: 'array',
          minItems: 1,
          maxItems: 4,
          uniqueItems: true,
          items: { $ref: '#/$defs/evidenceTrust' },
        },
        maximumAgeMs: {
          type: 'integer',
          minimum: 1,
          maximum: 31_536_000_000,
        },
        requireAttestation: { type: 'boolean' },
        requireCompatibleIdentity: { const: true },
        requiredArtifactKinds: {
          type: 'array',
          maxItems: 11,
          uniqueItems: true,
          items: { $ref: '#/$defs/artifactKind' },
        },
      },
      additionalProperties: false,
    },
    rule: {
      type: 'object',
      required: [
        'id',
        'requirement',
        'checkKinds',
        'scenarioIds',
        'scenarioTags',
        'criticalities',
        'impactedDomains',
        'riskFlags',
        'matrixProfileId',
        'retryPolicyId',
        'evidenceTrust',
        'controlProfileRef',
      ],
      properties: {
        id: { $ref: '#/$defs/canonicalId' },
        requirement: { enum: ['required', 'advisory', 'forbidden'] },
        checkKinds: {
          type: 'array',
          minItems: 1,
          maxItems: 9,
          uniqueItems: true,
          items: { $ref: '#/$defs/checkKind' },
        },
        scenarioIds: { $ref: '#/$defs/canonicalIdArray' },
        scenarioTags: { $ref: '#/$defs/canonicalIdArray' },
        criticalities: {
          type: 'array',
          maxItems: 3,
          uniqueItems: true,
          items: { enum: ['smoke', 'standard', 'critical'] },
        },
        impactedDomains: { $ref: '#/$defs/canonicalIdArray' },
        riskFlags: { $ref: '#/$defs/canonicalIdArray' },
        matrixProfileId: { $ref: '#/$defs/canonicalId' },
        retryPolicyId: { $ref: '#/$defs/canonicalId' },
        evidenceTrust: { $ref: '#/$defs/evidenceTrust' },
        controlProfileRef: { $ref: '#/$defs/controlProfileRef' },
        fixtureSetRef: { $ref: '#/$defs/documentDigestRef' },
        baselineSetRef: { $ref: '#/$defs/documentDigestRef' },
      },
      additionalProperties: false,
    },
    exemption: {
      type: 'object',
      required: [
        'id',
        'ruleId',
        'targetId',
        'reason',
        'actorRef',
        'createdAt',
        'expiresAt',
        'reducesTo',
        'issueRef',
      ],
      properties: {
        id: { $ref: '#/$defs/canonicalId' },
        ruleId: { $ref: '#/$defs/canonicalId' },
        targetId: { $ref: '#/$defs/canonicalId' },
        reason: {
          type: 'string',
          minLength: 1,
          maxLength: 4_096,
        },
        actorRef: { $ref: '#/$defs/canonicalId' },
        createdAt: { $ref: '#/$defs/canonicalString' },
        expiresAt: { $ref: '#/$defs/canonicalString' },
        reducesTo: { const: 'advisory' },
        issueRef: { $ref: '#/$defs/canonicalId' },
      },
      additionalProperties: false,
    },
  },
} as const;

export const verificationBaselineSetWireSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://prodivix.dev/schemas/verification/baseline-set/v1.json',
  title: 'Prodivix VerificationBaselineSet wire document',
  type: 'object',
  required: ['wireVersion', 'id', 'name', 'entries'],
  properties: {
    wireVersion: { const: 1 },
    id: { $ref: '#/$defs/canonicalId' },
    name: { $ref: '#/$defs/canonicalString' },
    entries: {
      type: 'array',
      maxItems: 10_000,
      items: { $ref: '#/$defs/entry' },
    },
  },
  additionalProperties: false,
  $defs: {
    canonicalString: canonicalStringSchema,
    canonicalId: canonicalIdSchema,
    digest: digestSchema,
    viewport: viewportSchema,
    entry: {
      type: 'object',
      required: [
        'id',
        'scenarioId',
        'stepId',
        'targetId',
        'frameworkTarget',
        'surface',
        'viewport',
        'colorScheme',
        'motion',
        'locale',
        'devicePixelRatio',
        'asset',
        'normalizerDigest',
        'adoptedAt',
        'adoptedBy',
      ],
      properties: {
        id: { $ref: '#/$defs/canonicalId' },
        scenarioId: { $ref: '#/$defs/canonicalId' },
        stepId: { $ref: '#/$defs/canonicalId' },
        targetId: { $ref: '#/$defs/canonicalId' },
        frameworkTarget: { $ref: '#/$defs/canonicalId' },
        surface: { enum: ['preview', 'export', 'ci'] },
        browserEngine: { enum: ['chromium', 'firefox', 'webkit'] },
        viewport: { $ref: '#/$defs/viewport' },
        colorScheme: { enum: ['light', 'dark'] },
        motion: { enum: ['full', 'reduced'] },
        locale: { $ref: '#/$defs/canonicalString' },
        devicePixelRatio: {
          type: 'number',
          exclusiveMinimum: 0,
          maximum: 8,
        },
        asset: {
          type: 'object',
          required: ['assetDocumentId', 'digest', 'mediaType'],
          properties: {
            assetDocumentId: { $ref: '#/$defs/canonicalId' },
            digest: { $ref: '#/$defs/digest' },
            mediaType: {
              type: 'string',
              pattern:
                '^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$',
              maxLength: 127,
            },
          },
          additionalProperties: false,
        },
        normalizerDigest: { $ref: '#/$defs/digest' },
        adoptedAt: { $ref: '#/$defs/canonicalString' },
        adoptedBy: { $ref: '#/$defs/canonicalId' },
      },
      additionalProperties: false,
    },
  },
} as const;

export const VERIFICATION_PLAN_WIRE_VERSION = 1 as const;

export const verificationPlanWireSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://prodivix.dev/schemas/verification-plan.v1.schema.json',
  title: 'VerificationPlanWire',
  type: 'object',
  required: [
    'wireVersion',
    'status',
    'workspaceId',
    'targetRevision',
    'targetPartitionRevisions',
    'scenarioRegistryDigest',
    'policyRevision',
    'policyDigest',
    'retentionRequest',
    'policyEvaluationInstant',
    'impactDigest',
    'semanticSchemaDigest',
    'providerSetDigest',
    'compilerDigest',
    'plannerDigest',
    'adapterRegistryDigest',
    'planDigest',
    'cells',
    'issues',
    'explanations',
    'budget',
  ],
  properties: {
    wireVersion: { const: VERIFICATION_PLAN_WIRE_VERSION },
    status: { enum: ['ready', 'blocked'] },
    workspaceId: { $ref: '#/$defs/canonicalId' },
    targetRevision: { $ref: '#/$defs/nonNegativeSafeInteger' },
    targetPartitionRevisions: { $ref: '#/$defs/partitionRevisions' },
    scenarioRegistryDigest: { $ref: '#/$defs/digest' },
    policyRevision: { $ref: '#/$defs/nonNegativeSafeInteger' },
    policyDigest: { $ref: '#/$defs/digest' },
    retentionRequest: {
      type: 'object',
      required: ['successful', 'failed', 'protectReleaseEvidence'],
      properties: {
        successful: { enum: ['session', 'change', 'release'] },
        failed: { enum: ['session', 'change', 'release'] },
        protectReleaseEvidence: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    policyEvaluationInstant: { $ref: '#/$defs/canonicalString' },
    impactDigest: { $ref: '#/$defs/digest' },
    semanticSchemaDigest: { $ref: '#/$defs/digest' },
    providerSetDigest: { $ref: '#/$defs/digest' },
    compilerDigest: { $ref: '#/$defs/digest' },
    plannerDigest: { $ref: '#/$defs/digest' },
    adapterRegistryDigest: { $ref: '#/$defs/digest' },
    planDigest: { $ref: '#/$defs/sha256Digest' },
    cells: {
      type: 'array',
      maxItems: MAXIMUM_VERIFICATION_CLOSURE_EVIDENCE_RECORDS,
      items: { $ref: '#/$defs/planCell' },
    },
    issues: {
      type: 'array',
      maxItems: 10_000,
      items: { $ref: '#/$defs/planIssue' },
    },
    explanations: {
      type: 'array',
      maxItems: 10_000,
      items: { $ref: '#/$defs/planExplanation' },
    },
    budget: { $ref: '#/$defs/planBudget' },
  },
  additionalProperties: false,
  $defs: {
    canonicalString: canonicalStringSchema,
    canonicalId: {
      ...canonicalStringSchema,
      maxLength: 4_096,
    },
    digest: canonicalStringSchema,
    sha256Digest: digestSchema,
    nonNegativeSafeInteger:
      verificationEvidenceCandidateWireSchema.$defs.nonNegativeSafeInteger,
    positiveSafeInteger:
      verificationEvidenceCandidateWireSchema.$defs.positiveSafeInteger,
    revisionPair: verificationEvidenceCandidateWireSchema.$defs.revisionPair,
    partitionRevisions:
      verificationEvidenceCandidateWireSchema.$defs.partitionRevisions,
    controlProfileRef: controlProfileRefSchema,
    documentDigestRef: documentDigestRefSchema,
    viewport: viewportSchema,
    retryPolicy: verificationPolicyWireSchema.$defs.retryPolicy,
    evidenceRequirements:
      verificationPolicyWireSchema.$defs.evidenceRequirements,
    targetPolicy: verificationEvidenceCandidateWireSchema.$defs.targetPolicy,
    canonicalIdArray: {
      type: 'array',
      maxItems: 1_000,
      uniqueItems: true,
      items: { $ref: '#/$defs/canonicalId' },
    },
    canonicalStringArray: {
      type: 'array',
      maxItems: 1_000,
      uniqueItems: true,
      items: { $ref: '#/$defs/canonicalString' },
    },
    adapterIdentity: {
      type: 'object',
      required: ['adapterId', 'toolchainDigest', 'capabilityDigest'],
      properties: {
        adapterId: { $ref: '#/$defs/canonicalId' },
        toolchainDigest: { $ref: '#/$defs/digest' },
        capabilityDigest: { $ref: '#/$defs/digest' },
      },
      additionalProperties: false,
    },
    planResource: {
      type: 'object',
      required: ['key', 'mode'],
      properties: {
        key: { $ref: '#/$defs/canonicalString' },
        mode: { enum: ['shared', 'exclusive'] },
      },
      additionalProperties: false,
    },
    checkCost: {
      type: 'object',
      required: ['durationMs', 'artifactBytes', 'computeUnits'],
      properties: {
        durationMs: {
          allOf: [
            { $ref: '#/$defs/nonNegativeSafeInteger' },
            { maximum: 604_800_000 },
          ],
        },
        artifactBytes: {
          allOf: [
            { $ref: '#/$defs/nonNegativeSafeInteger' },
            { maximum: 10_737_418_240 },
          ],
        },
        computeUnits: {
          allOf: [
            { $ref: '#/$defs/nonNegativeSafeInteger' },
            { maximum: 1_000_000_000 },
          ],
        },
      },
      additionalProperties: false,
    },
    planPreflight: {
      oneOf: [
        {
          type: 'object',
          required: ['status'],
          properties: { status: { const: 'supported' } },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['status', 'reasonCode', 'message'],
          properties: {
            status: {
              enum: ['unsupported', 'blocked', 'not-applicable'],
            },
            reasonCode: { $ref: '#/$defs/canonicalId' },
            message: { $ref: '#/$defs/canonicalString' },
          },
          additionalProperties: false,
        },
      ],
    },
    planCell: {
      type: 'object',
      required: [
        'id',
        'checkId',
        'checkKind',
        'targetId',
        'targetPolicy',
        'frameworkTarget',
        'surface',
        'viewport',
        'colorScheme',
        'motion',
        'locale',
        'controlProfileRef',
        'adapter',
        'requirement',
        'policyRuleIds',
        'appliedExemptionIds',
        'retryPolicy',
        'evidenceRequirements',
        'resources',
        'inputKinds',
        'artifactKinds',
        'estimatedCost',
        'preflight',
        'dependencyCellIds',
        'inputDigest',
      ],
      properties: {
        id: { $ref: '#/$defs/canonicalId' },
        checkId: { $ref: '#/$defs/canonicalId' },
        checkKind: { $ref: '#/$defs/checkKind' },
        scenarioId: { $ref: '#/$defs/canonicalId' },
        targetId: { $ref: '#/$defs/canonicalId' },
        targetPolicy: { $ref: '#/$defs/targetPolicy' },
        frameworkTarget: { $ref: '#/$defs/canonicalId' },
        surface: { enum: ['preview', 'export', 'ci'] },
        browserEngine: { enum: ['chromium', 'firefox', 'webkit'] },
        viewport: { $ref: '#/$defs/viewport' },
        colorScheme: { enum: ['light', 'dark'] },
        motion: { enum: ['full', 'reduced'] },
        locale: { $ref: '#/$defs/canonicalString' },
        controlProfileRef: { $ref: '#/$defs/controlProfileRef' },
        fixtureSetRef: { $ref: '#/$defs/documentDigestRef' },
        baselineSetRef: { $ref: '#/$defs/documentDigestRef' },
        adapter: { $ref: '#/$defs/adapterIdentity' },
        requirement: { enum: ['required', 'advisory'] },
        policyRuleIds: { $ref: '#/$defs/canonicalIdArray' },
        appliedExemptionIds: { $ref: '#/$defs/canonicalIdArray' },
        retryPolicy: { $ref: '#/$defs/retryPolicy' },
        evidenceRequirements: { $ref: '#/$defs/evidenceRequirements' },
        resources: {
          type: 'array',
          maxItems: 512,
          items: { $ref: '#/$defs/planResource' },
        },
        inputKinds: {
          type: 'array',
          maxItems: 5,
          uniqueItems: true,
          items: {
            enum: [
              'diagnostic-snapshot',
              'executable-snapshot',
              'scenario-program',
              'test-report',
              'baseline-set',
            ],
          },
        },
        artifactKinds: {
          type: 'array',
          maxItems: 11,
          uniqueItems: true,
          items: { $ref: '#/$defs/artifactKind' },
        },
        estimatedCost: { $ref: '#/$defs/checkCost' },
        preflight: { $ref: '#/$defs/planPreflight' },
        dependencyCellIds: { $ref: '#/$defs/canonicalIdArray' },
        inputDigest: { $ref: '#/$defs/digest' },
      },
      additionalProperties: false,
    },
    planIssue: {
      type: 'object',
      required: ['code', 'message', 'relatedIds'],
      properties: {
        code: {
          enum: [
            'VER-2001',
            'VER-2002',
            'VER-3001',
            'VER-3002',
            'VER-3003',
            'VER-3004',
          ],
        },
        message: { $ref: '#/$defs/canonicalString' },
        cellId: { $ref: '#/$defs/canonicalId' },
        checkId: { $ref: '#/$defs/canonicalId' },
        relatedIds: { $ref: '#/$defs/canonicalIdArray' },
      },
      additionalProperties: false,
    },
    planExplanation: {
      type: 'object',
      required: [
        'checkId',
        'targetId',
        'status',
        'impactPathIds',
        'policyRuleIds',
        'messages',
      ],
      properties: {
        cellId: { $ref: '#/$defs/canonicalId' },
        checkId: { $ref: '#/$defs/canonicalId' },
        scenarioId: { $ref: '#/$defs/canonicalId' },
        targetId: { $ref: '#/$defs/canonicalId' },
        status: {
          enum: ['selected', 'forbidden', 'not-applicable', 'trimmed-advisory'],
        },
        impactPathIds: { $ref: '#/$defs/canonicalIdArray' },
        policyRuleIds: { $ref: '#/$defs/canonicalIdArray' },
        messages: { $ref: '#/$defs/canonicalStringArray' },
      },
      additionalProperties: false,
    },
    checkKind: checkKindSchema,
    evidenceTrust: evidenceTrustSchema,
    artifactKind: artifactKindSchema,
    planBudget: {
      type: 'object',
      required: [
        'cells',
        'cellsByCheckKind',
        'targetExpansions',
        'browserExpansions',
        'closureEvidenceRecords',
        'totalMs',
        'artifactBytes',
        'estimatedComputeUnits',
        'maximumParallelism',
        'overBudgetDimensions',
      ],
      properties: {
        cells: {
          type: 'integer',
          minimum: 0,
          maximum: MAXIMUM_VERIFICATION_CLOSURE_EVIDENCE_RECORDS,
        },
        cellsByCheckKind: {
          type: 'object',
          required: [
            'diagnostics',
            'build',
            'unit',
            'integration',
            'e2e',
            'visual',
            'accessibility',
            'performance',
            'security',
          ],
          properties: Object.fromEntries(
            [
              'diagnostics',
              'build',
              'unit',
              'integration',
              'e2e',
              'visual',
              'accessibility',
              'performance',
              'security',
            ].map((kind) => [
              kind,
              {
                type: 'integer',
                minimum: 0,
                maximum: MAXIMUM_VERIFICATION_CLOSURE_EVIDENCE_RECORDS,
              },
            ])
          ),
          additionalProperties: false,
        },
        targetExpansions: {
          type: 'integer',
          minimum: 0,
          maximum: MAXIMUM_VERIFICATION_CLOSURE_EVIDENCE_RECORDS,
        },
        browserExpansions: { type: 'integer', minimum: 0, maximum: 3 },
        closureEvidenceRecords: {
          type: 'integer',
          minimum: 0,
          maximum: MAXIMUM_VERIFICATION_CLOSURE_EVIDENCE_RECORDS,
        },
        totalMs: { $ref: '#/$defs/nonNegativeSafeInteger' },
        artifactBytes: { $ref: '#/$defs/nonNegativeSafeInteger' },
        estimatedComputeUnits: {
          $ref: '#/$defs/nonNegativeSafeInteger',
        },
        maximumParallelism: {
          type: 'integer',
          minimum: 1,
          maximum: 1_024,
        },
        overBudgetDimensions: {
          type: 'array',
          maxItems: 8,
          uniqueItems: true,
          items: {
            enum: [
              'maximumCells',
              'maximumCellsPerCheckKind',
              'maximumTargetExpansions',
              'maximumBrowserExpansions',
              'maximumClosureEvidenceRecords',
              'totalMs',
              'artifactBytes',
              'estimatedComputeUnits',
            ],
          },
        },
      },
      additionalProperties: false,
    },
  },
} as const;

export const verificationDocumentWireSchemas = Object.freeze({
  'verification-policy': verificationPolicyWireSchema,
  'verification-baseline-set': verificationBaselineSetWireSchema,
});

// V5 Evidence transport schemas are versioned independently from Workspace
// verification documents and deliberately stay out of verificationDocumentWireSchemas.
export {
  verificationArtifactEnvelopeWireSchema,
  verificationEvidenceCandidateWireSchema,
  verificationEvidenceManifestWireSchema,
  verificationEvidenceVerifiedViewWireSchema,
};

export const verificationEvidenceTransportWireSchemas = Object.freeze({
  'verification-plan': verificationPlanWireSchema,
  'verification-artifact-envelope': verificationArtifactEnvelopeWireSchema,
  'verification-evidence-candidate': verificationEvidenceCandidateWireSchema,
  'verification-evidence-manifest': verificationEvidenceManifestWireSchema,
  'verification-evidence-verified-view':
    verificationEvidenceVerifiedViewWireSchema,
});
