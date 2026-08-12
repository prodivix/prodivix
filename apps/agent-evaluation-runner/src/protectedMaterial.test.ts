import { createCipheriv } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  CallbackBoundAgentEvaluationMaterialResolver,
  G4_V8_MINIMUM_EVALUATION_CORPUS,
  createAgentEvaluationCaseMaterial,
  createAgentEvaluationCorpusMaterialCatalog,
  createAgentEvaluationRestrictedMaterialLocator,
  digestAgentCanonicalValue,
  type AgentEvaluationCaseMaterial,
  type AgentEvaluationDeterministicGraderCheck,
  type AgentEvaluationProtectedMaterialScope,
  type AgentEvaluationRestrictedMaterialLocator,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import {
  AGENT_EVALUATION_PROTECTED_MATERIAL_KEY_ENV,
  AGENT_EVALUATION_PROTECTED_MATERIAL_KEY_REF,
  EnvironmentAgentEvaluationProtectedMaterialKeyResolver,
  FileAgentEvaluationProtectedMaterialSource,
  createAgentEvaluationProtectedMaterialAdditionalData,
  digestAgentEvaluationProtectedMaterialEnvelopeBytes,
  type AgentEvaluationProtectedMaterialEnvelopeV1,
} from './protectedMaterial';

const planDigest = digestAgentCanonicalValue({
  plan: 'protected-material-test',
});
const repositoryCommit = 'a'.repeat(40);
const alternateCommit = 'b'.repeat(40);
const encryptionPolicyDigest = digestAgentCanonicalValue({
  algorithm: 'AES-256-GCM',
  policy: 'protected-material-test-v1',
});
const key = Buffer.alloc(32, 0x5a);
const keyBase64 = key.toString('base64');
const evaluationCase = G4_V8_MINIMUM_EVALUATION_CORPUS.cases.find(
  ({ access }) => access === 'protected-holdout'
)!;
const resolverRef = `resolver://${evaluationCase.caseId}`;
const canary = 'protected-envelope-canary-4f4a9410ffcd';
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

const check = (
  kind: AgentEvaluationDeterministicGraderCheck['kind'],
  suffix: string,
  subjectRef: string,
  expected: string | boolean
): AgentEvaluationDeterministicGraderCheck => {
  const base = Object.freeze({
    checkId: `check.${evaluationCase.caseId}.${suffix}`,
    kind,
    subjectRef,
    expected,
  });
  return Object.freeze({
    ...base,
    checkDigest: digestAgentCanonicalValue(base),
  });
};

const material = (): AgentEvaluationCaseMaterial => {
  const targetRef = `target://${evaluationCase.caseId}`;
  const sourceRef = `workspace://${evaluationCase.caseId}`;
  const result = Object.freeze({ targetRef, observation: canary });
  const tool = Object.freeze({
    toolId: 'workspace.inspect',
    description: 'Read one exact target.',
    effect: 'read-only' as const,
    inputSchema: Object.freeze({
      type: 'object',
      additionalProperties: false,
    }),
  });
  return createAgentEvaluationCaseMaterial({
    caseDefinition: evaluationCase,
    caseDefinitionDigestInput: Object.freeze({
      caseId: evaluationCase.caseId,
      encryptedDefinitionRef: `holdout-encrypted://${evaluationCase.caseId}`,
    }),
    expectedAuthorityDigestInput: Object.freeze({
      requiredBehavior: `holdout-authority://${evaluationCase.caseId}`,
      forbiddenBehavior: `holdout-forbidden://${evaluationCase.caseId}`,
    }),
    gradingPolicyDigestInput: Object.freeze({
      bucket: evaluationCase.primaryBucket,
      deterministicFirst: true,
      familyId: evaluationCase.familyId,
    }),
    invocation: Object.freeze({
      blocks: Object.freeze([
        Object.freeze({
          kind: 'text' as const,
          blockId: `block.${evaluationCase.caseId}.policy`,
          role: 'developer' as const,
          authority: 'system-policy' as const,
          instructionBoundary: 'developer' as const,
          text: 'Apply the frozen evaluation policy.',
        }),
        Object.freeze({
          kind: 'text' as const,
          blockId: `block.${evaluationCase.caseId}.body`,
          role: 'user' as const,
          authority: 'external-untrusted' as const,
          instructionBoundary: 'data-only' as const,
          text: `Protected body ${canary}`,
        }),
        Object.freeze({
          kind: 'tool-result' as const,
          blockId: `block.${evaluationCase.caseId}.tool`,
          authority: 'external-untrusted' as const,
          instructionBoundary: 'data-only' as const,
          toolCallId: `call.${evaluationCase.caseId}.inspect`,
          toolId: 'workspace.inspect',
          result,
          resultDigest: digestAgentCanonicalValue(result),
        }),
      ]),
      contextItems: Object.freeze([
        Object.freeze({
          contextItemId: `context.${evaluationCase.caseId}.canonical`,
          sourceRef,
          authority: 'canonical-workspace' as const,
          instructionBoundary: 'data-only' as const,
          content: `Protected Context ${canary}`,
          contentDigest: digestAgentCanonicalValue(
            `Protected Context ${canary}`
          ),
        }),
      ]),
      tools: Object.freeze([
        Object.freeze({
          ...tool,
          definitionDigest: digestAgentCanonicalValue(tool),
        }),
      ]),
    }),
    expectedAuthority: Object.freeze({
      exactTargetRefs: Object.freeze([targetRef]),
      allowedActionIds: Object.freeze(['agent.proposal.create']),
      forbiddenActionIds: Object.freeze(['workspace.direct-write']),
      requiredContextSourceRefs: Object.freeze([sourceRef]),
      expectedDiagnosticCodes: Object.freeze(['AI-7002']),
      requiredPlan: 'typed-plan',
      requiredClosure: 'g3-closure',
    }),
    grader: Object.freeze({
      deterministicFirst: true,
      checks: Object.freeze([
        check('strict-schema', 'schema', 'response://typed-proposal', true),
        check('exact-target', 'target', targetRef, true),
        check('forbidden-action', 'write', 'workspace.direct-write', false),
      ]),
    }),
    protectedLeakCanaries: Object.freeze([canary]),
  });
};

