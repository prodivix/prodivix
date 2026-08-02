import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import {
  normalizeBinaryAssetMediaType,
  readBinaryAssetBlobReference,
  readBinaryAssetScanAttestation,
  readBinaryAssetTransformRecipe,
} from '@prodivix/assets';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import { agentMediaFactWireSchema } from '../wire/agentMediaWire';
import {
  createAgentGeneratedArtifactCandidate,
  validateAgentGeneratedArtifactCandidate,
} from './agentGeneratedArtifact';
import {
  createAgentMediaOmission,
  createAgentMediaSourceDescriptor,
  validateAgentMediaSourceDescriptor,
} from './agentMediaIdentity';
import type {
  AgentGeneratedArtifactCandidate,
  AgentGeneratedAssetProposal,
  AgentMediaRepresentation,
  AgentMediaTransformationReceipt,
  AgentGeneratedAssetProvenance,
} from './agentMultimodal.types';

export type AgentMediaFact =
  | Readonly<{
      factType: 'media-source-descriptor';
      value: import('./agentMultimodal.types').AgentMediaSourceDescriptor;
    }>
  | Readonly<{
      factType: 'media-transformation-receipt';
      value: AgentMediaTransformationReceipt;
    }>
  | Readonly<{
      factType: 'media-representation';
      value: AgentMediaRepresentation;
    }>
  | Readonly<{
      factType: 'generated-artifact-candidate';
      value: AgentGeneratedArtifactCandidate;
    }>
  | Readonly<{
      factType: 'generated-asset-proposal';
      value: AgentGeneratedAssetProposal;
    }>;

export type AgentMediaFactWire = AgentMediaFact & Readonly<{ wireVersion: 1 }>;

export type AgentMediaFactDecodeIssue = Readonly<{
  code: 'AI-9001';
  path: string;
  message: string;
}>;

export type AgentMediaFactDecodeResult =
  | Readonly<{ ok: true; value: AgentMediaFact }>
  | Readonly<{ ok: false; issues: readonly AgentMediaFactDecodeIssue[] }>;

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateWire: ValidateFunction = ajv.compile(agentMediaFactWireSchema);
const maximumBytes = 1_048_576;
const maximumDepth = 32;
const maximumNodes = 50_000;
const identityPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/u;
const transformationOperations = new Set<
  AgentMediaTransformationReceipt['operation']
>([
  'decode',
  'resize',
  'crop',
  'color-convert',
  'rasterize',
  'page-select',
  'ocr',
  'transcribe',
  'frame-sample',
  'compress',
  'redact',
]);

const issue = (path: string, message: string): AgentMediaFactDecodeIssue =>
  Object.freeze({ code: 'AI-9001', path, message });

