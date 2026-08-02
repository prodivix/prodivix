import {
  createBinaryAssetJpegSanitizeRecipe,
  createBinaryAssetJpegSanitizeTransformer,
  createBinaryAssetMaterialization,
  createBinaryAssetPngSanitizeRecipe,
  createBinaryAssetPngSanitizeTransformer,
  createBinaryAssetBlobReference,
  executeBinaryAssetTransformPipeline,
  normalizeBinaryAssetMediaType,
  type BinaryAssetContentScanner,
  type BinaryAssetDerivedCache,
} from '@prodivix/assets';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import { createAgentUsageVector } from '../usage/agentUsage';
import { createAgentUntrustedProvenanceClaim } from './agentMediaIdentity';
import type {
  AgentGeneratedArtifactAdoptionIssue,
  AgentGeneratedArtifactAdoptionResult,
  AgentGeneratedArtifactCandidate,
  AgentGeneratedAssetProposal,
  AgentProviderArtifactRef,
  AgentProviderArtifactResolver,
  AgentUntrustedProvenanceClaim,
} from './agentMultimodal.types';

const forbiddenProviderLocator =
  /(?:https?:\/\/|file:\/\/|[?&](?:sig|signature|token|x-amz-credential)=|\bauthorization\b)/iu;
const opaqueIdentity = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/u;

const issue = (
  code: AgentGeneratedArtifactAdoptionIssue['code'],
  path: string,
  message: string
): AgentGeneratedArtifactAdoptionIssue =>
  Object.freeze({ code, path, message, blocking: true });

const compareIssues = (
  left: AgentGeneratedArtifactAdoptionIssue,
  right: AgentGeneratedArtifactAdoptionIssue
): number =>
  compareUnicodeCodePoints(left.path, right.path) ||
  compareUnicodeCodePoints(left.code, right.code) ||
  compareUnicodeCodePoints(left.message, right.message);

export const createAgentProviderArtifactRef = (
  input: AgentProviderArtifactRef
): AgentProviderArtifactRef => {
  if (
    !opaqueIdentity.test(input.providerArtifactId) ||
    forbiddenProviderLocator.test(input.providerArtifactId) ||
    !opaqueIdentity.test(input.providerConfigurationId) ||
    !isAgentCanonicalDigest(input.artifactIdentityDigest) ||
    !Number.isFinite(Date.parse(input.expiresAt))
  ) {
    throw new TypeError(
      'Provider artifact reference must be opaque, digest-bound, and expiring.'
    );
  }
  return Object.freeze({ ...input });
};

const normalizeClaims = (
  claims: readonly AgentUntrustedProvenanceClaim[]
): readonly AgentUntrustedProvenanceClaim[] => {
  const normalized = claims.map((claim) => {
    const rebuilt = createAgentUntrustedProvenanceClaim(claim);
    if (rebuilt.claimDigest !== claim.claimDigest) {
      throw new TypeError('Provider provenance claim digest drifted.');
    }
    return rebuilt;
  });
  if (
    new Set(normalized.map(({ claimDigest }) => claimDigest)).size !==
    normalized.length
  ) {
    throw new TypeError('Provider provenance claims are duplicated.');
  }
  return Object.freeze(
    normalized.sort((left, right) =>
      compareUnicodeCodePoints(left.claimDigest, right.claimDigest)
    )
  );
};

const candidateBase = (
  input: Omit<AgentGeneratedArtifactCandidate, 'candidateDigest'>
) => ({
  candidateId: input.candidateId,
  taskId: input.taskId,
  runId: input.runId,
  generation: input.generation,
  producingInvocationId: input.producingInvocationId,
  capabilityQualificationDigest: input.capabilityQualificationDigest,
  inputRepresentationDigests: Object.freeze(
    [...input.inputRepresentationDigests].sort(compareUnicodeCodePoints)
  ),
  promptPolicyDigest: input.promptPolicyDigest,
  providerArtifactRef: createAgentProviderArtifactRef(
    input.providerArtifactRef
  ),
  ...(input.declaredMediaType
    ? {
        declaredMediaType: normalizeBinaryAssetMediaType(
          input.declaredMediaType
        ),
      }
    : {}),
  ...(input.declaredByteLength !== undefined
    ? { declaredByteLength: input.declaredByteLength }
    : {}),
  ...(input.providerSafetyReceiptRef
    ? { providerSafetyReceiptRef: input.providerSafetyReceiptRef }
    : {}),
  provenanceClaims: normalizeClaims(input.provenanceClaims),
});