const encryptEnvelope = (
  protectedMaterial: AgentEvaluationCaseMaterial,
  input: { commit?: string; nonceByte?: number } = {}
): Readonly<{
  bytes: Buffer;
  envelope: AgentEvaluationProtectedMaterialEnvelopeV1;
}> => {
  const commit = input.commit ?? repositoryCommit;
  const plaintext = Buffer.from(canonicalJsonText(protectedMaterial), 'utf8');
  const nonce = Buffer.alloc(12, input.nonceByte ?? 0x31);
  const aad = createAgentEvaluationProtectedMaterialAdditionalData({
    planDigest,
    repositoryCommit: commit,
    caseId: evaluationCase.caseId,
    caseDigest: evaluationCase.caseDigest,
    resolverRef,
    encryptionPolicyDigest,
    materialDigest: protectedMaterial.materialDigest,
    plaintextByteLength: plaintext.byteLength,
  });
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const envelope = Object.freeze({
    format: 'prodivix.g4-protected-material' as const,
    version: 1 as const,
    algorithm: 'AES-256-GCM' as const,
    keyRef: AGENT_EVALUATION_PROTECTED_MATERIAL_KEY_REF,
    planDigest,
    repositoryCommit: commit,
    caseId: evaluationCase.caseId,
    caseDigest: evaluationCase.caseDigest,
    resolverRef,
    encryptionPolicyDigest,
    materialDigest: protectedMaterial.materialDigest,
    plaintextByteLength: plaintext.byteLength,
    nonceBase64: nonce.toString('base64'),
    authenticationTagBase64: cipher.getAuthTag().toString('base64'),
    ciphertextBase64: ciphertext.toString('base64'),
  });
  const bytes = Buffer.from(canonicalJsonText(envelope), 'utf8');
  plaintext.fill(0);
  ciphertext.fill(0);
  nonce.fill(0);
  aad.fill(0);
  return Object.freeze({ bytes, envelope });
};

const createLocator = (
  bytes: Uint8Array
): AgentEvaluationRestrictedMaterialLocator =>
  createAgentEvaluationRestrictedMaterialLocator(evaluationCase, {
    resolverRef,
    encryptedMaterialDigest:
      digestAgentEvaluationProtectedMaterialEnvelopeBytes(bytes),
    encryptionPolicyDigest,
  });

const writeEnvelope = async (bytes: Uint8Array): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'prodivix-g4-holdout-'));
  temporaryDirectories.push(directory);
  const path = join(directory, 'case.envelope.json');
  await writeFile(path, bytes, { flag: 'wx' });
  return path;
};

const environmentKeyResolver = (
  commit = repositoryCommit,
  reader?: (name: string) => string | undefined
): EnvironmentAgentEvaluationProtectedMaterialKeyResolver =>
  new EnvironmentAgentEvaluationProtectedMaterialKeyResolver({
    planDigest,
    repositoryCommit: commit,
    environment:
      reader ??
      ((name) =>
        name === AGENT_EVALUATION_PROTECTED_MATERIAL_KEY_ENV
          ? keyBase64
          : undefined),
  });