const inspect = (value: unknown): readonly AgentMediaFactDecodeIssue[] => {
  const issues: AgentMediaFactDecodeIssue[] = [];
  const ancestors = new Set<object>();
  let nodes = 0;
  const visit = (candidate: unknown, path: string, depth: number): void => {
    nodes += 1;
    if (nodes > maximumNodes) {
      issues.push(issue('/', 'Agent media fact exceeds its node limit.'));
      return;
    }
    if (depth > maximumDepth) {
      issues.push(issue(path, 'Agent media fact exceeds its depth limit.'));
      return;
    }
    if (
      candidate === null ||
      typeof candidate === 'string' ||
      typeof candidate === 'boolean'
    ) {
      return;
    }
    if (typeof candidate === 'number') {
      if (!Number.isFinite(candidate)) {
        issues.push(issue(path, 'Agent media fact numbers must be finite.'));
      }
      return;
    }
    if (typeof candidate !== 'object' || ancestors.has(candidate)) {
      issues.push(
        issue(path, 'Agent media facts must contain acyclic JSON data only.')
      );
      return;
    }
    ancestors.add(candidate);
    try {
      if (Array.isArray(candidate)) {
        const descriptors = Object.getOwnPropertyDescriptors(candidate);
        const keys = Object.getOwnPropertyNames(candidate).filter(
          (key) => key !== 'length'
        );
        if (
          keys.length !== candidate.length ||
          keys.some((key, index) => key !== String(index)) ||
          Object.getOwnPropertySymbols(candidate).length > 0
        ) {
          issues.push(
            issue(path, 'Agent media arrays must be dense JSON arrays.')
          );
          return;
        }
        candidate.forEach((_entry, index) => {
          const descriptor = descriptors[String(index)];
          if (!descriptor?.enumerable || !('value' in descriptor)) {
            issues.push(
              issue(`${path}/${index}`, 'Media fact accessors are forbidden.')
            );
            return;
          }
          visit(descriptor.value, `${path}/${index}`, depth + 1);
        });
        return;
      }
      if (!isPlainObject(candidate)) {
        issues.push(issue(path, 'Agent media values must be plain objects.'));
        return;
      }
      const descriptors = Object.getOwnPropertyDescriptors(candidate);
      for (const key of Object.getOwnPropertyNames(candidate)) {
        const child = `${path === '/' ? '' : path}/${key
          .replaceAll('~', '~0')
          .replaceAll('/', '~1')}`;
        if (isUnsafeObjectKey(key)) {
          issues.push(issue(child, 'Unsafe Agent media fact object key.'));
          continue;
        }
        const descriptor = descriptors[key];
        if (!descriptor?.enumerable || !('value' in descriptor)) {
          issues.push(issue(child, 'Media fact accessors are forbidden.'));
          continue;
        }
        visit(descriptor.value, child, depth + 1);
      }
      if (Object.getOwnPropertySymbols(candidate).length > 0) {
        issues.push(issue(path, 'Agent media fact keys must be strings.'));
      }
    } finally {
      ancestors.delete(candidate);
    }
  };
  try {
    visit(value, '/', 0);
    if (
      issues.length === 0 &&
      new TextEncoder().encode(canonicalJsonText(value)).byteLength >
        maximumBytes
    ) {
      issues.push(issue('/', 'Agent media fact exceeds its byte limit.'));
    }
  } catch {
    issues.push(issue('/', 'Agent media fact cannot be safely inspected.'));
  }
  return Object.freeze(issues);
};

const cloneJson = <T>(value: T): T => JSON.parse(canonicalJsonText(value)) as T;

