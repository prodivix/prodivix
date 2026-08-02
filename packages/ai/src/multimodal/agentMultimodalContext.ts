import { computeBinaryAssetDigest } from '@prodivix/assets';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import {
  canonicalizeAgentWorkspaceRevision,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentWorkspaceRevisionVector,
  sameAgentWorkspaceRevision,
} from '../domain/agentCanonical';
import { createAgentProviderDataPolicy } from '../providers/agentProviderIdentity';
import { createAgentUsageVector } from '../usage/agentUsage';
import { executeAgentMediaTransformChain } from './agentMediaTransform';
import type {
  AgentMediaRepresentation,
  AgentMediaTransformationReceipt,
  AgentMediaTransformIssue,
  AgentModalityProfile,
  AgentMultimodalContextBuildRequest,
  AgentMultimodalContextBuildResult,
  AgentMultimodalContextItem,
  AgentProviderMediaBlock,
  AgentProviderMediaBlockKind,
  AgentProviderMediaBlockManifest,
} from './agentMultimodal.types';
import type { AgentProviderDataPolicy } from '../providers/agentProvider.types';

const issue = (
  code: AgentMediaTransformIssue['code'],
  path: string,
  message: string
): AgentMediaTransformIssue =>
  Object.freeze({ code, path, message, blocking: true });

const compareIssues = (
  left: AgentMediaTransformIssue,
  right: AgentMediaTransformIssue
): number =>
  compareUnicodeCodePoints(left.path, right.path) ||
  compareUnicodeCodePoints(left.code, right.code) ||
  compareUnicodeCodePoints(left.message, right.message);

const sensitivityOrder = Object.freeze({
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
});

const providerBlockKind = (
  profile: AgentModalityProfile
): AgentProviderMediaBlockKind => {
  switch (profile.kind) {
    case 'raster-image':
    case 'screenshot':
      return 'input-image';
    case 'pdf':
    case 'document':
      return 'input-document';
    case 'audio':
      return 'input-audio';
    case 'video':
      return 'input-video';
    default:
      throw new TypeError('Modality has no Provider media block mapping.');
  }
};

const providerBlockType = (
  protocolFamily: AgentProviderMediaBlock['protocolFamily'],
  kind: AgentProviderMediaBlockKind
): AgentProviderMediaBlock['providerBlockType'] => {
  switch (protocolFamily) {
    case 'openai-responses':
      return kind === 'input-image' ? 'input_image' : 'input_file';
    case 'anthropic-messages':
      return kind === 'input-image' ? 'image' : 'document';
    case 'gemini-interactions':
      return 'inline_data';
  }
};

const providerDataPolicyIsUsable = (
  policy: AgentProviderDataPolicy,
  sensitivity: AgentMultimodalContextItem['sensitivity']
): boolean => {
  try {
    const { policyDigest: _policyDigest, ...base } = policy;
    if (
      createAgentProviderDataPolicy(base).policyDigest !== policy.policyDigest
    ) {
      return false;
    }
  } catch {
    return false;
  }
  if (
    policy.deletionReceipt === 'unknown' ||
    policy.storage === 'unknown' ||
    policy.ambientMemory !== 'disabled' ||
    policy.cacheIsolation === 'unknown' ||
    policy.cacheIsolation === 'cross-tenant'
  ) {
    return false;
  }
  if (
    sensitivityOrder[sensitivity] > sensitivityOrder[policy.maximumSensitivity]
  ) {
    return false;
  }
  return !(
    sensitivity === 'restricted' &&
    (policy.retentionDays > 0 || policy.deletionReceipt !== 'available')
  );
};

export const normalizeAgentProviderMediaBlock = (
  input: Readonly<{
    protocolFamily: AgentProviderMediaBlock['protocolFamily'];
    profile: AgentModalityProfile;
    item: AgentMultimodalContextItem;
    representation: AgentMediaRepresentation;
    contents: Uint8Array;
    providerDataPolicy: AgentProviderDataPolicy;
  }>
): AgentProviderMediaBlock => {
  if (
    !(input.contents instanceof Uint8Array) ||
    input.contents.byteLength !== input.representation.finalByteLength ||
    computeBinaryAssetDigest(input.contents) !==
      input.representation.finalContentDigest ||
    input.item.contentDigest !== input.representation.finalContentDigest ||
    input.item.mediaRepresentationRef.representationDigest !==
      input.representation.representationDigest ||
    !providerDataPolicyIsUsable(
      input.providerDataPolicy,
      input.item.sensitivity
    )
  ) {
    throw new TypeError(
      'Provider media block failed bytes, representation, or retention preflight.'
    );
  }
  const expectedProviderBlockDigest = digestAgentCanonicalValue({
    contentDigest: input.representation.finalContentDigest,
    mediaType: input.representation.finalMediaType,
    byteLength: input.representation.finalByteLength,
    modalityProfileDigest: input.profile.profileDigest,
  });
  if (
    input.representation.providerBlockDigest !== expectedProviderBlockDigest
  ) {
    throw new TypeError('Provider-neutral media block identity drifted.');
  }
  const kind = providerBlockKind(input.profile);
  const base = Object.freeze({
    blockId: `media-block:${input.protocolFamily}:${input.representation.representationDigest.slice('sha256-'.length)}`,
    protocolFamily: input.protocolFamily,
    providerBlockType: providerBlockType(input.protocolFamily, kind),
    kind,
    representationDigest: input.representation.representationDigest,
    contentDigest: input.representation.finalContentDigest,
    mediaType: input.representation.finalMediaType,
    byteLength: input.representation.finalByteLength,
    payloadAuthority: 'callback-bound-bytes' as const,
    instructionBoundary: 'data-only' as const,
  });
  return Object.freeze({
    ...base,
    blockDigest: digestAgentCanonicalValue(base),
  });
};

