import {
  createPrivateKey,
  createPublicKey,
  sign as signEd25519,
  timingSafeEqual,
  verify as verifyEd25519,
  type KeyObject,
} from 'node:crypto';

import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  type AgentJsonValue,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  createVerificationAttestationClaimSet,
  createVerificationEvidenceStatementDigest,
  normalizeVerificationEvidenceStatement,
  type VerificationAttestationClaimSet,
  type VerificationAttestedTrust,
  type VerificationEvidenceStatement,
} from '@prodivix/verification';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import type { ProductionControlledWorkspaceG3VerificationEvidenceAuthority } from './productionControlledWorkspaceG3SandboxPort';
import type { ProductionOwnerResourceRetirement } from './productionWorkspaceVerificationOwnerAuthorityPorts';
import {
  createCredentialCanarySignatures,
  valueContainsCredentialCanary,
  type AgentEvaluationEnvironmentReader,
} from './secretResolver';

export const PRODUCTION_G3_ATTESTATION_AUTHORITY_FORMAT =
  'prodivix.agent-evaluation-g3-attestation-authority' as const;
export const PRODUCTION_G3_ATTESTATION_AUTHORITY_VERSION = 1 as const;
export const PRODUCTION_G3_ATTESTATION_ALGORITHM = 'Ed25519' as const;

export const PRODUCTION_G3_ATTESTATION_ENVIRONMENT_NAMES = Object.freeze({
  privateKeyPkcs8Base64Url:
    'PRODIVIX_G4_MODEL_EVAL_G3_ATTESTATION_PRIVATE_KEY_PKCS8_BASE64URL',
  keyId: 'PRODIVIX_G4_MODEL_EVAL_G3_ATTESTATION_KEY_ID',
  issuer: 'PRODIVIX_G4_MODEL_EVAL_G3_ATTESTATION_ISSUER',
  audience: 'PRODIVIX_G4_MODEL_EVAL_G3_ATTESTATION_AUDIENCE',
  subject: 'PRODIVIX_G4_MODEL_EVAL_G3_ATTESTATION_SUBJECT',
  trust: 'PRODIVIX_G4_MODEL_EVAL_G3_ATTESTATION_TRUST',
  policyGeneration: 'PRODIVIX_G4_MODEL_EVAL_G3_ATTESTATION_POLICY_GENERATION',
  maximumLifetimeMs:
    'PRODIVIX_G4_MODEL_EVAL_G3_ATTESTATION_MAXIMUM_LIFETIME_MS',
} as const);

export type ProductionG3AttestationSignInput = Parameters<
  ProductionControlledWorkspaceG3VerificationEvidenceAuthority['signAttestation']
>[0];

export type ProductionG3Ed25519AttestationPresentation = Readonly<{
  [key: string]: AgentJsonValue;
}> &
  VerificationAttestationClaimSet &
  Readonly<{
    algorithm: typeof PRODUCTION_G3_ATTESTATION_ALGORITHM;
    keyId: string;
    signature: string;
  }>;

export type ProductionG3AttestationAuthority = Readonly<{
  attestationAuthorityDigest: CanonicalDigest;
  signAttestation(
    input: ProductionG3AttestationSignInput
  ): Promise<ProductionG3Ed25519AttestationPresentation>;
  close(): Promise<ProductionOwnerResourceRetirement>;
}>;

export type CreateEnvironmentProductionG3AttestationAuthorityInput = Readonly<{
  environment?: NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;
  now?: () => string;
}>;

type PublicConfiguration = Readonly<{
  keyId: string;
  issuer: string;
  audience: string;
  subject: string;
  trust: VerificationAttestedTrust;
  policyGeneration: number;
  maximumLifetimeMs: number;
}>;

const maximumAttestationLifetimeMs = 60 * 60_000;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const privateKeyBase64UrlPattern = /^[A-Za-z0-9_-]{64}$/u;
const canonicalInstantPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const ed25519Pkcs8Prefix = Buffer.from(
  '302e020100300506032b657004220420',
  'hex'
);
const textEncoder = new TextEncoder();