const fileSource = (
  path: string,
  locator: AgentEvaluationRestrictedMaterialLocator,
  input: {
    commit?: string;
    read?: (path: string, maximumBytes: number) => Promise<Uint8Array>;
  } = {}
): FileAgentEvaluationProtectedMaterialSource =>
  new FileAgentEvaluationProtectedMaterialSource({
    planDigest,
    repositoryCommit: input.commit ?? repositoryCommit,
    files: Object.freeze([
      Object.freeze({
        caseId: locator.caseId,
        resolverRef: locator.resolverRef,
        path,
      }),
    ]),
    environment: Object.freeze({
      [AGENT_EVALUATION_PROTECTED_MATERIAL_KEY_ENV]: keyBase64,
    }),
    ...(input.read ? { readFile: input.read } : {}),
  });

describe('protected evaluation material envelope', () => {
  it('reads the fixed key inside one server callback and zeroes its bytes', async () => {
    const readEnvironment = vi.fn((name: string) =>
      name === AGENT_EVALUATION_PROTECTED_MATERIAL_KEY_ENV
        ? keyBase64
        : undefined
    );
    const resolver = environmentKeyResolver(repositoryCommit, readEnvironment);
    let retained: Uint8Array | undefined;
    await expect(
      resolver.use(
        {
          keyRef: AGENT_EVALUATION_PROTECTED_MATERIAL_KEY_REF,
          planDigest,
          repositoryCommit,
          purpose: 'protected-holdout-decryption',
          runtimeZone: 'server',
          useId: 'holdout-key-test.1',
        },
        async (callbackKey) => {
          retained = callbackKey;
          expect(Buffer.from(callbackKey).toString('base64')).toBe(keyBase64);
          return Object.freeze({ accepted: true });
        }
      )
    ).resolves.toEqual({ accepted: true });
    expect(readEnvironment).toHaveBeenCalledExactlyOnceWith(
      AGENT_EVALUATION_PROTECTED_MATERIAL_KEY_ENV
    );
    expect([...retained!]).toEqual(new Array(32).fill(0));

    const leakingRequest = {
      keyRef: AGENT_EVALUATION_PROTECTED_MATERIAL_KEY_REF,
      planDigest,
      repositoryCommit,
      purpose: 'protected-holdout-decryption' as const,
      runtimeZone: 'server' as const,
      useId: 'holdout-key-test.2',
    };
    await expect(
      resolver.use(leakingRequest, async (callbackKey) => ({
        leaked: Buffer.from(callbackKey).toString('base64'),
      }))
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak,
    });
    await expect(
      resolver.use(leakingRequest, async () => ({ accepted: true }))
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUseDenied,
    });
    await expect(
      resolver.use(
        { ...leakingRequest, useId: 'holdout-key-test.3' },
        async (callbackKey) => ({ leaked: [...callbackKey] })
      )
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak,
    });
  });

  it('decrypts an exact plan/commit envelope through the existing callback source API', async () => {
    const protectedMaterial = material();
    const encrypted = encryptEnvelope(protectedMaterial);
    const path = await writeEnvelope(encrypted.bytes);
    const locator = createLocator(encrypted.bytes);
    let loadedBytes: Uint8Array | undefined;
    const source = fileSource(path, locator, {
      read: async (explicitPath, maximumBytes) => {
        expect(explicitPath).toBe(path);
        expect(maximumBytes).toBeGreaterThan(encrypted.bytes.byteLength);
        loadedBytes = Uint8Array.from(await readFile(explicitPath));
        return loadedBytes;
      },
    });
    let retainedMaterial: AgentEvaluationCaseMaterial | undefined;
    await expect(
      source.use(locator, async (value) => {
        retainedMaterial = value;
        expect(value.materialDigest).toBe(protectedMaterial.materialDigest);
        expect(canonicalJsonText(value)).toContain(canary);
        return Object.freeze({ verdict: 'passed' });
      })
    ).resolves.toEqual({ verdict: 'passed' });
    expect(() => retainedMaterial!.caseId).toThrow(/revoked/u);
    expect([...loadedBytes!]).toEqual(
      new Array(loadedBytes!.byteLength).fill(0)
    );
    expect((await readFile(path, 'utf8')).includes(canary)).toBe(false);
  });

  it('composes with the catalog resolver and revokes the user-facing scope', async () => {
    const protectedMaterial = material();
    const encrypted = encryptEnvelope(protectedMaterial, { nonceByte: 0x32 });
    const path = await writeEnvelope(encrypted.bytes);
    const locator = createLocator(encrypted.bytes);
    const catalog = createAgentEvaluationCorpusMaterialCatalog(
      [evaluationCase],
      [],
      [locator]
    );
    const resolver = new CallbackBoundAgentEvaluationMaterialResolver(
      [evaluationCase],
      catalog,
      fileSource(path, locator)
    );
    let retainedScope: AgentEvaluationProtectedMaterialScope | undefined;
    await expect(
      resolver.use(evaluationCase.caseId, async (scope) => {
        retainedScope = scope;
        expect(scope.read().caseId).toBe(evaluationCase.caseId);
        return Object.freeze({ observation: 'safe-public-fact' });
      })
    ).resolves.toEqual({ observation: 'safe-public-fact' });
    expect(() => retainedScope!.read()).toThrow(/revoked/u);
  });

  it('fails closed on plan/commit, byte digest, version, and authentication drift', async () => {
    const protectedMaterial = material();
    const encrypted = encryptEnvelope(protectedMaterial, { nonceByte: 0x33 });
    const path = await writeEnvelope(encrypted.bytes);
    const locator = createLocator(encrypted.bytes);

    await expect(
      fileSource(path, locator, { commit: alternateCommit }).use(
        locator,
        async () => ({ ok: true })
      )
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.transportFailed,
    });

    const driftedBytes = Buffer.concat([encrypted.bytes, Buffer.from('\n')]);
    const driftedPath = await writeEnvelope(driftedBytes);
    await expect(
      fileSource(driftedPath, locator).use(locator, async () => ({ ok: true }))
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.transportFailed,
    });

    const versionDrift = Buffer.from(
      canonicalJsonText({ ...encrypted.envelope, version: 2 }),
      'utf8'
    );
    const versionPath = await writeEnvelope(versionDrift);
    const versionLocator = createLocator(versionDrift);
    await expect(
      fileSource(versionPath, versionLocator).use(versionLocator, async () => ({
        ok: true,
      }))
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.transportFailed,
    });

    const ciphertext = Buffer.from(
      encrypted.envelope.ciphertextBase64,
      'base64'
    );
    ciphertext[0] = ciphertext[0]! ^ 0xff;
    const authenticationDrift = Buffer.from(
      canonicalJsonText({
        ...encrypted.envelope,
        ciphertextBase64: ciphertext.toString('base64'),
      }),
      'utf8'
    );
    ciphertext.fill(0);
    const authenticationPath = await writeEnvelope(authenticationDrift);
    const authenticationLocator = createLocator(authenticationDrift);
    await expect(
      fileSource(authenticationPath, authenticationLocator).use(
        authenticationLocator,
        async () => ({ ok: true })
      )
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.transportFailed,
    });
  });

  it('keeps protected body, key, and callback errors out of public results', async () => {
    const protectedMaterial = material();
    const encrypted = encryptEnvelope(protectedMaterial, { nonceByte: 0x34 });
    const path = await writeEnvelope(encrypted.bytes);
    const locator = createLocator(encrypted.bytes);
    const source = fileSource(path, locator);

    await expect(
      source.use(locator, async (value) => ({
        leaked: value.protectedLeakCanaries[0],
      }))
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak,
    });
    await expect(
      source.use(locator, async (value) => ({
        leakedBytes: [
          ...new TextEncoder().encode(value.protectedLeakCanaries[0]),
        ],
      }))
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak,
    });
    await expect(
      source.use(locator, async () => ({ leakedKey: keyBase64 }))
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak,
    });
    let caught: unknown;
    try {
      await source.use(locator, async () => {
        throw new Error(`callback exposed ${canary} ${keyBase64}`);
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.transportFailed,
    });
    expect(JSON.stringify(caught)).not.toContain(canary);
    expect(JSON.stringify(caught)).not.toContain(keyBase64);
    expect(String(caught)).not.toContain(canary);
    expect(String(caught)).not.toContain(keyBase64);
  });

  it('requires explicit absolute files and keeps rotating material on its catalog source', async () => {
    const encrypted = encryptEnvelope(material(), { nonceByte: 0x35 });
    const path = await writeEnvelope(encrypted.bytes);
    const locator = createLocator(encrypted.bytes);
    expect(
      () =>
        new FileAgentEvaluationProtectedMaterialSource({
          planDigest,
          repositoryCommit,
          files: [
            {
              caseId: evaluationCase.caseId,
              resolverRef,
              path: 'relative.envelope.json',
            },
          ],
          environment: {
            [AGENT_EVALUATION_PROTECTED_MATERIAL_KEY_ENV]: keyBase64,
          },
        })
    ).toThrowError(
      expect.objectContaining({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
      })
    );
    await expect(
      fileSource(path, locator).use(
        { ...locator, access: 'rotating-counterexample' },
        async () => ({ ok: true })
      )
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUseDenied,
    });

    const oversized = new Uint8Array(3_000_001);
    oversized.fill(1);
    await expect(
      fileSource(path, locator, {
        read: async () => oversized,
      }).use(locator, async () => ({ ok: true }))
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.transportFailed,
    });
    expect(oversized.every((value) => value === 0)).toBe(true);
  });
});
