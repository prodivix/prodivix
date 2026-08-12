import {
  createPrivateKey,
  createPublicKey,
  sign as signEd25519,
  timingSafeEqual,
  verify as verifyEd25519,
  type KeyObject,
} from 'node:crypto';
import {
  createAgentModelEvaluationAuthorityAttestation,
  isAgentModelEvaluationEvidenceArchiveAttestationPayload,
  isAgentEvaluationFrozenConfigCommitmentSigningPayload,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentModelEvaluationAuthorityAttestation,
  type AgentModelEvaluationAuthorityAttestation,
  type AgentModelEvaluationAuthorityPayload,
  type AgentModelEvaluationEvidenceArchiveAttestationPayload,
  type AgentEvaluationFrozenConfigCommitmentSigningPayload,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import {
  createCredentialCanarySignatures,
  valueContainsCredentialCanary,
  type AgentEvaluationEnvironmentReader,
} from './secretResolver';
import type {
  AgentEvaluationAttestationIdentity,
  AgentEvaluationAuthoritySigner,
} from './coordinator';
import type { AgentEvaluationRunAttestation } from './runConfig';

export const AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES = Object.freeze({
  authorityId: 'PRODIVIX_G4_MODEL_EVAL_ATTESTATION_AUTHORITY_ID',
  environmentDigest: 'PRODIVIX_G4_MODEL_EVAL_ENVIRONMENT_DIGEST',
  jobId: 'PRODIVIX_G4_MODEL_EVAL_JOB_ID',
  keyId: 'PRODIVIX_G4_MODEL_EVAL_ATTESTATION_KEY_ID',
  privateKey: 'PRODIVIX_G4_MODEL_EVAL_ATTESTATION_PRIVATE_KEY',
  publicKey: 'PRODIVIX_G4_MODEL_EVAL_ATTESTATION_PUBLIC_KEY',
  workflowName: 'PRODIVIX_G4_MODEL_EVAL_WORKFLOW_NAME',
  workflowRunAttempt: 'PRODIVIX_G4_MODEL_EVAL_WORKFLOW_RUN_ATTEMPT',
  workflowRunId: 'PRODIVIX_G4_MODEL_EVAL_WORKFLOW_RUN_ID',
} as const);

export type AgentEvaluationAttestationSignerConfiguration = Readonly<{
  keyId: string;
  publicKeyBase64Url: string;
}>;

export type CreateEnvironmentAgentEvaluationAuthoritySignerInput = Readonly<{
  environment?: NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;
  expectedAttestation: AgentEvaluationRunAttestation;
  expectedJobId?: 'finalize' | 'full_shards';
}>;

const ed25519Pkcs8Prefix = Buffer.from(
  '302e020100300506032b657004220420',
  'hex'
);
const ed25519SpkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
const privateKeyBase64UrlPattern = /^[A-Za-z0-9_-]{64}$/u;
const publicKeyBase64UrlPattern = /^[A-Za-z0-9_-]{43}$/u;

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

const decodeCanonicalBase64Url = (
  value: string,
  pattern: RegExp,
  expectedBytes: number,
  failure: () => never
): Buffer => {
  if (!pattern.test(value)) return failure();
  let decoded: Buffer;
  try {
    decoded = Buffer.from(value, 'base64url');
  } catch {
    return failure();
  }
  if (
    decoded.byteLength !== expectedBytes ||
    decoded.toString('base64url') !== value
  ) {
    decoded.fill(0);
    return failure();
  }
  return decoded;
};

const hasPrefix = (value: Uint8Array, prefix: Uint8Array): boolean =>
  value.byteLength >= prefix.byteLength &&
  timingSafeEqual(value.subarray(0, prefix.byteLength), prefix);

const readPublicConfiguration = (
  readEnvironment: AgentEvaluationEnvironmentReader
): AgentEvaluationAttestationSignerConfiguration => {
  try {
    const keyId = readEnvironment(
      AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.keyId
    );
    const publicKeyBase64Url = readEnvironment(
      AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.publicKey
    );
    if (
      !isAgentControlIdentity(keyId) ||
      typeof publicKeyBase64Url !== 'string'
    ) {
      return configurationInvalid();
    }
    const publicKey = decodeCanonicalBase64Url(
      publicKeyBase64Url,
      publicKeyBase64UrlPattern,
      32,
      configurationInvalid
    );
    publicKey.fill(0);
    return Object.freeze({ keyId, publicKeyBase64Url });
  } catch (caught) {
    if (caught instanceof AgentEvaluationRunnerError) throw caught;
    return configurationInvalid();
  }
};

const normalizePublicConfiguration = (
  configuration: AgentEvaluationAttestationSignerConfiguration
): AgentEvaluationAttestationSignerConfiguration => {
  try {
    const keyId = configuration.keyId;
    const publicKeyBase64Url = configuration.publicKeyBase64Url;
    if (
      !isAgentControlIdentity(keyId) ||
      typeof publicKeyBase64Url !== 'string'
    ) {
      return configurationInvalid();
    }
    const publicKey = decodeCanonicalBase64Url(
      publicKeyBase64Url,
      publicKeyBase64UrlPattern,
      32,
      configurationInvalid
    );
    publicKey.fill(0);
    return Object.freeze({ keyId, publicKeyBase64Url });
  } catch (caught) {
    if (caught instanceof AgentEvaluationRunnerError) throw caught;
    return configurationInvalid();
  }
};

/** Loads the public trust binding while leaving private signing material unread. */
export const loadAgentEvaluationAttestationSignerConfiguration = (
  environment:
    NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader = process.env
): AgentEvaluationAttestationSignerConfiguration =>
  readPublicConfiguration(
    typeof environment === 'function'
      ? environment
      : (name) => environment[name]
  );

/**
 * Environment-backed Ed25519 signer. The PKCS8 value and DER bytes exist only
 * for the duration of one sign call and are never included in surfaced errors.
 */
export class EnvironmentAgentEvaluationAttestationSigner {
  readonly #configuration: AgentEvaluationAttestationSignerConfiguration;
  readonly #readEnvironment: AgentEvaluationEnvironmentReader;

  constructor(
    configuration: AgentEvaluationAttestationSignerConfiguration,
    environment:
      NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader = process.env
  ) {
    this.#configuration = normalizePublicConfiguration(configuration);
    this.#readEnvironment =
      typeof environment === 'function'
        ? environment
        : (name) => environment[name];
  }

  #signCanonical(
    input: Readonly<{
      keyId: string;
      payload: Readonly<Record<string, unknown>>;
      message: Uint8Array;
    }>
  ): string {
    let privateKeySource: string | undefined;
    let privateKeyTextBytes: Uint8Array | undefined;
    let privateKeyDer: Buffer | undefined;
    let configuredPublicKey: Buffer | undefined;
    let derivedPublicKeyDer: Buffer | undefined;
    let privateKeyObject: KeyObject | undefined;
    let publicKeyObject: KeyObject | undefined;
    let expectedMessage: Buffer | undefined;
    let message: Buffer | undefined;
    let signature: Buffer | undefined;
    try {
      if (input.keyId !== this.#configuration.keyId) {
        configurationInvalid();
      }
      try {
        expectedMessage = Buffer.from(canonicalJsonText(input.payload), 'utf8');
      } catch {
        configurationInvalid();
      }
      if (
        !(input.message instanceof Uint8Array) ||
        input.message.byteLength !== expectedMessage!.byteLength ||
        !timingSafeEqual(input.message, expectedMessage!)
      ) {
        configurationInvalid();
      }
      try {
        privateKeySource = this.#readEnvironment(
          AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.privateKey
        );
      } catch {
        secretUnavailable();
      }
      if (typeof privateKeySource !== 'string') secretUnavailable();
      privateKeyTextBytes = new TextEncoder().encode(privateKeySource);
      const privateKeyCanaries =
        createCredentialCanarySignatures(privateKeyTextBytes);
      privateKeyDer = decodeCanonicalBase64Url(
        privateKeySource as string,
        privateKeyBase64UrlPattern,
        48,
        secretUnavailable
      );
      privateKeySource = undefined;
      if (
        !hasPrefix(privateKeyDer, ed25519Pkcs8Prefix) ||
        privateKeyDer.byteLength !== ed25519Pkcs8Prefix.byteLength + 32
      ) {
        secretUnavailable();
      }

      try {
        privateKeyObject = createPrivateKey({
          format: 'der',
          key: privateKeyDer,
          type: 'pkcs8',
        });
        // Node accepts a private KeyObject here and derives its public half;
        // the current @types/node overload omits that documented input form.
        publicKeyObject = createPublicKey(
          privateKeyObject as unknown as Parameters<typeof createPublicKey>[0]
        );
        derivedPublicKeyDer = publicKeyObject.export({
          format: 'der',
          type: 'spki',
        });
      } catch {
        secretUnavailable();
      }
      if (
        !derivedPublicKeyDer ||
        derivedPublicKeyDer.byteLength !== ed25519SpkiPrefix.byteLength + 32 ||
        !hasPrefix(derivedPublicKeyDer, ed25519SpkiPrefix)
      ) {
        secretUnavailable();
      }
      configuredPublicKey = decodeCanonicalBase64Url(
        this.#configuration.publicKeyBase64Url,
        publicKeyBase64UrlPattern,
        32,
        configurationInvalid
      );
      const derivedPublicKey = derivedPublicKeyDer!.subarray(
        ed25519SpkiPrefix.byteLength
      );
      if (!timingSafeEqual(derivedPublicKey, configuredPublicKey)) {
        configurationInvalid();
      }

      try {
        message = Buffer.from(input.message);
        signature = signEd25519(null, message, privateKeyObject!);
      } catch {
        configurationInvalid();
      }
      if (
        !signature ||
        signature.byteLength !== 64 ||
        !publicKeyObject ||
        !verifyEd25519(null, message!, publicKeyObject, signature)
      ) {
        configurationInvalid();
      }
      const signatureBase64Url = signature!.toString('base64url');
      if (
        valueContainsCredentialCanary(
          Object.freeze({
            payload: input.payload,
            signatureBase64Url,
          }),
          privateKeyTextBytes,
          privateKeyCanaries
        )
      ) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak
        );
      }
      return signatureBase64Url;
    } catch (caught) {
      if (caught instanceof AgentEvaluationRunnerError) throw caught;
      return configurationInvalid();
    } finally {
      privateKeySource = undefined;
      privateKeyTextBytes?.fill(0);
      privateKeyDer?.fill(0);
      configuredPublicKey?.fill(0);
      derivedPublicKeyDer?.fill(0);
      expectedMessage?.fill(0);
      message?.fill(0);
      signature?.fill(0);
      privateKeyObject = undefined;
      publicKeyObject = undefined;
    }
  }

  sign(
    payload: AgentModelEvaluationAuthorityPayload
  ): AgentModelEvaluationAuthorityAttestation {
    let message: Buffer | undefined;
    try {
      message = Buffer.from(canonicalJsonText(payload), 'utf8');
      const signature = this.#signCanonical({
        keyId: payload.keyId,
        payload,
        message,
      });
      const attestation = createAgentModelEvaluationAuthorityAttestation({
        ...payload,
        signature,
      });
      if (!isAgentModelEvaluationAuthorityAttestation(attestation)) {
        configurationInvalid();
      }
      return attestation;
    } catch (caught) {
      if (caught instanceof AgentEvaluationRunnerError) throw caught;
      return configurationInvalid();
    } finally {
      message?.fill(0);
    }
  }

  signArchive(
    input: Readonly<{
      payload: AgentModelEvaluationEvidenceArchiveAttestationPayload;
      message: Uint8Array;
    }>
  ): string {
    if (
      !isAgentModelEvaluationEvidenceArchiveAttestationPayload(input.payload)
    ) {
      return configurationInvalid();
    }
    return this.#signCanonical({
      keyId: input.payload.keyId,
      payload: input.payload,
      message: input.message,
    });
  }

  signFrozenConfigCommitment(
    input: Readonly<{
      payload: AgentEvaluationFrozenConfigCommitmentSigningPayload;
      message: Uint8Array;
    }>
  ): string {
    if (!isAgentEvaluationFrozenConfigCommitmentSigningPayload(input.payload)) {
      return configurationInvalid();
    }
    return this.#signCanonical({
      keyId: input.payload.keyId,
      payload: input.payload,
      message: input.message,
    });
  }
}