export const createAgentProviderMediaBlockManifest = (
  input: Readonly<{
    protocolFamily: AgentProviderMediaBlock['protocolFamily'];
    blocks: readonly AgentProviderMediaBlock[];
    dataPolicyDigest: string;
  }>
): AgentProviderMediaBlockManifest => {
  if (!isAgentCanonicalDigest(input.dataPolicyDigest)) {
    throw new TypeError('Provider media block policy digest is invalid.');
  }
  const blocks = Object.freeze(
    [...input.blocks].sort((left, right) =>
      compareUnicodeCodePoints(left.blockId, right.blockId)
    )
  );
  if (
    new Set(blocks.map(({ blockId }) => blockId)).size !== blocks.length ||
    blocks.some(
      (block) =>
        block.protocolFamily !== input.protocolFamily ||
        block.blockDigest !==
          digestAgentCanonicalValue({
            blockId: block.blockId,
            protocolFamily: block.protocolFamily,
            providerBlockType: block.providerBlockType,
            kind: block.kind,
            representationDigest: block.representationDigest,
            contentDigest: block.contentDigest,
            mediaType: block.mediaType,
            byteLength: block.byteLength,
            payloadAuthority: block.payloadAuthority,
            instructionBoundary: block.instructionBoundary,
          })
    )
  ) {
    throw new TypeError('Provider media blocks are duplicated or drifted.');
  }
  const base = Object.freeze({
    protocolFamily: input.protocolFamily,
    blocks,
    dataPolicyDigest: input.dataPolicyDigest,
  });
  return Object.freeze({
    ...base,
    manifestDigest: digestAgentCanonicalValue(base),
  });
};

const createContextItem = (
  input: Readonly<{
    profile: AgentModalityProfile;
    source: AgentMultimodalContextBuildRequest['media'][number]['source'];
    representation: AgentMediaRepresentation;
    receipts: readonly AgentMediaTransformationReceipt[];
  }>
): AgentMultimodalContextItem => {
  const omissionRefs = Object.freeze(
    input.receipts
      .flatMap(({ omittedRegions }) => omittedRegions)
      .map(({ omissionDigest }) => Object.freeze({ omissionDigest }))
      .sort((left, right) =>
        compareUnicodeCodePoints(left.omissionDigest, right.omissionDigest)
      )
  );
  const base = Object.freeze({
    itemId: `multimodal-context-item:${input.representation.representationDigest.slice('sha256-'.length)}`,
    modalityProfileRef: Object.freeze({
      modalityProfileId: input.profile.modalityProfileId,
      profileDigest: input.profile.profileDigest,
    }),
    authority: input.source.authority,
    mediaRepresentationRef: Object.freeze({
      representationDigest: input.representation.representationDigest,
    }),
    contentDigest: input.representation.finalContentDigest,
    sensitivity: input.source.sensitivity,
    instructionBoundary: 'data-only' as const,
    ...(input.source.sourceTraceRef
      ? { sourceTraceRef: input.source.sourceTraceRef }
      : {}),
    omissionRefs,
  });
  return Object.freeze({
    ...base,
    itemDigest: digestAgentCanonicalValue(base),
  });
};