export const createAgentGeneratedArtifactCandidate = (
  input: Omit<AgentGeneratedArtifactCandidate, 'candidateDigest'>
): AgentGeneratedArtifactCandidate => {
  for (const [label, value] of [
    ['candidate id', input.candidateId],
    ['Task id', input.taskId],
    ['Run id', input.runId],
    ['invocation id', input.producingInvocationId],
  ] as const) {
    if (!opaqueIdentity.test(value)) {
      throw new TypeError(`Generated artifact ${label} is invalid.`);
    }
  }
  if (!Number.isSafeInteger(input.generation) || input.generation < 1) {
    throw new TypeError('Generated artifact generation is invalid.');
  }
  for (const [label, digest] of [
    ['Capability qualification', input.capabilityQualificationDigest],
    ['Prompt policy', input.promptPolicyDigest],
    ...input.inputRepresentationDigests.map(
      (digest, index) => [`Input representation ${index}`, digest] as const
    ),
  ] as const) {
    if (!isAgentCanonicalDigest(digest)) {
      throw new TypeError(`${label} digest is invalid.`);
    }
  }
  if (
    new Set(input.inputRepresentationDigests).size !==
    input.inputRepresentationDigests.length
  ) {
    throw new TypeError('Generated artifact input representations duplicate.');
  }
  if (
    input.declaredByteLength !== undefined &&
    (!Number.isSafeInteger(input.declaredByteLength) ||
      input.declaredByteLength < 1)
  ) {
    throw new TypeError('Generated artifact declared byte length is invalid.');
  }
  const base = candidateBase(input);
  return Object.freeze({
    ...base,
    candidateDigest: digestAgentCanonicalValue(base),
  });
};

export const validateAgentGeneratedArtifactCandidate = (
  candidate: AgentGeneratedArtifactCandidate
): boolean => {
  try {
    return (
      createAgentGeneratedArtifactCandidate(candidate).candidateDigest ===
      candidate.candidateDigest
    );
  } catch {
    return false;
  }
};

/**
 * Resolves Provider bytes only inside this callback, then delegates byte truth,
 * deterministic sanitization, and scanning to the G2 Asset pipeline.
 */