const normalizeRuntimeIdentity = (
  identity: AgentEvaluationAttestationIdentity
): AgentEvaluationAttestationIdentity => {
  try {
    const normalized = {
      authorityId: identity.authorityId,
      keyId: identity.keyId,
      publicKeyBase64Url: identity.publicKeyBase64Url,
      workflowName: identity.workflowName,
      workflowRunId: identity.workflowRunId,
      workflowRunAttempt: identity.workflowRunAttempt,
      jobId: identity.jobId,
      environmentDigest: identity.environmentDigest,
    };
    if (
      !isAgentControlIdentity(normalized.authorityId) ||
      !isAgentControlIdentity(normalized.keyId) ||
      !isAgentControlIdentity(normalized.workflowName) ||
      !isAgentControlIdentity(normalized.workflowRunId) ||
      !Number.isSafeInteger(normalized.workflowRunAttempt) ||
      normalized.workflowRunAttempt < 1 ||
      !isAgentControlIdentity(normalized.jobId) ||
      !isAgentCanonicalDigest(normalized.environmentDigest)
    ) {
      return configurationInvalid();
    }
    normalizePublicConfiguration(normalized);
    return Object.freeze(normalized);
  } catch (caught) {
    if (caught instanceof AgentEvaluationRunnerError) throw caught;
    return configurationInvalid();
  }
};