/** Builds a revision-bound media extension without placing bytes in Context. */
export const buildAgentMultimodalContext = async (
  request: AgentMultimodalContextBuildRequest
): Promise<AgentMultimodalContextBuildResult> => {
  const issues: AgentMediaTransformIssue[] = [];
  if (
    !request.taskId.trim() ||
    !request.runId.trim() ||
    !Number.isSafeInteger(request.generation) ||
    request.generation < 1 ||
    !isAgentCanonicalDigest(request.baseContextPackDigest) ||
    !isAgentWorkspaceRevisionVector(request.workspaceRevision) ||
    !['explain', 'plan', 'propose', 'apply'].includes(request.taskMode) ||
    !['openai-responses', 'anthropic-messages', 'gemini-interactions'].includes(
      request.protocolFamily
    )
  ) {
    issues.push(
      issue(
        'AI-9001',
        '/identity',
        'Multimodal Context requires Task, Run, generation, and base Context identities.'
      )
    );
  }
  const sourceIds = request.media.map(({ source }) => source.mediaSourceId);
  if (new Set(sourceIds).size !== sourceIds.length) {
    issues.push(
      issue(
        'AI-7010',
        '/media',
        'Multimodal Context media source identities must be unique.'
      )
    );
  }
  for (const [index, entry] of request.media.entries()) {
    if (
      entry.source.workspaceRevision &&
      !sameAgentWorkspaceRevision(
        entry.source.workspaceRevision,
        request.workspaceRevision
      )
    ) {
      issues.push(
        issue(
          'AI-7010',
          `/media/${index}/workspaceRevision`,
          'Media source is stale for the requested Workspace revision.'
        )
      );
    }
  }
  if (issues.length > 0) {
    return Object.freeze({
      status: 'blocked',
      issues: Object.freeze(issues.sort(compareIssues)),
      safetyReceipts: Object.freeze([]),
    });
  }

  const transformed = await Promise.all(
    request.media.map(async (entry) => ({
      entry,
      result: await executeAgentMediaTransformChain({
        taskMode: request.taskMode,
        profile: entry.profile,
        source: entry.source,
        contents: entry.contents,
        steps: entry.steps,
        scanner: entry.scanner,
      }),
    }))
  );
  const blocked = transformed.flatMap(({ result }) =>
    result.status === 'blocked' ? result.issues : []
  );
  const safetyReceipts = transformed.flatMap(
    ({ result }) => result.safetyReceipts
  );
  if (blocked.length > 0) {
    return Object.freeze({
      status: 'blocked',
      issues: Object.freeze([...blocked].sort(compareIssues)),
      safetyReceipts: Object.freeze(safetyReceipts),
    });
  }

  const ready = transformed.flatMap(({ entry, result }) =>
    result.status === 'ready' ? [{ entry, result }] : []
  );
  const rows = ready.map(({ entry, result }) => {
    const item = createContextItem({
      profile: entry.profile,
      source: entry.source,
      representation: result.representation,
      receipts: result.transformationReceipts,
    });
    let block: AgentProviderMediaBlock;
    try {
      block = normalizeAgentProviderMediaBlock({
        protocolFamily: request.protocolFamily,
        profile: entry.profile,
        item,
        representation: result.representation,
        contents: result.contents,
        providerDataPolicy: request.providerDataPolicy,
      });
    } catch {
      issues.push(
        issue(
          'AI-7010',
          `/media/${encodeURIComponent(entry.source.mediaSourceId)}/providerBlock`,
          'Provider media block normalization or retention preflight failed.'
        )
      );
      return undefined;
    }
    return { entry, result, item, block };
  });
  if (issues.length > 0 || rows.some((row) => row === undefined)) {
    return Object.freeze({
      status: 'blocked',
      issues: Object.freeze(issues.sort(compareIssues)),
      safetyReceipts: Object.freeze(safetyReceipts),
    });
  }
  const completeRows = rows.filter(
    (row): row is Exclude<(typeof rows)[number], undefined> => row !== undefined
  );
  const providerBlockManifest = createAgentProviderMediaBlockManifest({
    protocolFamily: request.protocolFamily,
    blocks: completeRows.map(({ block }) => block),
    dataPolicyDigest: request.providerDataPolicy.policyDigest,
  });
  const items = Object.freeze(
    completeRows
      .map(({ item }) => item)
      .sort((left, right) =>
        compareUnicodeCodePoints(left.itemId, right.itemId)
      )
  );
  const representations = Object.freeze(
    completeRows
      .map(({ result }) => result.representation)
      .sort((left, right) =>
        compareUnicodeCodePoints(
          left.representationDigest,
          right.representationDigest
        )
      )
  );
  const usage = createAgentUsageVector(
    completeRows.flatMap(({ result }) => result.usage.amounts)
  );
  const manifestBase = Object.freeze({
    taskId: request.taskId,
    runId: request.runId,
    generation: request.generation,
    taskMode: request.taskMode,
    workspaceRevision: canonicalizeAgentWorkspaceRevision(
      request.workspaceRevision
    ),
    baseContextPackDigest: request.baseContextPackDigest,
    items,
    representations,
    providerBlockManifest,
    usage,
  });
  const manifest = Object.freeze({
    ...manifestBase,
    manifestDigest: digestAgentCanonicalValue(manifestBase),
  });
  const payloadByRepresentation = new Map(
    completeRows.map(({ result }) => [
      result.representation.representationDigest,
      result.contents,
    ])
  );
  return Object.freeze({
    status: 'ready',
    manifest,
    ephemeralPayloads: Object.freeze(
      providerBlockManifest.blocks.map(({ blockId, representationDigest }) =>
        Object.freeze({
          blockId,
          contents: new Uint8Array(
            payloadByRepresentation.get(representationDigest) ?? []
          ),
        })
      )
    ),
    transformationReceipts: Object.freeze(
      completeRows.flatMap(({ result }) => result.transformationReceipts)
    ),
    safetyReceipts: Object.freeze(safetyReceipts),
  });
};