export const adoptAgentGeneratedArtifactCandidate = async (
  input: Readonly<{
    candidate: AgentGeneratedArtifactCandidate;
    resolver: AgentProviderArtifactResolver;
    assetDocumentId: string;
    scanner: BinaryAssetContentScanner;
    scannerPolicyDigest: string;
    maxArtifactBytes: number;
    resolvedAt: string;
    cache?: BinaryAssetDerivedCache;
  }>
): Promise<AgentGeneratedArtifactAdoptionResult> => {
  const issues: AgentGeneratedArtifactAdoptionIssue[] = [];
  if (
    !validateAgentGeneratedArtifactCandidate(input.candidate) ||
    !opaqueIdentity.test(input.assetDocumentId) ||
    !isAgentCanonicalDigest(input.scannerPolicyDigest) ||
    digestAgentCanonicalValue(input.scanner.descriptor) !==
      input.scannerPolicyDigest ||
    !Number.isSafeInteger(input.maxArtifactBytes) ||
    input.maxArtifactBytes < 1 ||
    !Number.isFinite(Date.parse(input.resolvedAt)) ||
    Date.parse(input.resolvedAt) >=
      Date.parse(input.candidate.providerArtifactRef.expiresAt)
  ) {
    return Object.freeze({
      status: 'blocked',
      issues: Object.freeze([
        issue(
          'AI-7011',
          '/candidate',
          'Generated artifact candidate, scanner policy, expiry, or target identity is invalid.'
        ),
      ]),
    });
  }

  let resolved: Readonly<{ contents: Uint8Array; mediaType: string }>;
  try {
    resolved = await input.resolver.resolve({
      candidate: input.candidate,
      taskId: input.candidate.taskId,
      runId: input.candidate.runId,
      generation: input.candidate.generation,
      invocationId: input.candidate.producingInvocationId,
    });
  } catch {
    return Object.freeze({
      status: 'blocked',
      issues: Object.freeze([
        issue(
          'AI-7011',
          '/providerArtifactRef',
          'Callback-bound Provider artifact resolution failed closed.'
        ),
      ]),
    });
  }
  if (
    !(resolved.contents instanceof Uint8Array) ||
    resolved.contents.byteLength < 1 ||
    resolved.contents.byteLength > input.maxArtifactBytes ||
    (input.candidate.declaredByteLength !== undefined &&
      input.candidate.declaredByteLength !== resolved.contents.byteLength)
  ) {
    issues.push(
      issue(
        'AI-6002',
        '/artifact/bytes',
        'Generated artifact bytes are missing, drifted, or exceed the hard ceiling.'
      )
    );
  }
  let mediaType = '';
  try {
    mediaType = normalizeBinaryAssetMediaType(resolved.mediaType);
  } catch {
    issues.push(
      issue(
        'AI-7011',
        '/artifact/mediaType',
        'Generated artifact media type is invalid.'
      )
    );
  }
  if (
    input.candidate.declaredMediaType !== undefined &&
    input.candidate.declaredMediaType !== mediaType
  ) {
    issues.push(
      issue(
        'AI-7011',
        '/artifact/mediaType',
        'Provider-declared and materialized media types drifted.'
      )
    );
  }
  if (mediaType !== 'image/png' && mediaType !== 'image/jpeg') {
    issues.push(
      issue(
        'AI-7011',
        '/artifact/mediaType',
        'V2 generated asset adoption supports sanitized PNG/JPEG only.'
      )
    );
  }
  if (issues.length > 0) {
    return Object.freeze({
      status: 'blocked',
      issues: Object.freeze(issues.sort(compareIssues)),
    });
  }

  try {
    const sourceReference = createBinaryAssetBlobReference({
      contents: resolved.contents,
      mediaType,
    });
    const source = createBinaryAssetMaterialization({
      assetDocumentId: input.assetDocumentId,
      reference: sourceReference,
      contents: resolved.contents,
    });
    const recipe =
      mediaType === 'image/png'
        ? createBinaryAssetPngSanitizeRecipe(sourceReference.digest)
        : createBinaryAssetJpegSanitizeRecipe(sourceReference.digest);
    const transformer =
      mediaType === 'image/png'
        ? createBinaryAssetPngSanitizeTransformer()
        : createBinaryAssetJpegSanitizeTransformer();
    const pipeline = await executeBinaryAssetTransformPipeline({
      source,
      recipe,
      transformer,
      scanner: input.scanner,
      cache: input.cache,
    });
    const scannerAttestationDigest = digestAgentCanonicalValue(
      pipeline.derived.scan
    );
    const provenanceBase = Object.freeze({
      candidateDigest: input.candidate.candidateDigest,
      providerArtifactIdentityDigest:
        input.candidate.providerArtifactRef.artifactIdentityDigest,
      capabilityQualificationDigest:
        input.candidate.capabilityQualificationDigest,
      inputRepresentationDigests: Object.freeze([
        ...input.candidate.inputRepresentationDigests,
      ]),
      promptPolicyDigest: input.candidate.promptPolicyDigest,
      sourceDigest: sourceReference.digest,
      sanitizedDigest: pipeline.derived.materialization.reference.digest,
      transformRecipeDigest: pipeline.derived.recipe.recipeDigest,
      scannerAttestationDigest,
      licenseDisposition: 'unknown' as const,
    });
    const provenance = Object.freeze({
      ...provenanceBase,
      provenanceDigest: digestAgentCanonicalValue(provenanceBase),
    });
    const proposalBase = Object.freeze({
      proposalId: `generated-asset-proposal:${input.candidate.candidateDigest.slice('sha256-'.length)}`,
      proposalKind: 'asset-create' as const,
      candidateId: input.candidate.candidateId,
      taskId: input.candidate.taskId,
      runId: input.candidate.runId,
      generation: input.candidate.generation,
      assetDocumentId: input.assetDocumentId,
      finalReference: pipeline.derived.materialization.reference,
      transformRecipe: pipeline.derived.recipe,
      scanAttestation: pipeline.derived.scan,
      provenance,
      requiredApproval: 'exact-human' as const,
      commitAuthority: 'none-before-approval' as const,
    });
    const proposal: AgentGeneratedAssetProposal = Object.freeze({
      ...proposalBase,
      proposalDigest: digestAgentCanonicalValue(proposalBase),
    });
    return Object.freeze({
      status: 'proposed',
      proposal,
      usage: createAgentUsageVector([
        {
          unit: 'generated-artifact',
          logicalAmount: '1',
          billableAmount: '1',
          confidence: 'measured',
          sourceDigest: input.candidate.candidateDigest,
        },
        {
          unit: 'generated-artifact-byte',
          logicalAmount: String(resolved.contents.byteLength),
          billableAmount: String(
            pipeline.derived.materialization.contents.byteLength
          ),
          confidence: 'measured',
          sourceDigest: sourceReference.digest,
        },
      ]),
    });
  } catch {
    return Object.freeze({
      status: 'blocked',
      issues: Object.freeze([
        issue(
          'AI-7011',
          '/artifact/g2Pipeline',
          'G2 materialization, sanitizer, scanner, or provenance failed closed.'
        ),
      ]),
    });
  }
};

export const createCallbackBoundAgentProviderArtifactResolver = (
  resolve: AgentProviderArtifactResolver['resolve']
): AgentProviderArtifactResolver => Object.freeze({ resolve });