const configurationInvalid = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
  );
};

const secretUnavailable = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable
  );
};

const exactRecord = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): value is Record<string, unknown> =>
  isPlainObject(value) &&
  Object.getOwnPropertySymbols(value).length === 0 &&
  required.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every(
    (key) =>
      !isUnsafeObjectKey(key) &&
      (required.includes(key) || optional.includes(key))
  );

const canonicalText = (value: unknown, maximumBytes: number): string => {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value !== value.trim() ||
    value !== value.normalize('NFC') ||
    textEncoder.encode(value).byteLength > maximumBytes ||
    [...value].some((character) => {
      const codePoint = character.codePointAt(0)!;
      return (
        codePoint < 32 ||
        codePoint === 127 ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)
      );
    })
  ) {
    return configurationInvalid();
  }
  return value;
};

const canonicalPositiveInteger = (source: unknown, maximum: number): number => {
  if (typeof source !== 'string' || !/^[1-9]\d{0,15}$/u.test(source)) {
    return configurationInvalid();
  }
  const value = Number(source);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    return configurationInvalid();
  }
  return value;
};

const canonicalInstant = (value: unknown): string => {
  if (
    typeof value !== 'string' ||
    !canonicalInstantPattern.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    return configurationInvalid();
  }
  return value;
};

const expiresAtFor = (issuedAt: string, lifetimeMs: number): string => {
  try {
    const expiresAt = new Date(Date.parse(issuedAt) + lifetimeMs).toISOString();
    return canonicalInstant(expiresAt);
  } catch (caught) {
    if (caught instanceof AgentEvaluationRunnerError) throw caught;
    return configurationInvalid();
  }
};

const readPublicConfiguration = (
  read: AgentEvaluationEnvironmentReader
): PublicConfiguration => {
  try {
    const keyId = canonicalText(
      read(PRODUCTION_G3_ATTESTATION_ENVIRONMENT_NAMES.keyId),
      256
    );
    if (!identifierPattern.test(keyId)) return configurationInvalid();
    const issuer = canonicalText(
      read(PRODUCTION_G3_ATTESTATION_ENVIRONMENT_NAMES.issuer),
      4_096
    );
    const audience = canonicalText(
      read(PRODUCTION_G3_ATTESTATION_ENVIRONMENT_NAMES.audience),
      4_096
    );
    const subject = canonicalText(
      read(PRODUCTION_G3_ATTESTATION_ENVIRONMENT_NAMES.subject),
      4_096
    );
    const trust = read(PRODUCTION_G3_ATTESTATION_ENVIRONMENT_NAMES.trust);
    if (trust !== 'remote-attested' && trust !== 'ci-attested') {
      return configurationInvalid();
    }
    return Object.freeze({
      keyId,
      issuer,
      audience,
      subject,
      trust,
      policyGeneration: canonicalPositiveInteger(
        read(PRODUCTION_G3_ATTESTATION_ENVIRONMENT_NAMES.policyGeneration),
        1_000_000
      ),
      maximumLifetimeMs: canonicalPositiveInteger(
        read(PRODUCTION_G3_ATTESTATION_ENVIRONMENT_NAMES.maximumLifetimeMs),
        maximumAttestationLifetimeMs
      ),
    });
  } catch (caught) {
    if (caught instanceof AgentEvaluationRunnerError) throw caught;
    return configurationInvalid();
  }
};

const authorityDigestFor = (
  configuration: PublicConfiguration
): CanonicalDigest =>
  digestAgentCanonicalValue({
    format: PRODUCTION_G3_ATTESTATION_AUTHORITY_FORMAT,
    version: PRODUCTION_G3_ATTESTATION_AUTHORITY_VERSION,
    algorithm: PRODUCTION_G3_ATTESTATION_ALGORITHM,
    keyId: configuration.keyId,
    issuer: configuration.issuer,
    audience: configuration.audience,
    subject: configuration.subject,
    trust: configuration.trust,
    policyGeneration: configuration.policyGeneration,
    maximumLifetimeMs: configuration.maximumLifetimeMs,
    privateKeyEnvironmentName:
      PRODUCTION_G3_ATTESTATION_ENVIRONMENT_NAMES.privateKeyPkcs8Base64Url,
    signingSemantics:
      'callback-current-instant-deterministic-ed25519-self-verified',
  });

