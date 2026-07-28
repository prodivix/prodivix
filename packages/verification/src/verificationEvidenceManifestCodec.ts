import { verificationEvidenceCandidateWireSchema } from './verificationEvidenceCandidateSchema';
import {
  projectVerificationEvidenceManifest,
  validateVerificationEvidenceManifest,
  VERIFICATION_EVIDENCE_MANIFEST_FORMAT,
  type VerificationEvidenceManifest,
} from './verificationEvidenceManifest';
import {
  cloneCanonicalVerificationEvidenceWire,
  compileVerificationEvidenceWireSchema,
  verificationEvidenceWireSchemaFailure,
  type VerificationEvidenceWireDecodeResult,
} from './verificationEvidenceWireCodec.shared';

export const VERIFICATION_EVIDENCE_MANIFEST_WIRE_VERSION = 1 as const;

export type VerificationEvidenceManifestWire = VerificationEvidenceManifest &
  Readonly<{
    wireVersion: typeof VERIFICATION_EVIDENCE_MANIFEST_WIRE_VERSION;
  }>;

const ARTIFACT_KINDS = Object.freeze([
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
] as const);

const TRUST_CLASSES = Object.freeze([
  'local-unattested',
  'remote-attested',
  'ci-attested',
  'imported-untrusted',
] as const);

const RETENTION_CLASSES = Object.freeze([
  'session',
  'change',
  'release',
  'legal-hold',
] as const);

const MANIFEST_REQUIRED_KEYS = Object.freeze([
  'wireVersion',
  'format',
  'candidateDigest',
  'statement',
  'statementDigest',
  'verifiedProvenance',
  'evidence',
  'manifestDigest',
] as const);

const EVIDENCE_REQUIRED_KEYS = Object.freeze([
  'id',
  'projectId',
  'workspaceId',
  'workspaceRevision',
  'partitionRevisions',
  'executableSnapshotDigest',
  'policyRevision',
  'policyDigest',
  'impactDigest',
  'planDigest',
  'policyEvaluationInstant',
  'cellId',
  'checkId',
  'checkKind',
  'targetId',
  'attemptId',
  'run',
  'timing',
  'result',
  'provenance',
  'toolchain',
  'normalization',
  'controls',
  'inputs',
  'artifacts',
  'sourceTraces',
  'sourceTraceDigest',
  'dependencyLockDigest',
  'redactionPolicyId',
  'targetPolicy',
  'createdAt',
  'retention',
] as const);

const STATEMENT_REQUIRED_KEYS = Object.freeze([
  'evidenceId',
  'candidateId',
  'candidateDigest',
  'evidenceCoreDigest',
  'projectId',
  'workspaceId',
  'workspaceRevision',
  'partitionRevisionsDigest',
  'executableSnapshotDigest',
  'policyDigest',
  'planDigest',
  'cellId',
  'checkId',
  'checkKind',
  'targetId',
  'targetPolicyDigest',
  'attemptId',
  'producer',
  'execution',
  'toolchainDigest',
  'normalizationDigest',
  'controlDigest',
  'inputDigest',
  'resultDigest',
  'sourceTraceDigest',
  'createdAt',
  'retention',
  'artifacts',
] as const);

const VERIFIED_CLAIMS_REQUIRED_KEYS = Object.freeze([
  'trust',
  'issuer',
  'audience',
  'subject',
  'keyId',
  'algorithm',
  'issuedAt',
  'notBefore',
  'expiresAt',
  'nonceDigest',
  'replayKey',
  'claimsDigest',
  'proofDigest',
  'attestationDigest',
  'verifierId',
  'verifierVersion',
  'verifiedAt',
  'policyGeneration',
  'statementDigest',
  'artifactSetDigest',
  'candidateDigest',
  'evidenceCoreDigest',
  'projectId',
  'workspaceId',
  'workspaceRevision',
  'executableSnapshotDigest',
  'planDigest',
  'cellId',
  'checkId',
  'checkKind',
  'targetId',
  'targetPolicyDigest',
  'attemptId',
  'producerDigest',
  'executionDigest',
  'toolchainDigest',
  'normalizationDigest',
] as const);

/**
 * Immutable v1 transport schema. The current manifest model intentionally has
 * no numeric version; wireVersion exists only at this codec boundary.
 */
export const verificationEvidenceManifestWireSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://prodivix.dev/schemas/verification/evidence-manifest/v1.json',
  title: 'Prodivix VerificationEvidenceManifest wire document',
  type: 'object',
  required: MANIFEST_REQUIRED_KEYS,
  properties: {
    wireVersion: { const: VERIFICATION_EVIDENCE_MANIFEST_WIRE_VERSION },
    format: { const: VERIFICATION_EVIDENCE_MANIFEST_FORMAT },
    candidateDigest: { $ref: '#/$defs/digest' },
    statement: { $ref: '#/$defs/statement' },
    statementDigest: { $ref: '#/$defs/digest' },
    verifiedProvenance: { $ref: '#/$defs/verifiedProvenance' },
    evidence: { $ref: '#/$defs/evidence' },
    manifestDigest: { $ref: '#/$defs/digest' },
  },
  additionalProperties: false,
  $defs: {
    ...verificationEvidenceCandidateWireSchema.$defs,
    serverId: {
      type: 'string',
      minLength: 1,
      maxLength: 512,
      pattern: '^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,511}$',
    },
    retention: { enum: RETENTION_CLASSES },
    artifactManifest: {
      type: 'object',
      required: ['id', 'path', 'kind', 'digest', 'size', 'mediaType'],
      properties: {
        id: { $ref: '#/$defs/canonicalId' },
        path: verificationEvidenceCandidateWireSchema.$defs.artifact.properties
          .path,
        kind: { enum: ARTIFACT_KINDS },
        digest: { $ref: '#/$defs/digest' },
        normalizedDigest: { $ref: '#/$defs/digest' },
        sourceTraceDigest: { $ref: '#/$defs/digest' },
        size: { $ref: '#/$defs/nonNegativeSafeInteger' },
        mediaType: {
          type: 'string',
          minLength: 3,
          maxLength: 127,
          pattern: '^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$',
        },
      },
      additionalProperties: false,
    },
    statementArtifact: {
      type: 'object',
      required: ['id', 'path', 'kind', 'digest', 'size', 'mediaType'],
      properties: {
        id: { $ref: '#/$defs/canonicalId' },
        path: verificationEvidenceCandidateWireSchema.$defs.artifact.properties
          .path,
        kind: { enum: ARTIFACT_KINDS },
        digest: { $ref: '#/$defs/digest' },
        sourceTraceDigest: { $ref: '#/$defs/digest' },
        size: { $ref: '#/$defs/nonNegativeSafeInteger' },
        mediaType: {
          type: 'string',
          minLength: 3,
          maxLength: 127,
          pattern: '^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$',
        },
      },
      additionalProperties: false,
    },
    producer: {
      type: 'object',
      required: ['origin', 'producerId', 'providerId', 'runId'],
      properties: {
        origin: { enum: ['local', 'remote', 'ci', 'import'] },
        producerId: { $ref: '#/$defs/canonicalId' },
        providerId: { $ref: '#/$defs/canonicalId' },
        runId: { $ref: '#/$defs/canonicalId' },
        jobId: { $ref: '#/$defs/canonicalId' },
        sessionId: { $ref: '#/$defs/canonicalId' },
        workerId: { $ref: '#/$defs/canonicalId' },
        workerAttempt: { $ref: '#/$defs/positiveSafeInteger' },
        sandboxImageDigest: { $ref: '#/$defs/digest' },
        ci: { $ref: '#/$defs/ciRepositoryIdentity' },
      },
      additionalProperties: false,
      allOf: [
        {
          if: {
            properties: { origin: { const: 'ci' } },
            required: ['origin'],
          },
          then: { required: ['ci'] },
          else: { not: { required: ['ci'] } },
        },
      ],
    },
    statementExecution: {
      type: 'object',
      required: [
        'surface',
        'frameworkTarget',
        'runtimeZone',
        'viewport',
        'devicePixelRatio',
        'colorScheme',
        'motion',
        'locale',
        'timezone',
        'fontSetDigest',
      ],
      properties: {
        surface: { enum: ['preview', 'export', 'ci'] },
        frameworkTarget: { $ref: '#/$defs/canonicalId' },
        runtimeZone: { $ref: '#/$defs/canonicalId' },
        browserEngine: { enum: ['chromium', 'firefox', 'webkit'] },
        operatingSystemIdentity: { $ref: '#/$defs/canonicalText' },
        viewport: { $ref: '#/$defs/viewport' },
        devicePixelRatio: {
          type: 'number',
          exclusiveMinimum: 0,
          maximum: 16,
        },
        colorScheme: { enum: ['light', 'dark'] },
        motion: { enum: ['full', 'reduced'] },
        locale: {
          type: 'string',
          minLength: 1,
          maxLength: 64,
          pattern: '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?$',
        },
        timezone: { $ref: '#/$defs/canonicalText' },
        fontSetDigest: { $ref: '#/$defs/digest' },
        sandboxImageDigest: { $ref: '#/$defs/digest' },
      },
      additionalProperties: false,
    },
    statement: {
      type: 'object',
      required: STATEMENT_REQUIRED_KEYS,
      properties: {
        evidenceId: { $ref: '#/$defs/serverId' },
        candidateId: { $ref: '#/$defs/canonicalId' },
        candidateDigest: { $ref: '#/$defs/digest' },
        evidenceCoreDigest: { $ref: '#/$defs/digest' },
        projectId: { $ref: '#/$defs/canonicalId' },
        workspaceId: { $ref: '#/$defs/canonicalId' },
        workspaceRevision: { $ref: '#/$defs/nonNegativeSafeInteger' },
        partitionRevisionsDigest: { $ref: '#/$defs/digest' },
        executableSnapshotDigest: { $ref: '#/$defs/digest' },
        policyDigest: { $ref: '#/$defs/digest' },
        planDigest: { $ref: '#/$defs/digest' },
        cellId: { $ref: '#/$defs/canonicalId' },
        checkId: { $ref: '#/$defs/canonicalId' },
        checkKind: {
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
        },
        targetId: { $ref: '#/$defs/canonicalId' },
        targetPolicyDigest: { $ref: '#/$defs/digest' },
        attemptId: { $ref: '#/$defs/canonicalId' },
        producer: { $ref: '#/$defs/producer' },
        execution: { $ref: '#/$defs/statementExecution' },
        toolchainDigest: { $ref: '#/$defs/digest' },
        normalizationDigest: { $ref: '#/$defs/digest' },
        controlDigest: { $ref: '#/$defs/digest' },
        inputDigest: { $ref: '#/$defs/digest' },
        resultDigest: { $ref: '#/$defs/digest' },
        sourceTraceDigest: { $ref: '#/$defs/digest' },
        createdAt: { $ref: '#/$defs/instant' },
        retention: { $ref: '#/$defs/retention' },
        artifacts: {
          type: 'array',
          maxItems: 128,
          items: { $ref: '#/$defs/statementArtifact' },
        },
      },
      additionalProperties: false,
    },
    verifiedClaims: {
      type: 'object',
      required: VERIFIED_CLAIMS_REQUIRED_KEYS,
      properties: {
        trust: { enum: ['remote-attested', 'ci-attested'] },
        issuer: { $ref: '#/$defs/canonicalText' },
        audience: { $ref: '#/$defs/canonicalText' },
        subject: { $ref: '#/$defs/canonicalText' },
        keyId: { $ref: '#/$defs/canonicalText' },
        algorithm: { $ref: '#/$defs/canonicalText' },
        issuedAt: { $ref: '#/$defs/instant' },
        notBefore: { $ref: '#/$defs/instant' },
        expiresAt: { $ref: '#/$defs/instant' },
        nonceDigest: { $ref: '#/$defs/digest' },
        replayKey: { $ref: '#/$defs/digest' },
        claimsDigest: { $ref: '#/$defs/digest' },
        proofDigest: { $ref: '#/$defs/digest' },
        attestationDigest: { $ref: '#/$defs/digest' },
        verifierId: { $ref: '#/$defs/canonicalId' },
        verifierVersion: { $ref: '#/$defs/canonicalText' },
        verifiedAt: { $ref: '#/$defs/instant' },
        policyGeneration: { $ref: '#/$defs/nonNegativeSafeInteger' },
        statementDigest: { $ref: '#/$defs/digest' },
        artifactSetDigest: { $ref: '#/$defs/digest' },
        candidateDigest: { $ref: '#/$defs/digest' },
        evidenceCoreDigest: { $ref: '#/$defs/digest' },
        projectId: { $ref: '#/$defs/canonicalId' },
        workspaceId: { $ref: '#/$defs/canonicalId' },
        workspaceRevision: { $ref: '#/$defs/nonNegativeSafeInteger' },
        executableSnapshotDigest: { $ref: '#/$defs/digest' },
        planDigest: { $ref: '#/$defs/digest' },
        cellId: { $ref: '#/$defs/canonicalId' },
        checkId: { $ref: '#/$defs/canonicalId' },
        checkKind: {
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
        },
        targetId: { $ref: '#/$defs/canonicalId' },
        targetPolicyDigest: { $ref: '#/$defs/digest' },
        attemptId: { $ref: '#/$defs/canonicalId' },
        producerDigest: { $ref: '#/$defs/digest' },
        executionDigest: { $ref: '#/$defs/digest' },
        toolchainDigest: { $ref: '#/$defs/digest' },
        normalizationDigest: { $ref: '#/$defs/digest' },
        ci: { $ref: '#/$defs/ciRepositoryIdentity' },
      },
      additionalProperties: false,
      allOf: [
        {
          if: {
            properties: { trust: { const: 'ci-attested' } },
            required: ['trust'],
          },
          then: { required: ['ci'] },
          else: { not: { required: ['ci'] } },
        },
      ],
    },
    verifiedProvenance: {
      oneOf: [
        {
          type: 'object',
          required: ['kind', 'trust', 'producerId', 'issuedAt'],
          properties: {
            kind: { const: 'unattested' },
            trust: {
              enum: ['local-unattested', 'imported-untrusted'],
            },
            producerId: { $ref: '#/$defs/canonicalId' },
            issuedAt: { $ref: '#/$defs/instant' },
            expiresAt: { $ref: '#/$defs/instant' },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['kind', 'claims'],
          properties: {
            kind: { const: 'attested' },
            claims: { $ref: '#/$defs/verifiedClaims' },
          },
          additionalProperties: false,
        },
      ],
    },
    evidenceRun: {
      type: 'object',
      required: [
        'runId',
        'providerId',
        'surface',
        'frameworkTarget',
        'runtimeZone',
        'viewport',
        'devicePixelRatio',
        'colorScheme',
        'motion',
        'locale',
        'timezone',
        'fontSetDigest',
      ],
      properties: {
        runId: { $ref: '#/$defs/canonicalId' },
        providerId: { $ref: '#/$defs/canonicalId' },
        jobId: { $ref: '#/$defs/canonicalId' },
        sessionId: { $ref: '#/$defs/canonicalId' },
        parentAttemptId: { $ref: '#/$defs/canonicalId' },
        surface: { enum: ['preview', 'export', 'ci'] },
        frameworkTarget: { $ref: '#/$defs/canonicalId' },
        runtimeZone: { $ref: '#/$defs/canonicalId' },
        browserEngine: { enum: ['chromium', 'firefox', 'webkit'] },
        operatingSystemIdentity: { $ref: '#/$defs/canonicalText' },
        viewport: { $ref: '#/$defs/viewport' },
        devicePixelRatio: {
          type: 'number',
          exclusiveMinimum: 0,
          maximum: 16,
        },
        colorScheme: { enum: ['light', 'dark'] },
        motion: { enum: ['full', 'reduced'] },
        locale: {
          type: 'string',
          minLength: 1,
          maxLength: 64,
          pattern: '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?$',
        },
        timezone: { $ref: '#/$defs/canonicalText' },
        fontSetDigest: { $ref: '#/$defs/digest' },
        sandboxImageDigest: { $ref: '#/$defs/digest' },
      },
      additionalProperties: false,
    },
    evidenceProvenance: {
      type: 'object',
      required: ['trust', 'producerId', 'issuedAt'],
      properties: {
        trust: { enum: TRUST_CLASSES },
        producerId: { $ref: '#/$defs/canonicalId' },
        attestationDigest: { $ref: '#/$defs/digest' },
        issuedAt: { $ref: '#/$defs/instant' },
        expiresAt: { $ref: '#/$defs/instant' },
        ci: { $ref: '#/$defs/ciRepositoryIdentity' },
      },
      additionalProperties: false,
      allOf: [
        {
          if: {
            properties: { trust: { const: 'ci-attested' } },
            required: ['trust'],
          },
          then: { required: ['ci'] },
          else: { not: { required: ['ci'] } },
        },
      ],
    },
    ciRepositoryIdentity: {
      type: 'object',
      required: ['repository', 'ref', 'commit'],
      properties: {
        repository: {
          type: 'string',
          minLength: 1,
          maxLength: 512,
          pattern:
            '^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}(?::[A-Za-z0-9][A-Za-z0-9._+-]{0,127})?(?:/[A-Za-z0-9][A-Za-z0-9._+-]{0,127})+$',
        },
        ref: {
          type: 'string',
          minLength: 6,
          maxLength: 512,
          pattern:
            '^refs/(?!.*(?:\\.\\.|//|@\\{|[\\\\ ~^:?*\\[]))(?!.*[/.]$).+$',
        },
        commit: {
          type: 'string',
          pattern: '^(?:sha1-[a-f0-9]{40}|sha256-[a-f0-9]{64})$',
        },
      },
      additionalProperties: false,
    },
    targetPolicy: {
      type: 'object',
      required: ['authority', 'policyDigest', 'semanticTargetId', 'capture'],
      properties: {
        authority: { const: 'verification-policy' },
        policyDigest: { $ref: '#/$defs/digest' },
        semanticTargetId: { $ref: '#/$defs/canonicalId' },
        capture: {
          enum: ['allowed', 'masked', 'forbidden-sensitive'],
        },
      },
      additionalProperties: false,
    },
    evidence: {
      type: 'object',
      required: EVIDENCE_REQUIRED_KEYS,
      properties: {
        id: { $ref: '#/$defs/serverId' },
        projectId: { $ref: '#/$defs/canonicalId' },
        workspaceId: { $ref: '#/$defs/canonicalId' },
        workspaceRevision: { $ref: '#/$defs/nonNegativeSafeInteger' },
        partitionRevisions: { $ref: '#/$defs/partitionRevisions' },
        executableSnapshotDigest: { $ref: '#/$defs/digest' },
        scenario: { $ref: '#/$defs/scenario' },
        policyRevision: { $ref: '#/$defs/nonNegativeSafeInteger' },
        policyDigest: { $ref: '#/$defs/digest' },
        impactDigest: { $ref: '#/$defs/digest' },
        planDigest: { $ref: '#/$defs/digest' },
        policyEvaluationInstant: { $ref: '#/$defs/instant' },
        cellId: { $ref: '#/$defs/canonicalId' },
        checkId: { $ref: '#/$defs/canonicalId' },
        checkKind: {
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
        },
        targetId: { $ref: '#/$defs/canonicalId' },
        attemptId: { $ref: '#/$defs/canonicalId' },
        run: { $ref: '#/$defs/evidenceRun' },
        timing: { $ref: '#/$defs/timing' },
        result: { $ref: '#/$defs/result' },
        provenance: { $ref: '#/$defs/evidenceProvenance' },
        toolchain: { $ref: '#/$defs/toolchain' },
        normalization: { $ref: '#/$defs/toolchain' },
        controls: { $ref: '#/$defs/controls' },
        inputs: { $ref: '#/$defs/inputs' },
        artifacts: {
          type: 'array',
          maxItems: 128,
          items: { $ref: '#/$defs/artifactManifest' },
        },
        sourceTraces:
          verificationEvidenceCandidateWireSchema.properties.sourceTraces,
        sourceTraceDigest: { $ref: '#/$defs/digest' },
        dependencyLockDigest: { $ref: '#/$defs/digest' },
        redactionPolicyId: { $ref: '#/$defs/canonicalId' },
        targetPolicy: { $ref: '#/$defs/targetPolicy' },
        createdAt: { $ref: '#/$defs/instant' },
        retention: { $ref: '#/$defs/retention' },
        supersedes: { $ref: '#/$defs/serverId' },
      },
      additionalProperties: false,
    },
  },
} as const;

