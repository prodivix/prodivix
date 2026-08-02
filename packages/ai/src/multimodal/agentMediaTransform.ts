import {
  computeBinaryAssetDigest,
  createBinaryAssetBlobReference,
  createBinaryAssetMaterialization,
  normalizeBinaryAssetMediaType,
  sanitizeBinaryAssetJpeg,
  sanitizeBinaryAssetPng,
  type BinaryAssetContentScanner,
} from '@prodivix/assets';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import { contentContainsInstructionInjection } from '../context/agentContextValidation';
import { createAgentUsageVector } from '../usage/agentUsage';
import type { AgentUsageAmount } from '../providers/agentProvider.types';
import {
  createAgentMediaOmission,
  createAgentMediaSafetyScannerDescriptor,
  createAgentMediaTransformerDescriptor,
  digestAgentMediaParameters,
  validateAgentMediaSourceDescriptor,
  validateAgentModalityProfile,
} from './agentMediaIdentity';
import type {
  AgentMediaExtractedSignal,
  AgentMediaExtractedSignalKind,
  AgentMediaSafetyReceipt,
  AgentMediaSafetyScanner,
  AgentMediaSafetyVerdict,
  AgentMediaTransformIssue,
  AgentMediaTransformOutput,
  AgentMediaTransformResult,
  AgentMediaTransformStep,
  AgentMediaTransformationReceipt,
  AgentMediaTransformer,
  AgentMediaTransformerDescriptor,
  AgentModalityProfile,
  AgentMediaSourceDescriptor,
} from './agentMultimodal.types';
import type { AgentTaskMode } from '../domain/agent.types';

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

const extractedSignalKinds = new Set<AgentMediaExtractedSignalKind>([
  'ocr',
  'pdf-layer',
  'qr',
  'metadata',
  'caption',
  'transcript',
  'tool-media-result',
]);
const safetyVerdicts = new Set<AgentMediaSafetyVerdict>([
  'clean',
  'quarantined',
  'corrupt',
  'oversized',
  'bomb',
  'unsupported',
]);

const normalizeSignals = (
  signals: readonly Readonly<{
    kind: AgentMediaExtractedSignalKind;
    text: string;
  }>[] = []
): readonly AgentMediaExtractedSignal[] =>
  Object.freeze(
    signals
      .map((signal): AgentMediaExtractedSignal => {
        if (
          !extractedSignalKinds.has(signal.kind) ||
          !signal.text.length ||
          signal.text.length > 1_000_000
        ) {
          throw new TypeError('Media extracted signal is empty or oversized.');
        }
        return Object.freeze({
          kind: signal.kind,
          text: signal.text,
          contentDigest: digestAgentCanonicalValue(signal.text),
          instructionBoundary: 'data-only',
        });
      })
      .sort(
        (left, right) =>
          compareUnicodeCodePoints(left.kind, right.kind) ||
          compareUnicodeCodePoints(left.contentDigest, right.contentDigest)
      )
  );