const decodePrivateKey = (source: string): Buffer => {
  if (!privateKeyBase64UrlPattern.test(source)) return secretUnavailable();
  let decoded: Buffer;
  try {
    decoded = Buffer.from(source, 'base64url');
  } catch {
    return secretUnavailable();
  }
  if (
    decoded.byteLength !== 48 ||
    decoded.toString('base64url') !== source ||
    !timingSafeEqual(
      decoded.subarray(0, ed25519Pkcs8Prefix.byteLength),
      ed25519Pkcs8Prefix
    )
  ) {
    decoded.fill(0);
    return secretUnavailable();
  }
  return decoded;
};

const expectedExecutionFor = (
  binding: ProductionG3AttestationSignInput['binding']
): VerificationEvidenceStatement['execution'] =>
  Object.freeze({
    surface: binding.run.surface,
    frameworkTarget: binding.run.frameworkTarget,
    runtimeZone: binding.run.runtimeZone,
    ...(binding.run.browserEngine
      ? { browserEngine: binding.run.browserEngine }
      : {}),
    ...(binding.run.operatingSystemIdentity
      ? { operatingSystemIdentity: binding.run.operatingSystemIdentity }
      : {}),
    viewport: binding.run.viewport,
    devicePixelRatio: binding.run.devicePixelRatio,
    colorScheme: binding.run.colorScheme,
    motion: binding.run.motion,
    locale: binding.run.locale,
    timezone: binding.run.timezone,
    fontSetDigest: binding.run.fontSetDigest,
    ...(binding.run.sandboxImageDigest
      ? { sandboxImageDigest: binding.run.sandboxImageDigest }
      : {}),
  });