const validateWire = compileVerificationEvidenceWireSchema(
  verificationEvidenceManifestWireSchema
);

export const decodeVerificationEvidenceManifest = (
  value: unknown
): VerificationEvidenceWireDecodeResult<VerificationEvidenceManifest> => {
  const cloned = cloneCanonicalVerificationEvidenceWire(value);
  if (!cloned.ok) return cloned;
  if (!validateWire(cloned.value)) {
    return verificationEvidenceWireSchemaFailure(validateWire.errors);
  }
  const { wireVersion: _wireVersion, ...current } = cloned.value;
  const validation = validateVerificationEvidenceManifest(
    current as VerificationEvidenceManifest
  );
  return validation.status === 'ready'
    ? Object.freeze({ ok: true, value: validation.manifest })
    : Object.freeze({
        ok: false,
        issues: Object.freeze([
          Object.freeze({
            code: 'VER-5001' as const,
            path: '/',
            message: validation.message,
          }),
        ]),
      });
};

export const encodeVerificationEvidenceManifest = (
  value: VerificationEvidenceManifest
): VerificationEvidenceManifestWire => {
  const validation = validateVerificationEvidenceManifest(value);
  if (validation.status !== 'ready') throw new TypeError(validation.message);
  // Validate the projection too; this keeps the public current model and the
  // durable envelope synchronized at the codec boundary.
  projectVerificationEvidenceManifest(validation.manifest);
  const wire = {
    ...validation.manifest,
    wireVersion: VERIFICATION_EVIDENCE_MANIFEST_WIRE_VERSION,
  } as VerificationEvidenceManifestWire;
  const decoded = decodeVerificationEvidenceManifest(wire);
  if (!decoded.ok) {
    throw new TypeError(
      decoded.issues.map(({ message }) => message).join('; ')
    );
  }
  return Object.freeze(wire);
};