const createSafetyReceipt = (
  scanner: AgentMediaSafetyScanner,
  input: Readonly<{
    subjectDigest: string;
    verdict: AgentMediaSafetyVerdict;
    findingCodes: readonly string[];
    extractedSignals?: readonly Readonly<{
      kind: AgentMediaExtractedSignalKind;
      text: string;
    }>[];
  }>
): AgentMediaSafetyReceipt => {
  if (
    !isAgentCanonicalDigest(input.subjectDigest) ||
    !safetyVerdicts.has(input.verdict) ||
    input.findingCodes.some((code) => !code.trim() || code.length > 256)
  ) {
    throw new TypeError('Media safety result is invalid.');
  }
  const descriptor = createAgentMediaSafetyScannerDescriptor(
    scanner.descriptor
  );
  const findingCodes = Object.freeze(
    [...new Set(input.findingCodes)].sort(compareUnicodeCodePoints)
  );
  const extractedSignals = normalizeSignals(input.extractedSignals);
  const base = Object.freeze({
    scannerDigest: descriptor.descriptorDigest,
    scannerId: descriptor.scannerId,
    scannerVersion: descriptor.scannerVersion,
    subjectDigest: input.subjectDigest,
    verdict: input.verdict,
    findingCodes,
    extractedSignals,
  });
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

const scan = async (
  scanner: AgentMediaSafetyScanner,
  source: AgentMediaSourceDescriptor,
  contents: Uint8Array,
  mediaType: string,
  phase: 'source' | 'representation'
): Promise<AgentMediaSafetyReceipt> => {
  const descriptor = createAgentMediaSafetyScannerDescriptor(
    scanner.descriptor
  );
  if (!descriptor.supportedMediaTypes.includes(mediaType)) {
    return createSafetyReceipt(scanner, {
      subjectDigest: computeBinaryAssetDigest(contents),
      verdict: 'unsupported',
      findingCodes: ['media-type-unsupported'],
    });
  }
  const subjectDigest = computeBinaryAssetDigest(contents);
  try {
    const result = await scanner.scan({
      source,
      subjectDigest,
      mediaType,
      contents: new Uint8Array(contents),
      phase,
    });
    return createSafetyReceipt(scanner, {
      subjectDigest,
      verdict: result.verdict,
      findingCodes: result.findingCodes,
      extractedSignals: result.extractedSignals,
    });
  } catch {
    return createSafetyReceipt(scanner, {
      subjectDigest,
      verdict: 'corrupt',
      findingCodes: ['scanner-failed-closed'],
    });
  }
};

const mediaLimitsAllow = (
  profile: AgentModalityProfile,
  source: AgentMediaSourceDescriptor
): boolean => {
  const limits = profile.hardLimits;
  if (
    source.byteLength > limits.maxSourceBytes ||
    (source.dimensions &&
      ((limits.maxWidth !== undefined &&
        source.dimensions.width > limits.maxWidth) ||
        (limits.maxHeight !== undefined &&
          source.dimensions.height > limits.maxHeight) ||
        (limits.maxPixels !== undefined &&
          source.dimensions.width * source.dimensions.height >
            limits.maxPixels))) ||
    (source.pageCount !== undefined &&
      limits.maxPages !== undefined &&
      source.pageCount > limits.maxPages) ||
    (source.durationMs !== undefined &&
      limits.maxDurationMs !== undefined &&
      source.durationMs > limits.maxDurationMs) ||
    (source.durationMs !== undefined &&
      source.frameRate !== undefined &&
      limits.maxFrames !== undefined &&
      Math.ceil((source.durationMs / 1_000) * Number(source.frameRate)) >
        limits.maxFrames)
  ) {
    return false;
  }
  return true;
};

const validateTransformer = (
  step: AgentMediaTransformStep,
  mediaType: string
): AgentMediaTransformerDescriptor => {
  const descriptor = createAgentMediaTransformerDescriptor(
    step.transformer.descriptor
  );
  if (
    !descriptor.operations.includes(step.operation) ||
    !descriptor.inputMediaTypes.includes(mediaType)
  ) {
    throw new TypeError(
      'Media transformer does not cover the requested operation/input.'
    );
  }
  digestAgentMediaParameters(step.parameters);
  return descriptor;
};

const usageFor = (
  input: Readonly<{
    source: AgentMediaSourceDescriptor;
    finalByteLength: number;
    receipts: readonly AgentMediaTransformationReceipt[];
    signals: readonly AgentMediaExtractedSignal[];
  }>
) => {
  const amounts: AgentUsageAmount[] = [
    {
      unit: 'media-source-byte',
      logicalAmount: String(input.source.byteLength),
      billableAmount: String(input.source.byteLength),
      confidence: 'measured',
      sourceDigest: input.source.contentDigest,
    },
    {
      unit: 'media-processed-byte',
      logicalAmount: String(input.finalByteLength),
      billableAmount: String(input.finalByteLength),
      confidence: 'measured',
    },
    {
      unit: 'provider-upload-byte',
      logicalAmount: String(input.finalByteLength),
      billableAmount: String(input.finalByteLength),
      confidence: 'measured',
    },
  ];
  if (
    input.source.kind === 'raster-image' ||
    input.source.kind === 'screenshot'
  ) {
    amounts.push({
      unit: 'image',
      logicalAmount: '1',
      billableAmount: '1',
      confidence: 'measured',
    });
    if (input.source.dimensions) {
      const pixels = String(
        input.source.dimensions.width * input.source.dimensions.height
      );
      amounts.push({
        unit: 'image-pixel',
        logicalAmount: pixels,
        billableAmount: pixels,
        confidence: 'measured',
      });
    }
  }
  if (input.source.kind === 'pdf' || input.source.kind === 'document') {
    const pages = String(input.source.pageCount ?? 1);
    amounts.push({
      unit: 'document-page',
      logicalAmount: pages,
      billableAmount: pages,
      confidence: 'measured',
    });
  }
  const ocrCharacters = input.signals
    .filter(({ kind }) => kind === 'ocr' || kind === 'pdf-layer')
    .reduce((total, { text }) => total + text.length, 0);
  if (ocrCharacters > 0) {
    amounts.push({
      unit: 'ocr-character',
      logicalAmount: String(ocrCharacters),
      billableAmount: String(ocrCharacters),
      confidence: 'measured',
    });
  }
  const elapsedMs = input.receipts.reduce(
    (total, receipt) => total + receipt.elapsedMs,
    0
  );
  const memoryByteSeconds = input.receipts.reduce(
    (total, receipt) =>
      total + (receipt.peakMemoryBytes * receipt.elapsedMs) / 1_000,
    0
  );
  amounts.push({
    unit: 'transform-compute-millisecond',
    logicalAmount: String(elapsedMs),
    billableAmount: String(elapsedMs),
    confidence: 'measured',
  });
  amounts.push({
    unit: 'transform-memory-byte-second',
    logicalAmount: String(Math.ceil(memoryByteSeconds)),
    billableAmount: String(Math.ceil(memoryByteSeconds)),
    confidence: 'measured',
  });
  return createAgentUsageVector(amounts);
};

/**
 * Executes a bounded byte chain. Raw media stays in the returned ephemeral
 * payload and never enters the representation or receipt digests.
 */
export const executeAgentMediaTransformChain = async (
  input: Readonly<{
    taskMode: AgentTaskMode;
    profile: AgentModalityProfile;
    source: AgentMediaSourceDescriptor;
    contents: Uint8Array;
    steps: readonly AgentMediaTransformStep[];
    scanner: AgentMediaSafetyScanner;
  }>
): Promise<AgentMediaTransformResult> => {
  const issues: AgentMediaTransformIssue[] = [];
  const safetyReceipts: AgentMediaSafetyReceipt[] = [];
  if (
    !['explain', 'plan', 'propose', 'apply'].includes(input.taskMode) ||
    !validateAgentModalityProfile(input.profile) ||
    !validateAgentMediaSourceDescriptor(input.source) ||
    input.profile.direction !== 'input' ||
    input.profile.kind !== input.source.kind
  ) {
    return Object.freeze({
      status: 'blocked',
      issues: Object.freeze([
        issue(
          'AI-7010',
          '/source',
          'Media source and modality profile identity are incompatible.'
        ),
      ]),
      safetyReceipts: Object.freeze([]),
    });
  }
  const mediaType = normalizeBinaryAssetMediaType(input.source.mediaType);
  if (
    !(input.contents instanceof Uint8Array) ||
    input.contents.byteLength !== input.source.byteLength ||
    computeBinaryAssetDigest(input.contents) !== input.source.contentDigest ||
    !input.profile.acceptedMediaTypes.includes(mediaType)
  ) {
    return Object.freeze({
      status: 'blocked',
      issues: Object.freeze([
        issue(
          'AI-7010',
          '/source/contentDigest',
          'Media bytes, digest, length, or accepted type drifted.'
        ),
      ]),
      safetyReceipts: Object.freeze([]),
    });
  }
  if (!mediaLimitsAllow(input.profile, input.source)) {
    return Object.freeze({
      status: 'blocked',
      issues: Object.freeze([
        issue(
          'AI-6002',
          '/source/limits',
          'Media source exceeds its hard byte, pixel, page, or duration limit.'
        ),
      ]),
      safetyReceipts: Object.freeze([]),
    });
  }
  if (input.steps.length > input.profile.hardLimits.maxTransforms) {
    return Object.freeze({
      status: 'blocked',
      issues: Object.freeze([
        issue(
          'AI-6002',
          '/transforms',
          'Media transform count exceeds the modality profile ceiling.'
        ),
      ]),
      safetyReceipts: Object.freeze([]),
    });
  }

  const sourceScan = await scan(
    input.scanner,
    input.source,
    input.contents,
    mediaType,
    'source'
  );
  safetyReceipts.push(sourceScan);
  if (sourceScan.verdict !== 'clean') {
    return Object.freeze({
      status: 'blocked',
      issues: Object.freeze([
        issue(
          'AI-7010',
          '/source/scan',
          `Media source scanner rejected ${sourceScan.verdict} content.`
        ),
      ]),
      safetyReceipts: Object.freeze(safetyReceipts),
    });
  }

  let currentContents = new Uint8Array(input.contents);
  let currentDigest = input.source.contentDigest;
  let currentMediaType = mediaType;
  let totalElapsedMs = 0;
  const receipts: AgentMediaTransformationReceipt[] = [];
  const extractedSignals: AgentMediaExtractedSignal[] = [
    ...sourceScan.extractedSignals,
  ];
  for (const [index, step] of input.steps.entries()) {
    let descriptor: AgentMediaTransformerDescriptor;
    try {
      descriptor = validateTransformer(step, currentMediaType);
    } catch {
      issues.push(
        issue(
          'AI-7010',
          `/transforms/${index}`,
          'Media transformer identity, operation, parameters, or input type is invalid.'
        )
      );
      break;
    }
    let output: AgentMediaTransformOutput;
    try {
      output = await step.transformer.transform({
        operation: step.operation,
        parameters: step.parameters,
        source: input.source,
        inputDigest: currentDigest,
        inputMediaType: currentMediaType,
        contents: new Uint8Array(currentContents),
      });
    } catch {
      issues.push(
        issue(
          'AI-7010',
          `/transforms/${index}`,
          'Media transformer failed before producing a bounded receipt.'
        )
      );
      break;
    }
    if (
      !(output.contents instanceof Uint8Array) ||
      output.contents.byteLength < 1
    ) {
      issues.push(
        issue(
          'AI-7010',
          `/transforms/${index}/output`,
          'Media transformer returned no verified bytes.'
        )
      );
      break;
    }
    let outputMediaType: string;
    try {
      outputMediaType = normalizeBinaryAssetMediaType(output.mediaType);
    } catch {
      issues.push(
        issue(
          'AI-7010',
          `/transforms/${index}/mediaType`,
          'Media transformer returned an invalid media type.'
        )
      );
      break;
    }
    if (
      !descriptor.outputMediaTypes.includes(outputMediaType) ||
      output.contents.byteLength > input.profile.hardLimits.maxFinalBytes ||
      !Number.isSafeInteger(output.elapsedMs) ||
      output.elapsedMs < 0 ||
      !Number.isSafeInteger(output.peakMemoryBytes) ||
      output.peakMemoryBytes < 0 ||
      totalElapsedMs + output.elapsedMs >
        input.profile.hardLimits.maxTransformElapsedMs ||
      output.peakMemoryBytes > input.profile.hardLimits.maxTransformMemoryBytes
    ) {
      issues.push(
        issue(
          'AI-6002',
          `/transforms/${index}/limits`,
          'Media transform output, elapsed time, or memory exceeded its hard limit.'
        )
      );
      break;
    }
    let omissions;
    let signals;
    try {
      if (
        !['none', 'bounded-lossy', 'unknown'].includes(output.loss) ||
        (output.omissions?.length ?? 0) > 10_000 ||
        (output.extractedSignals?.length ?? 0) > 10_000
      ) {
        throw new TypeError('Media transform derived output is invalid.');
      }
      omissions = Object.freeze(
        (output.omissions ?? []).map(createAgentMediaOmission)
      );
      signals = normalizeSignals(output.extractedSignals);
    } catch {
      issues.push(
        issue(
          'AI-7010',
          `/transforms/${index}/derived`,
          'Media transform omission or derived-text identity is invalid.'
        )
      );
      break;
    }
    extractedSignals.push(...signals);
    const outputDigest = computeBinaryAssetDigest(output.contents);
    const receiptBase = Object.freeze({
      transformationId: `media-transform:${index}:${outputDigest.slice('sha256-'.length)}`,
      transformerId: descriptor.transformerId,
      transformerVersion: descriptor.transformerVersion,
      transformerDigest: descriptor.descriptorDigest,
      operation: step.operation,
      parametersDigest: digestAgentMediaParameters(step.parameters),
      inputDigest: currentDigest,
      outputDigest,
      outputMediaType,
      outputByteLength: output.contents.byteLength,
      loss: output.loss,
      omittedRegions: omissions,
      diagnosticRefs: Object.freeze([]),
      elapsedMs: output.elapsedMs,
      peakMemoryBytes: output.peakMemoryBytes,
    });
    receipts.push(
      Object.freeze({
        ...receiptBase,
        receiptDigest: digestAgentCanonicalValue(receiptBase),
      })
    );
    currentContents = new Uint8Array(output.contents);
    currentDigest = outputDigest;
    currentMediaType = outputMediaType;
    totalElapsedMs += output.elapsedMs;
  }
  if (issues.length > 0) {
    return Object.freeze({
      status: 'blocked',
      issues: Object.freeze(issues.sort(compareIssues)),
      safetyReceipts: Object.freeze(safetyReceipts),
    });
  }

  if (currentContents.byteLength > input.profile.hardLimits.maxFinalBytes) {
    return Object.freeze({
      status: 'blocked',
      issues: Object.freeze([
        issue(
          'AI-6002',
          '/representation/byteLength',
          'Final media representation exceeds its hard byte ceiling.'
        ),
      ]),
      safetyReceipts: Object.freeze(safetyReceipts),
    });
  }

  const finalScan = await scan(
    input.scanner,
    input.source,
    currentContents,
    currentMediaType,
    'representation'
  );
  safetyReceipts.push(finalScan);
  extractedSignals.push(...finalScan.extractedSignals);
  if (finalScan.verdict !== 'clean') {
    issues.push(
      issue(
        'AI-7010',
        '/representation/scan',
        `Final media scanner rejected ${finalScan.verdict} content.`
      )
    );
  }
  if (
    currentMediaType === 'image/svg+xml' ||
    currentMediaType === 'text/html' ||
    currentMediaType === 'application/xhtml+xml' ||
    (input.source.kind === 'svg' &&
      currentMediaType !== 'image/png' &&
      currentMediaType !== 'image/jpeg')
  ) {
    issues.push(
      issue(
        'AI-7010',
        '/representation/activeContent',
        'Active SVG/document content must be sanitized or rasterized before Provider disclosure.'
      )
    );
  }
  if (
    extractedSignals.some(({ text }) =>
      contentContainsInstructionInjection(text)
    )
  ) {
    issues.push(
      issue(
        'AI-7002',
        '/representation/signals',
        'Embedded media instruction remains data-only and is blocked from Provider disclosure.'
      )
    );
  }
  const omissions = receipts.flatMap(({ omittedRegions }) => omittedRegions);
  if (
    omissions.length > 0 &&
    (input.taskMode === 'propose' || input.taskMode === 'apply')
  ) {
    issues.push(
      issue(
        'AI-7010',
        '/representation/omissions',
        'Apply-capable media Context cannot claim completeness with omitted regions.'
      )
    );
  }
  if (
    receipts.some(({ loss }) => loss === 'unknown') &&
    (input.taskMode === 'propose' || input.taskMode === 'apply')
  ) {
    issues.push(
      issue(
        'AI-7010',
        '/representation/loss',
        'Unknown media transformation loss cannot ground an apply-capable proposal.'
      )
    );
  }
  if (issues.length > 0) {
    return Object.freeze({
      status: 'blocked',
      issues: Object.freeze(issues.sort(compareIssues)),
      safetyReceipts: Object.freeze(safetyReceipts),
    });
  }

  const receiptRefs = Object.freeze(
    receipts.map(({ transformationId, receiptDigest }) =>
      Object.freeze({ transformationId, receiptDigest })
    )
  );
  const sourceDescriptorRef = Object.freeze({
    mediaSourceId: input.source.mediaSourceId,
    descriptorDigest: input.source.descriptorDigest,
  });
  const providerBlockDigest = digestAgentCanonicalValue({
    contentDigest: currentDigest,
    mediaType: currentMediaType,
    byteLength: currentContents.byteLength,
    modalityProfileDigest: input.profile.profileDigest,
  });
  const representationBase = Object.freeze({
    sourceDescriptorRef,
    transformationReceiptRefs: receiptRefs,
    finalContentDigest: currentDigest,
    finalMediaType: currentMediaType,
    finalByteLength: currentContents.byteLength,
    providerBlockDigest,
    completeness:
      omissions.length > 0 ? ('partial' as const) : ('complete' as const),
  });
  const representation = Object.freeze({
    ...representationBase,
    representationDigest: digestAgentCanonicalValue(representationBase),
  });
  const canonicalSignals = Object.freeze(
    [...extractedSignals].sort(
      (left, right) =>
        compareUnicodeCodePoints(left.kind, right.kind) ||
        compareUnicodeCodePoints(left.contentDigest, right.contentDigest)
    )
  );
  return Object.freeze({
    status: 'ready',
    representation,
    transformationReceipts: Object.freeze(receipts),
    safetyReceipts: Object.freeze(safetyReceipts),
    extractedSignals: canonicalSignals,
    contents: new Uint8Array(currentContents),
    usage: usageFor({
      source: input.source,
      finalByteLength: currentContents.byteLength,
      receipts,
      signals: canonicalSignals,
    }),
  });
};

export const createScriptedAgentMediaTransformer = (
  input: Readonly<{
    descriptor: AgentMediaTransformerDescriptor;
    transform(
      request: Parameters<AgentMediaTransformer['transform']>[0]
    ): AgentMediaTransformOutput | Promise<AgentMediaTransformOutput>;
  }>
): AgentMediaTransformer => {
  const descriptor = createAgentMediaTransformerDescriptor(input.descriptor);
  return Object.freeze({
    descriptor,
    async transform(
      request: Parameters<AgentMediaTransformer['transform']>[0]
    ) {
      return input.transform(request);
    },
  });
};

/** Real deterministic raster sanitizer backed by the G2 Asset owner. */
export const createBinaryAssetSanitizeMediaTransformer =
  (): AgentMediaTransformer => {
    const descriptor = createAgentMediaTransformerDescriptor({
      transformerId: 'prodivix.agent-media.g2-raster-sanitize',
      transformerVersion: '1',
      implementationDigest: digestAgentCanonicalValue(
        'g2-png-jpeg-sanitizers@1'
      ),
      operations: ['redact'],
      inputMediaTypes: ['image/jpeg', 'image/png'],
      outputMediaTypes: ['image/jpeg', 'image/png'],
      deterministic: true,
    });
    return Object.freeze({
      descriptor,
      async transform(
        request: Parameters<AgentMediaTransformer['transform']>[0]
      ) {
        const parametersDigest = digestAgentCanonicalValue({
          stripMetadata: true,
        });
        if (
          request.operation !== 'redact' ||
          digestAgentCanonicalValue(request.parameters) !== parametersDigest
        ) {
          throw new TypeError('G2 raster sanitizer parameters are invalid.');
        }
        const sanitized =
          request.inputMediaType === 'image/png'
            ? sanitizeBinaryAssetPng(request.contents)
            : sanitizeBinaryAssetJpeg(request.contents);
        return Object.freeze({
          contents: new Uint8Array(sanitized.contents),
          mediaType: request.inputMediaType,
          loss: 'none' as const,
          elapsedMs: 0,
          peakMemoryBytes: request.contents.byteLength,
        });
      },
    });
  };

export const createScriptedAgentMediaSafetyScanner = (
  input: Readonly<{
    descriptor: AgentMediaSafetyScanner['descriptor'];
    scan(
      request: Parameters<AgentMediaSafetyScanner['scan']>[0]
    ):
      | Awaited<ReturnType<AgentMediaSafetyScanner['scan']>>
      | Promise<Awaited<ReturnType<AgentMediaSafetyScanner['scan']>>>;
  }>
): AgentMediaSafetyScanner => {
  const descriptor = createAgentMediaSafetyScannerDescriptor(input.descriptor);
  return Object.freeze({
    descriptor,
    async scan(request: Parameters<AgentMediaSafetyScanner['scan']>[0]) {
      return input.scan(request);
    },
  });
};

/** Adapts the G2 byte-level scanner without giving AI ownership of its verdict. */
export const createBinaryAssetAgentMediaSafetyScanner = (
  scanner: BinaryAssetContentScanner
): AgentMediaSafetyScanner => {
  const descriptor = createAgentMediaSafetyScannerDescriptor({
    scannerId: `g2.${scanner.descriptor.id}`,
    scannerVersion: scanner.descriptor.version,
    implementationDigest: digestAgentCanonicalValue(scanner.descriptor),
    supportedMediaTypes: scanner.descriptor.supportedMediaTypes,
  });
  return Object.freeze({
    descriptor,
    async scan(request: Parameters<AgentMediaSafetyScanner['scan']>[0]) {
      const reference = createBinaryAssetBlobReference({
        contents: request.contents,
        mediaType: request.mediaType,
      });
      if (reference.digest !== request.subjectDigest) {
        return Object.freeze({
          verdict: 'corrupt' as const,
          findingCodes: Object.freeze(['g2-subject-digest-drift']),
        });
      }
      const materialization = createBinaryAssetMaterialization({
        assetDocumentId: `agent-media:${request.source.mediaSourceId}`,
        reference,
        contents: request.contents,
      });
      const result = await scanner.scan({
        reference: materialization.reference,
        contents: materialization.contents,
      });
      return Object.freeze({
        verdict:
          result.verdict === 'clean'
            ? ('clean' as const)
            : ('quarantined' as const),
        findingCodes: Object.freeze([...result.findingCodes]),
      });
    },
  });
};