/** Coordinator signer port with strict identity and canonical-message binding. */
export class EnvironmentAgentEvaluationAuthoritySigner implements AgentEvaluationAuthoritySigner {
  readonly #identity: AgentEvaluationAttestationIdentity;
  readonly #signer: EnvironmentAgentEvaluationAttestationSigner;

  constructor(
    identity: AgentEvaluationAttestationIdentity,
    environment:
      NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader = process.env
  ) {
    this.#identity = normalizeRuntimeIdentity(identity);
    this.#signer = new EnvironmentAgentEvaluationAttestationSigner(
      this.#identity,
      environment
    );
  }

  identity(): AgentEvaluationAttestationIdentity {
    return this.#identity;
  }

  async sign(
    input: Readonly<{
      payload: AgentModelEvaluationAuthorityPayload;
      message: Uint8Array;
    }>
  ): Promise<string> {
    let expectedMessage: Buffer | undefined;
    try {
      if (
        input.payload.authorityId !== this.#identity.authorityId ||
        input.payload.keyId !== this.#identity.keyId ||
        input.payload.workflowName !== this.#identity.workflowName ||
        input.payload.workflowRunId !== this.#identity.workflowRunId ||
        input.payload.workflowRunAttempt !==
          this.#identity.workflowRunAttempt ||
        input.payload.jobId !== this.#identity.jobId ||
        input.payload.environmentDigest !== this.#identity.environmentDigest
      ) {
        configurationInvalid();
      }
      expectedMessage = Buffer.from(canonicalJsonText(input.payload), 'utf8');
      if (
        !(input.message instanceof Uint8Array) ||
        input.message.byteLength !== expectedMessage.byteLength ||
        !timingSafeEqual(input.message, expectedMessage)
      ) {
        configurationInvalid();
      }
      return this.#signer.sign(input.payload).signature;
    } catch (caught) {
      if (caught instanceof AgentEvaluationRunnerError) throw caught;
      return configurationInvalid();
    } finally {
      expectedMessage?.fill(0);
    }
  }

  async signArchive(
    input: Readonly<{
      payload: AgentModelEvaluationEvidenceArchiveAttestationPayload;
      message: Uint8Array;
    }>
  ): Promise<string> {
    if (
      !isAgentModelEvaluationEvidenceArchiveAttestationPayload(input.payload) ||
      input.payload.authorityId !== this.#identity.authorityId ||
      input.payload.keyId !== this.#identity.keyId
    ) {
      return configurationInvalid();
    }
    try {
      return this.#signer.signArchive({
        payload: input.payload,
        message: input.message,
      });
    } catch (caught) {
      if (caught instanceof AgentEvaluationRunnerError) throw caught;
      return configurationInvalid();
    }
  }

  async signFrozenConfigCommitment(
    input: Readonly<{
      payload: AgentEvaluationFrozenConfigCommitmentSigningPayload;
      message: Uint8Array;
    }>
  ): Promise<string> {
    if (
      !isAgentEvaluationFrozenConfigCommitmentSigningPayload(input.payload) ||
      input.payload.authorityId !== this.#identity.authorityId ||
      input.payload.keyId !== this.#identity.keyId ||
      input.payload.workflowName !== this.#identity.workflowName ||
      input.payload.workflowRunId !== this.#identity.workflowRunId ||
      input.payload.jobId !== this.#identity.jobId ||
      input.payload.environmentDigest !== this.#identity.environmentDigest
    ) {
      return configurationInvalid();
    }
    try {
      return this.#signer.signFrozenConfigCommitment(input);
    } catch (caught) {
      if (caught instanceof AgentEvaluationRunnerError) throw caught;
      return configurationInvalid();
    }
  }

  verify(
    input: Readonly<{
      publicKeyBase64Url: string;
      signatureBase64Url: string;
      message: Uint8Array;
    }>
  ): boolean {
    let publicKey: Buffer | undefined;
    let publicKeyDer: Buffer | undefined;
    let signature: Buffer | undefined;
    try {
      if (
        input.publicKeyBase64Url !== this.#identity.publicKeyBase64Url ||
        !(input.message instanceof Uint8Array) ||
        input.message.byteLength < 1 ||
        input.message.byteLength > 2_097_152 ||
        !/^[A-Za-z0-9_-]{86}$/u.test(input.signatureBase64Url)
      ) {
        return false;
      }
      publicKey = decodeCanonicalBase64Url(
        input.publicKeyBase64Url,
        publicKeyBase64UrlPattern,
        32,
        configurationInvalid
      );
      signature = decodeCanonicalBase64Url(
        input.signatureBase64Url,
        /^[A-Za-z0-9_-]{86}$/u,
        64,
        configurationInvalid
      );
      publicKeyDer = Buffer.concat([ed25519SpkiPrefix, publicKey]);
      const key = createPublicKey({
        format: 'der',
        key: publicKeyDer,
        type: 'spki',
      });
      return verifyEd25519(null, input.message, key, signature);
    } catch {
      return false;
    } finally {
      publicKey?.fill(0);
      publicKeyDer?.fill(0);
      signature?.fill(0);
    }
  }
}