const assertPreparedStatementBinding = (
  input: ProductionG3AttestationSignInput,
  attestationAuthorityDigest: CanonicalDigest,
  trust: VerificationAttestedTrust
): VerificationEvidenceStatement => {
  // The final-commit authorization envelope owns the full authority and grant
  // receipts. This callback validates their exact digest coordinates before
  // signing the Backend-owned canonical statement claims.
  if (
    !exactRecord(input, [
      'binding',
      'authorityDigest',
      'verificationAttemptGrantReceiptDigest',
      'candidateDigest',
      'attestationNonce',
      'attestationStatement',
      'attestationStatementDigest',
    ]) ||
    !exactRecord(
      input.binding,
      [
        'format',
        'version',
        'bindingId',
        'authorityInputDigest',
        'evaluationPlanDigest',
        'repositoryCommit',
        'projectId',
        'caseId',
        'attemptId',
        'generation',
        'planDigest',
        'registrySnapshotDigest',
        'cellId',
        'adapter',
        'tool',
        'runtimeAuthorityId',
        'runtimeImplementationDigest',
        'artifactSourceAuthorityDigest',
        'attestationAuthorityDigest',
        'providerKind',
        'runtimeEnvironmentDigest',
        'controlCapabilitySnapshotDigest',
        'appliedControlDigest',
        'finalWorkspaceSnapshotDigest',
        'compilerProjectionReceiptDigest',
        'executableSnapshot',
        'run',
        'bindingDigest',
      ],
      ['scenarioId', 'scenarioProgramDigest']
    ) ||
    !exactRecord(input.binding.executableSnapshot, [
      'id',
      'sourceRef',
      'artifactDigest',
      'semanticSnapshotDigest',
      'size',
      'mediaType',
      'codecSchemaDigest',
    ]) ||
    !exactRecord(
      input.binding.run,
      [
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
      [
        'jobId',
        'sessionId',
        'parentAttemptId',
        'browserEngine',
        'operatingSystemIdentity',
        'sandboxImageDigest',
      ]
    ) ||
    input.binding.format !== 'prodivix.agent-evaluation-g3-sandbox-binding' ||
    input.binding.version !== 1 ||
    input.binding.providerKind !== 'remote' ||
    input.binding.attestationAuthorityDigest !== attestationAuthorityDigest ||
    !isAgentCanonicalDigest(input.binding.bindingDigest) ||
    !isAgentCanonicalDigest(input.authorityDigest) ||
    !isAgentCanonicalDigest(input.verificationAttemptGrantReceiptDigest) ||
    !isAgentCanonicalDigest(input.candidateDigest) ||
    !isAgentCanonicalDigest(input.attestationStatementDigest) ||
    canonicalText(input.attestationNonce, 4_096).length < 16
  ) {
    return configurationInvalid();
  }
  const { bindingDigest: _bindingDigest, ...bindingBase } = input.binding;
  let bindingDigest: CanonicalDigest;
  try {
    bindingDigest = digestAgentCanonicalValue(bindingBase);
  } catch {
    return configurationInvalid();
  }
  if (bindingDigest !== input.binding.bindingDigest) {
    return configurationInvalid();
  }

  let statement: VerificationEvidenceStatement;
  try {
    statement = normalizeVerificationEvidenceStatement(
      input.attestationStatement as VerificationEvidenceStatement
    );
  } catch {
    return configurationInvalid();
  }
  if (
    !sameCanonicalJson(statement, input.attestationStatement) ||
    createVerificationEvidenceStatementDigest(statement) !==
      input.attestationStatementDigest ||
    statement.candidateDigest !== input.candidateDigest ||
    statement.projectId !== input.binding.projectId ||
    statement.planDigest !== input.binding.planDigest ||
    statement.cellId !== input.binding.cellId ||
    statement.attemptId !== input.binding.attemptId ||
    statement.executableSnapshotDigest !==
      input.binding.executableSnapshot.semanticSnapshotDigest ||
    statement.producer.origin !== (trust === 'ci-attested' ? 'ci' : 'remote') ||
    statement.producer.providerId !== input.binding.run.providerId ||
    statement.producer.runId !== input.binding.run.runId ||
    statement.producer.jobId !== input.binding.run.jobId ||
    statement.producer.sessionId !== input.binding.run.sessionId ||
    statement.producer.sandboxImageDigest !==
      input.binding.run.sandboxImageDigest ||
    !sameCanonicalJson(statement.execution, expectedExecutionFor(input.binding))
  ) {
    return configurationInvalid();
  }
  return statement;
};

/**
 * Creates the production G3 signer without reading private material. The
 * PKCS8 value is resolved, decoded, used, scanned, and cleared inside each
 * `signAttestation` callback.
 */
export const createEnvironmentProductionG3AttestationAuthority = (
  input: CreateEnvironmentProductionG3AttestationAuthorityInput = {}
): ProductionG3AttestationAuthority => {
  const environment = input.environment ?? process.env;
  const read: AgentEvaluationEnvironmentReader =
    typeof environment === 'function'
      ? environment
      : (name) => environment[name];
  const configuration = readPublicConfiguration(read);
  const attestationAuthorityDigest = authorityDigestFor(configuration);
  const now = input.now ?? (() => new Date().toISOString());
  let closed = false;
  let closePromise: Promise<ProductionOwnerResourceRetirement> | undefined;

  const authority = Object.freeze({
    attestationAuthorityDigest,
    async signAttestation(
      signInput: ProductionG3AttestationSignInput
    ): Promise<ProductionG3Ed25519AttestationPresentation> {
      if (closed) return secretUnavailable();
      const statement = assertPreparedStatementBinding(
        signInput,
        attestationAuthorityDigest,
        configuration.trust
      );
      let issuedAt: string;
      try {
        issuedAt = canonicalInstant(now());
      } catch (caught) {
        if (caught instanceof AgentEvaluationRunnerError) throw caught;
        return configurationInvalid();
      }
      const expiresAt = expiresAtFor(issuedAt, configuration.maximumLifetimeMs);
      let claims: VerificationAttestationClaimSet;
      try {
        claims = createVerificationAttestationClaimSet({
          expected: Object.freeze({
            trust: configuration.trust,
            issuer: configuration.issuer,
            audience: configuration.audience,
            subject: configuration.subject,
            nonce: signInput.attestationNonce,
            policyGeneration: configuration.policyGeneration,
            verificationInstant: issuedAt,
            maximumLifetimeMs: configuration.maximumLifetimeMs,
            statement,
          }),
          issuedAt,
          notBefore: issuedAt,
          expiresAt,
        });
      } catch {
        return configurationInvalid();
      }

      let privateKeySource: string | undefined;
      let privateKeyTextBytes: Uint8Array | undefined;
      let privateKeyDer: Buffer | undefined;
      let message: Buffer | undefined;
      let signature: Buffer | undefined;
      let privateKey: KeyObject | undefined;
      let publicKey: KeyObject | undefined;
      try {
        try {
          privateKeySource = read(
            PRODUCTION_G3_ATTESTATION_ENVIRONMENT_NAMES.privateKeyPkcs8Base64Url
          );
        } catch {
          return secretUnavailable();
        }
        if (typeof privateKeySource !== 'string') return secretUnavailable();
        privateKeyTextBytes = textEncoder.encode(privateKeySource);
        const privateKeyCanaries =
          createCredentialCanarySignatures(privateKeyTextBytes);
        privateKeyDer = decodePrivateKey(privateKeySource);
        privateKeySource = undefined;
        try {
          privateKey = createPrivateKey({
            key: privateKeyDer,
            format: 'der',
            type: 'pkcs8',
          });
          if (privateKey.asymmetricKeyType !== 'ed25519') {
            return secretUnavailable();
          }
          publicKey = createPublicKey(
            privateKey as unknown as Parameters<typeof createPublicKey>[0]
          );
          if (publicKey.asymmetricKeyType !== 'ed25519') {
            return secretUnavailable();
          }
        } catch {
          return secretUnavailable();
        }
        message = Buffer.from(canonicalJsonText(claims), 'utf8');
        signature = signEd25519(null, message, privateKey);
        if (
          signature.byteLength !== 64 ||
          !verifyEd25519(null, message, publicKey, signature)
        ) {
          return configurationInvalid();
        }
        const presentation = Object.freeze({
          ...claims,
          algorithm: PRODUCTION_G3_ATTESTATION_ALGORITHM,
          keyId: configuration.keyId,
          signature: signature.toString('base64url'),
        }) as ProductionG3Ed25519AttestationPresentation;
        if (
          valueContainsCredentialCanary(
            presentation,
            privateKeyTextBytes,
            privateKeyCanaries
          )
        ) {
          throw new AgentEvaluationRunnerError(
            AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak
          );
        }
        return presentation;
      } catch (caught) {
        if (caught instanceof AgentEvaluationRunnerError) throw caught;
        return configurationInvalid();
      } finally {
        privateKeySource = undefined;
        privateKeyTextBytes?.fill(0);
        privateKeyDer?.fill(0);
        message?.fill(0);
        signature?.fill(0);
        privateKey = undefined;
        publicKey = undefined;
      }
    },
    close() {
      closePromise ??= Promise.resolve(
        Object.freeze({
          status: 'clean' as const,
          residualResourceIds: Object.freeze([]) as readonly [],
          residualCanaryIds: Object.freeze([]) as readonly [],
        })
      ).then((result) => {
        closed = true;
        return result;
      });
      return closePromise;
    },
  }) satisfies ProductionG3AttestationAuthority;
  return authority satisfies Pick<
    ProductionControlledWorkspaceG3VerificationEvidenceAuthority,
    'attestationAuthorityDigest' | 'signAttestation'
  >;
};