const normalizeReceipt = (
  value: AgentMediaTransformationReceipt
): AgentMediaTransformationReceipt => {
  if (
    !value.transformationId.trim() ||
    !value.transformerId.trim() ||
    !value.transformerVersion.trim() ||
    !isAgentCanonicalDigest(value.transformerDigest) ||
    !isAgentCanonicalDigest(value.parametersDigest) ||
    !isAgentCanonicalDigest(value.inputDigest) ||
    !isAgentCanonicalDigest(value.outputDigest) ||
    !transformationOperations.has(value.operation) ||
    !['none', 'bounded-lossy', 'unknown'].includes(value.loss) ||
    !Number.isSafeInteger(value.outputByteLength) ||
    value.outputByteLength < 1 ||
    !Number.isSafeInteger(value.elapsedMs) ||
    value.elapsedMs < 0 ||
    !Number.isSafeInteger(value.peakMemoryBytes) ||
    value.peakMemoryBytes < 0
  ) {
    throw new TypeError('Agent media transformation receipt is invalid.');
  }
  const omittedRegions = Object.freeze(
    value.omittedRegions
      .map((omission) => {
        const normalized = createAgentMediaOmission(omission);
        if (normalized.omissionDigest !== omission.omissionDigest) {
          throw new TypeError('Media omission digest drifted.');
        }
        return normalized;
      })
      .sort((left, right) =>
        compareUnicodeCodePoints(left.omissionDigest, right.omissionDigest)
      )
  );
  const diagnosticRefs = Object.freeze(
    [...value.diagnosticRefs].sort(compareUnicodeCodePoints)
  );
  if (
    new Set(diagnosticRefs).size !== diagnosticRefs.length ||
    diagnosticRefs.some((ref) => !ref.trim())
  ) {
    throw new TypeError('Media transformation diagnostics are invalid.');
  }
  const base = Object.freeze({
    transformationId: value.transformationId,
    transformerId: value.transformerId,
    transformerVersion: value.transformerVersion,
    transformerDigest: value.transformerDigest,
    operation: value.operation,
    parametersDigest: value.parametersDigest,
    inputDigest: value.inputDigest,
    outputDigest: value.outputDigest,
    outputMediaType: normalizeBinaryAssetMediaType(value.outputMediaType),
    outputByteLength: value.outputByteLength,
    loss: value.loss,
    omittedRegions,
    diagnosticRefs,
    elapsedMs: value.elapsedMs,
    peakMemoryBytes: value.peakMemoryBytes,
  });
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

const normalizeRepresentation = (
  value: AgentMediaRepresentation
): AgentMediaRepresentation => {
  if (
    !value.sourceDescriptorRef.mediaSourceId.trim() ||
    !isAgentCanonicalDigest(value.sourceDescriptorRef.descriptorDigest) ||
    !isAgentCanonicalDigest(value.finalContentDigest) ||
    !isAgentCanonicalDigest(value.providerBlockDigest) ||
    !['complete', 'partial'].includes(value.completeness) ||
    !Number.isSafeInteger(value.finalByteLength) ||
    value.finalByteLength < 1
  ) {
    throw new TypeError('Agent media representation identity is invalid.');
  }
  const transformationReceiptRefs = Object.freeze(
    [...value.transformationReceiptRefs]
      .map((ref) => {
        if (
          !ref.transformationId.trim() ||
          !isAgentCanonicalDigest(ref.receiptDigest)
        ) {
          throw new TypeError('Media transformation reference is invalid.');
        }
        return Object.freeze({ ...ref });
      })
      .sort((left, right) =>
        compareUnicodeCodePoints(left.transformationId, right.transformationId)
      )
  );
  if (
    new Set(
      transformationReceiptRefs.map(({ transformationId }) => transformationId)
    ).size !== transformationReceiptRefs.length
  ) {
    throw new TypeError('Media transformation references duplicate.');
  }
  const base = Object.freeze({
    sourceDescriptorRef: Object.freeze({ ...value.sourceDescriptorRef }),
    transformationReceiptRefs,
    finalContentDigest: value.finalContentDigest,
    finalMediaType: normalizeBinaryAssetMediaType(value.finalMediaType),
    finalByteLength: value.finalByteLength,
    providerBlockDigest: value.providerBlockDigest,
    completeness: value.completeness,
  });
  return Object.freeze({
    ...base,
    representationDigest: digestAgentCanonicalValue(base),
  });
};

const normalizeProvenance = (
  value: AgentGeneratedAssetProvenance
): AgentGeneratedAssetProvenance => {
  if (value.licenseDisposition !== 'unknown') {
    throw new TypeError('Generated asset license disposition must be unknown.');
  }
  for (const digest of [
    value.candidateDigest,
    value.providerArtifactIdentityDigest,
    value.capabilityQualificationDigest,
    ...value.inputRepresentationDigests,
    value.promptPolicyDigest,
    value.sourceDigest,
    value.sanitizedDigest,
    value.transformRecipeDigest,
    value.scannerAttestationDigest,
  ]) {
    if (!isAgentCanonicalDigest(digest)) {
      throw new TypeError('Generated asset provenance digest is invalid.');
    }
  }
  const inputRepresentationDigests = Object.freeze(
    [...value.inputRepresentationDigests].sort(compareUnicodeCodePoints)
  );
  if (
    new Set(inputRepresentationDigests).size !==
    inputRepresentationDigests.length
  ) {
    throw new TypeError('Generated asset provenance inputs duplicate.');
  }
  const base = Object.freeze({
    candidateDigest: value.candidateDigest,
    providerArtifactIdentityDigest: value.providerArtifactIdentityDigest,
    capabilityQualificationDigest: value.capabilityQualificationDigest,
    inputRepresentationDigests,
    promptPolicyDigest: value.promptPolicyDigest,
    sourceDigest: value.sourceDigest,
    sanitizedDigest: value.sanitizedDigest,
    transformRecipeDigest: value.transformRecipeDigest,
    scannerAttestationDigest: value.scannerAttestationDigest,
    licenseDisposition: 'unknown' as const,
  });
  return Object.freeze({
    ...base,
    provenanceDigest: digestAgentCanonicalValue(base),
  });
};

const normalizeProposal = (
  value: AgentGeneratedAssetProposal
): AgentGeneratedAssetProposal => {
  const finalReference = readBinaryAssetBlobReference(value.finalReference);
  const transformRecipe = readBinaryAssetTransformRecipe(value.transformRecipe);
  const scanAttestation = readBinaryAssetScanAttestation(value.scanAttestation);
  const provenance = normalizeProvenance(value.provenance);
  if (
    !identityPattern.test(value.proposalId) ||
    !identityPattern.test(value.candidateId) ||
    !identityPattern.test(value.taskId) ||
    !identityPattern.test(value.runId) ||
    !identityPattern.test(value.assetDocumentId) ||
    !Number.isSafeInteger(value.generation) ||
    value.generation < 1 ||
    value.proposalKind !== 'asset-create' ||
    scanAttestation.verdict !== 'clean' ||
    scanAttestation.subjectDigest !== finalReference.digest ||
    transformRecipe.recipeDigest !== provenance.transformRecipeDigest ||
    provenance.scannerAttestationDigest !==
      digestAgentCanonicalValue(scanAttestation) ||
    provenance.sanitizedDigest !== finalReference.digest ||
    value.requiredApproval !== 'exact-human' ||
    value.commitAuthority !== 'none-before-approval'
  ) {
    throw new TypeError('Generated asset proposal bypassed its G2 boundary.');
  }
  const base = Object.freeze({
    proposalId: value.proposalId,
    proposalKind: 'asset-create' as const,
    candidateId: value.candidateId,
    taskId: value.taskId,
    runId: value.runId,
    generation: value.generation,
    assetDocumentId: value.assetDocumentId,
    finalReference,
    transformRecipe,
    scanAttestation,
    provenance,
    requiredApproval: 'exact-human' as const,
    commitAuthority: 'none-before-approval' as const,
  });
  return Object.freeze({
    ...base,
    proposalDigest: digestAgentCanonicalValue(base),
  });
};

const normalizeFact = (fact: AgentMediaFact): AgentMediaFact => {
  switch (fact.factType) {
    case 'media-source-descriptor': {
      if (!validateAgentMediaSourceDescriptor(fact.value)) {
        throw new TypeError('Media source descriptor digest drifted.');
      }
      return Object.freeze({
        factType: fact.factType,
        value: createAgentMediaSourceDescriptor(fact.value),
      });
    }
    case 'media-transformation-receipt':
      return Object.freeze({
        factType: fact.factType,
        value: normalizeReceipt(fact.value),
      });
    case 'media-representation':
      return Object.freeze({
        factType: fact.factType,
        value: normalizeRepresentation(fact.value),
      });
    case 'generated-artifact-candidate': {
      if (!validateAgentGeneratedArtifactCandidate(fact.value)) {
        throw new TypeError('Generated artifact candidate digest drifted.');
      }
      return Object.freeze({
        factType: fact.factType,
        value: createAgentGeneratedArtifactCandidate(fact.value),
      });
    }
    case 'generated-asset-proposal':
      return Object.freeze({
        factType: fact.factType,
        value: normalizeProposal(fact.value),
      });
  }
};

export const migrateAgentMediaFactWire = (
  value: unknown
): AgentMediaFactDecodeResult => {
  const inspectionIssues = inspect(value);
  if (inspectionIssues.length > 0) {
    return Object.freeze({ ok: false, issues: inspectionIssues });
  }
  if (!isPlainObject(value) || value.wireVersion !== 1) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze([
        issue('/wireVersion', 'Unsupported Agent media fact wire version.'),
      ]),
    });
  }
  if (!validateWire(value)) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze([
        issue('/', 'Agent media fact does not match its strict envelope.'),
      ]),
    });
  }
  const wire = cloneJson(value as AgentMediaFactWire);
  const { wireVersion: _wireVersion, ...current } = wire;
  try {
    const normalized = normalizeFact(current);
    if (!sameCanonicalJson(normalized, current)) {
      throw new TypeError(
        'Agent media fact is non-canonical, has unknown fields, or drifted.'
      );
    }
    return Object.freeze({ ok: true, value: normalized });
  } catch (caught) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze([
        issue(
          '/value',
          caught instanceof Error
            ? caught.message
            : 'Agent media fact semantic validation failed.'
        ),
      ]),
    });
  }
};

export const decodeAgentMediaFact = migrateAgentMediaFactWire;

export const encodeAgentMediaFact = (
  fact: AgentMediaFact
): AgentMediaFactWire => {
  const normalized = normalizeFact(fact);
  if (!sameCanonicalJson(normalized, fact)) {
    throw new TypeError('Agent media fact is not canonical.');
  }
  return Object.freeze({ ...cloneJson(normalized), wireVersion: 1 });
};

export const serializeAgentMediaFact = (fact: AgentMediaFact): string =>
  canonicalJsonText(encodeAgentMediaFact(fact));