/** Loads public workflow provenance and cross-binds it to frozen run config. */
export const createEnvironmentAgentEvaluationAuthoritySigner = (
  input: CreateEnvironmentAgentEvaluationAuthoritySignerInput
): EnvironmentAgentEvaluationAuthoritySigner => {
  const environment = input.environment ?? process.env;
  const read: AgentEvaluationEnvironmentReader =
    typeof environment === 'function'
      ? environment
      : (name) => environment[name];
  try {
    const expectedJobId = input.expectedJobId ?? 'finalize';
    const publicConfiguration = readPublicConfiguration(read);
    const authorityId = read(
      AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.authorityId
    );
    const workflowName = read(
      AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.workflowName
    );
    const workflowRunId = read(
      AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.workflowRunId
    );
    const workflowRunAttemptSource = read(
      AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.workflowRunAttempt
    );
    const jobId = read(AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.jobId);
    const environmentDigest = read(
      AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.environmentDigest
    );
    if (
      input.expectedAttestation.algorithm !== 'Ed25519' ||
      input.expectedAttestation.privateKeyEnvironmentName !==
        AGENT_EVALUATION_ATTESTATION_ENVIRONMENT_NAMES.privateKey ||
      input.expectedAttestation.privateKeyRef !==
        'secret.g4-model-eval.attestation.ed25519.v1' ||
      authorityId !== input.expectedAttestation.authorityId ||
      publicConfiguration.keyId !== input.expectedAttestation.keyId ||
      !isAgentControlIdentity(authorityId) ||
      workflowName !== 'g4-real-model-evaluation' ||
      !isAgentControlIdentity(workflowRunId) ||
      typeof workflowRunAttemptSource !== 'string' ||
      !/^[1-9]\d{0,8}$/u.test(workflowRunAttemptSource) ||
      jobId !== expectedJobId ||
      !isAgentCanonicalDigest(environmentDigest)
    ) {
      return configurationInvalid();
    }
    const workflowRunAttempt = Number(workflowRunAttemptSource);
    if (!Number.isSafeInteger(workflowRunAttempt)) {
      return configurationInvalid();
    }
    return new EnvironmentAgentEvaluationAuthoritySigner(
      {
        authorityId,
        keyId: publicConfiguration.keyId,
        publicKeyBase64Url: publicConfiguration.publicKeyBase64Url,
        workflowName,
        workflowRunId,
        workflowRunAttempt,
        jobId,
        environmentDigest,
      },
      environment
    );
  } catch (caught) {
    if (caught instanceof AgentEvaluationRunnerError) throw caught;
    return configurationInvalid();
  }
};
