import { utf8ToBytes } from '@noble/hashes/utils.js';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import type {
  AgentUsageUnit,
  CanonicalDigest,
  DecimalString,
  Instant,
} from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import type {
  AgentCost,
  AgentPricingRate,
  AgentPricingSnapshot,
  AgentUsageAmount,
  AgentUsageVector,
} from '../providers/agentProvider.types';

type ParsedDecimal = Readonly<{ coefficient: bigint; scale: number }>;

const decimalInputPattern = /^(?:0|[1-9]\d*)(?:\.\d+)?$/u;

const usageUnits = new Set<string>([
  'text-token-input',
  'text-token-output',
  'reasoning-token',
  'cache-read-token',
  'cache-write-token',
  'image',
  'image-pixel',
  'media-source-byte',
  'media-processed-byte',
  'document-page',
  'document-rendered-pixel',
  'ocr-character',
  'audio-second',
  'audio-sample',
  'video-second',
  'video-input-frame',
  'video-frame',
  'transform-compute-millisecond',
  'transform-memory-byte-second',
  'provider-upload-byte',
  'hosted-search-query',
  'hosted-tool-call',
  'sandbox-compute-second',
  'provider-storage-byte-second',
  'generated-artifact',
  'generated-artifact-byte',
] satisfies readonly AgentUsageUnit[]);

export const isAgentUsageUnit = (value: unknown): value is AgentUsageUnit =>
  typeof value === 'string' && usageUnits.has(value);

const usageConfidences = new Set<string>([
  'reported',
  'measured',
  'estimated',
  'unknown',
] satisfies readonly AgentUsageAmount['confidence'][]);

const parseDecimal = (value: DecimalString): ParsedDecimal => {
  if (!decimalInputPattern.test(value)) {
    throw new TypeError(`Invalid non-negative decimal: ${value}.`);
  }
  const [whole, fraction = ''] = value.split('.');
  return {
    coefficient: BigInt(`${whole}${fraction}`),
    scale: fraction.length,
  };
};

const formatDecimal = ({
  coefficient,
  scale,
}: ParsedDecimal): DecimalString => {
  if (coefficient < 0n) throw new TypeError('Decimal must not be negative.');
  if (coefficient === 0n) return '0';
  const raw = coefficient.toString().padStart(scale + 1, '0');
  if (scale === 0) return raw;
  const whole = raw.slice(0, -scale);
  const fraction = raw.slice(-scale).replace(/0+$/u, '');
  return fraction ? `${whole}.${fraction}` : whole;
};

const alignDecimals = (
  left: DecimalString,
  right: DecimalString
): readonly [bigint, bigint, number] => {
  const parsedLeft = parseDecimal(left);
  const parsedRight = parseDecimal(right);
  const scale = Math.max(parsedLeft.scale, parsedRight.scale);
  return [
    parsedLeft.coefficient * 10n ** BigInt(scale - parsedLeft.scale),
    parsedRight.coefficient * 10n ** BigInt(scale - parsedRight.scale),
    scale,
  ];
};

export const normalizeAgentDecimal = (value: DecimalString): DecimalString =>
  formatDecimal(parseDecimal(value));

export const compareAgentDecimals = (
  left: DecimalString,
  right: DecimalString
): number => {
  const [leftValue, rightValue] = alignDecimals(left, right);
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
};

export const addAgentDecimals = (
  left: DecimalString,
  right: DecimalString
): DecimalString => {
  const [leftValue, rightValue, scale] = alignDecimals(left, right);
  return formatDecimal({ coefficient: leftValue + rightValue, scale });
};

export const subtractAgentDecimals = (
  left: DecimalString,
  right: DecimalString
): DecimalString => {
  const [leftValue, rightValue, scale] = alignDecimals(left, right);
  if (rightValue > leftValue) {
    throw new RangeError('Agent decimal subtraction would become negative.');
  }
  return formatDecimal({ coefficient: leftValue - rightValue, scale });
};

export const multiplyAgentDecimals = (
  left: DecimalString,
  right: DecimalString
): DecimalString => {
  const parsedLeft = parseDecimal(left);
  const parsedRight = parseDecimal(right);
  return formatDecimal({
    coefficient: parsedLeft.coefficient * parsedRight.coefficient,
    scale: parsedLeft.scale + parsedRight.scale,
  });
};

const confidenceOrder: Readonly<
  Record<AgentUsageAmount['confidence'], number>
> = Object.freeze({ reported: 0, measured: 1, estimated: 2, unknown: 3 });

const worseConfidence = (
  left: AgentUsageAmount['confidence'],
  right: AgentUsageAmount['confidence']
): AgentUsageAmount['confidence'] =>
  confidenceOrder[left] >= confidenceOrder[right] ? left : right;

export const normalizeAgentCosts = (
  input: readonly AgentCost[]
): readonly AgentCost[] => {
  const byCurrency = new Map<string, AgentCost>();
  for (const cost of input) {
    if (!/^[A-Z]{3}$/u.test(cost.currency)) {
      throw new TypeError(`Invalid Agent cost currency ${cost.currency}.`);
    }
    if (cost.sourceDigest && !isAgentCanonicalDigest(cost.sourceDigest)) {
      throw new TypeError('Agent cost source digest is invalid.');
    }
    if (!usageConfidences.has(cost.confidence)) {
      throw new TypeError('Agent cost confidence is invalid.');
    }
    const amount =
      cost.amount === undefined
        ? undefined
        : normalizeAgentDecimal(cost.amount);
    if (amount === undefined && cost.confidence !== 'unknown') {
      throw new TypeError('Known Agent cost requires an amount.');
    }
    const current = byCurrency.get(cost.currency);
    if (!current) {
      byCurrency.set(
        cost.currency,
        Object.freeze({
          currency: cost.currency,
          ...(amount !== undefined ? { amount } : {}),
          confidence: cost.confidence,
          ...(cost.sourceDigest ? { sourceDigest: cost.sourceDigest } : {}),
        })
      );
      continue;
    }
    const sourceDigests = [current.sourceDigest, cost.sourceDigest]
      .filter((value): value is string => Boolean(value))
      .sort(compareUnicodeCodePoints);
    const sourceDigest =
      sourceDigests.length === 0
        ? undefined
        : new Set(sourceDigests).size === 1
          ? sourceDigests[0]
          : digestAgentCanonicalValue(sourceDigests);
    const hasUnknownAmount =
      current.amount === undefined || amount === undefined;
    byCurrency.set(
      cost.currency,
      Object.freeze({
        currency: cost.currency,
        ...(!hasUnknownAmount
          ? { amount: addAgentDecimals(current.amount!, amount!) }
          : {}),
        confidence: hasUnknownAmount
          ? 'unknown'
          : worseConfidence(current.confidence, cost.confidence),
        ...(sourceDigest ? { sourceDigest } : {}),
      })
    );
  }
  return Object.freeze(
    [...byCurrency.values()].sort((left, right) =>
      compareUnicodeCodePoints(left.currency, right.currency)
    )
  );
};

const addOptional = (
  left: DecimalString | undefined,
  right: DecimalString | undefined
): DecimalString | undefined => {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return addAgentDecimals(left, right);
};

const normalizeAmount = (amount: AgentUsageAmount): AgentUsageAmount => {
  if (!isAgentUsageUnit(amount.unit)) {
    throw new TypeError(`Invalid Agent usage unit ${amount.unit}.`);
  }
  if (!usageConfidences.has(amount.confidence)) {
    throw new TypeError('Agent usage confidence is invalid.');
  }
  const normalized = Object.freeze({
    unit: amount.unit,
    ...(amount.logicalAmount !== undefined
      ? { logicalAmount: normalizeAgentDecimal(amount.logicalAmount) }
      : {}),
    ...(amount.billableAmount !== undefined
      ? { billableAmount: normalizeAgentDecimal(amount.billableAmount) }
      : {}),
    ...(amount.cachedAmount !== undefined
      ? { cachedAmount: normalizeAgentDecimal(amount.cachedAmount) }
      : {}),
    confidence: amount.confidence,
    ...(amount.sourceDigest ? { sourceDigest: amount.sourceDigest } : {}),
  });
  if (
    amount.confidence !== 'unknown' &&
    normalized.logicalAmount === undefined &&
    normalized.billableAmount === undefined &&
    normalized.cachedAmount === undefined
  ) {
    throw new TypeError('Known usage requires at least one amount.');
  }
  if (amount.sourceDigest && !isAgentCanonicalDigest(amount.sourceDigest)) {
    throw new TypeError('Usage source digest is invalid.');
  }
  return normalized;
};

export const createAgentUsageVector = (
  input: readonly AgentUsageAmount[]
): AgentUsageVector => {
  const byUnit = new Map<AgentUsageUnit, AgentUsageAmount>();
  for (const raw of input) {
    const amount = normalizeAmount(raw);
    const current = byUnit.get(amount.unit);
    if (!current) {
      byUnit.set(amount.unit, amount);
      continue;
    }
    const sourceDigest =
      current.sourceDigest === amount.sourceDigest
        ? current.sourceDigest
        : digestAgentCanonicalValue(
            [current.sourceDigest, amount.sourceDigest]
              .filter((value): value is string => Boolean(value))
              .sort(compareUnicodeCodePoints)
          );
    byUnit.set(
      amount.unit,
      Object.freeze({
        unit: amount.unit,
        ...(addOptional(current.logicalAmount, amount.logicalAmount) !==
        undefined
          ? {
              logicalAmount: addOptional(
                current.logicalAmount,
                amount.logicalAmount
              )!,
            }
          : {}),
        ...(addOptional(current.billableAmount, amount.billableAmount) !==
        undefined
          ? {
              billableAmount: addOptional(
                current.billableAmount,
                amount.billableAmount
              )!,
            }
          : {}),
        ...(addOptional(current.cachedAmount, amount.cachedAmount) !== undefined
          ? {
              cachedAmount: addOptional(
                current.cachedAmount,
                amount.cachedAmount
              )!,
            }
          : {}),
        confidence: worseConfidence(current.confidence, amount.confidence),
        ...(sourceDigest ? { sourceDigest } : {}),
      })
    );
  }
  const amounts = Object.freeze(
    [...byUnit.values()].sort((left, right) =>
      compareUnicodeCodePoints(left.unit, right.unit)
    )
  );
  return Object.freeze({
    amounts,
    vectorDigest: digestAgentCanonicalValue(amounts),
  });
};

export const createUnknownAgentUsageVector = (
  units: readonly AgentUsageUnit[]
): AgentUsageVector => {
  if (units.length === 0) {
    throw new TypeError('Unknown usage must identify at least one unit.');
  }
  return createAgentUsageVector(
    [...new Set(units)]
      .sort(compareUnicodeCodePoints)
      .map((unit) => ({ unit, confidence: 'unknown' as const }))
  );
};

export const createAgentPricingSnapshot = (
  input: Readonly<{
    pricingSnapshotId: string;
    providerConfigurationId: string;
    serviceTier?: string;
    region?: string;
    effectiveAt: Instant;
    rates: readonly AgentPricingRate[];
    sourceDigest: CanonicalDigest;
  }>
): AgentPricingSnapshot => {
  if (
    !input.pricingSnapshotId.trim() ||
    !input.providerConfigurationId.trim()
  ) {
    throw new TypeError('Pricing snapshot identity is required.');
  }
  if (!Number.isFinite(Date.parse(input.effectiveAt))) {
    throw new TypeError('Pricing snapshot effective instant is invalid.');
  }
  if (!isAgentCanonicalDigest(input.sourceDigest)) {
    throw new TypeError('Pricing source digest is invalid.');
  }
  const identities = input.rates.map(
    ({ currency, unit }) => `${unit}\u0000${currency}`
  );
  if (new Set(identities).size !== identities.length) {
    throw new TypeError('Pricing rates must have unique unit/currency pairs.');
  }
  const rates = Object.freeze(
    input.rates
      .map((rate) => {
        if (!usageUnits.has(rate.unit)) {
          throw new TypeError(`Invalid pricing usage unit ${rate.unit}.`);
        }
        if (!/^[A-Z]{3}$/u.test(rate.currency)) {
          throw new TypeError(`Invalid pricing currency ${rate.currency}.`);
        }
        return Object.freeze({
          ...rate,
          unitPrice: normalizeAgentDecimal(rate.unitPrice),
        });
      })
      .sort(
        (left, right) =>
          compareUnicodeCodePoints(left.unit, right.unit) ||
          compareUnicodeCodePoints(left.currency, right.currency)
      )
  );
  const base = Object.freeze({ ...input, rates });
  return Object.freeze({
    ...base,
    snapshotDigest: digestAgentCanonicalValue(base),
  });
};

export const priceAgentUsage = (
  usage: AgentUsageVector,
  pricing: AgentPricingSnapshot
): readonly AgentCost[] => {
  const { snapshotDigest: _snapshotDigest, ...pricingBase } = pricing;
  let usageIsCanonical = false;
  let pricingIsCanonical = false;
  try {
    usageIsCanonical = sameCanonicalJson(
      createAgentUsageVector(usage.amounts),
      usage
    );
    pricingIsCanonical = sameCanonicalJson(
      createAgentPricingSnapshot(pricingBase),
      pricing
    );
  } catch {
    usageIsCanonical = false;
    pricingIsCanonical = false;
  }
  if (!usageIsCanonical || !pricingIsCanonical) {
    throw new TypeError('Usage or pricing snapshot digest has drifted.');
  }
  const costs: AgentCost[] = [];
  for (const amount of usage.amounts) {
    const rates = pricing.rates.filter(({ unit }) => unit === amount.unit);
    if (rates.length === 0) {
      throw new TypeError(
        `Pricing snapshot has no rate for usage unit ${amount.unit}; cost is unknown, not zero.`
      );
    }
    for (const rate of rates) {
      const quantity = amount.billableAmount ?? amount.logicalAmount;
      const calculated =
        quantity === undefined
          ? undefined
          : multiplyAgentDecimals(quantity, rate.unitPrice);
      const confidence = quantity === undefined ? 'unknown' : amount.confidence;
      costs.push(
        Object.freeze({
          currency: rate.currency,
          ...(calculated !== undefined ? { amount: calculated } : {}),
          confidence,
          sourceDigest: pricing.snapshotDigest,
        })
      );
    }
  }
  return normalizeAgentCosts(costs);
};

const mockTokenCount = (text: string): DecimalString =>
  String(Math.ceil(utf8ToBytes(text).byteLength / 4));

export const measureDeterministicMockAgentUsage = (
  input: Readonly<{
    inputText?: string;
    outputText?: string;
    reasoningText?: string;
    cacheReadText?: string;
    cacheWriteText?: string;
    images?: number;
    imagePixels?: number;
    mediaSourceBytes?: number;
    mediaProcessedBytes?: number;
    documentPages?: number;
    documentRenderedPixels?: number;
    ocrCharacters?: number;
    audioSeconds?: DecimalString;
    audioSamples?: number;
    videoSeconds?: DecimalString;
    videoInputFrames?: number;
    videoFrames?: number;
    transformComputeMilliseconds?: number;
    transformMemoryByteSeconds?: number;
    providerUploadBytes?: number;
    generatedArtifacts?: number;
    generatedArtifactBytes?: number;
  }>
): AgentUsageVector => {
  const amounts: AgentUsageAmount[] = [];
  const addCount = (unit: AgentUsageUnit, value: number | undefined): void => {
    if (value === undefined) return;
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError(`Mock ${unit} usage must be a non-negative integer.`);
    }
    amounts.push({
      unit,
      logicalAmount: String(value),
      billableAmount: String(value),
      confidence: 'measured',
    });
  };
  const addText = (unit: AgentUsageUnit, value: string | undefined): void => {
    if (value === undefined) return;
    const count = mockTokenCount(value);
    amounts.push({
      unit,
      logicalAmount: count,
      billableAmount: count,
      confidence: 'estimated',
      sourceDigest: digestAgentCanonicalValue({
        algorithm: 'utf8-ceil-div-4',
        value,
      }),
    });
  };
  addText('text-token-input', input.inputText);
  addText('text-token-output', input.outputText);
  addText('reasoning-token', input.reasoningText);
  if (input.cacheReadText !== undefined) {
    const count = mockTokenCount(input.cacheReadText);
    amounts.push({
      unit: 'cache-read-token',
      logicalAmount: count,
      billableAmount: count,
      cachedAmount: count,
      confidence: 'estimated',
    });
  }
  addText('cache-write-token', input.cacheWriteText);
  addCount('image', input.images);
  addCount('image-pixel', input.imagePixels);
  addCount('media-source-byte', input.mediaSourceBytes);
  addCount('media-processed-byte', input.mediaProcessedBytes);
  addCount('document-page', input.documentPages);
  addCount('document-rendered-pixel', input.documentRenderedPixels);
  addCount('ocr-character', input.ocrCharacters);
  addCount('audio-sample', input.audioSamples);
  addCount('video-input-frame', input.videoInputFrames);
  addCount('video-frame', input.videoFrames);
  addCount('transform-compute-millisecond', input.transformComputeMilliseconds);
  addCount('transform-memory-byte-second', input.transformMemoryByteSeconds);
  addCount('provider-upload-byte', input.providerUploadBytes);
  addCount('generated-artifact', input.generatedArtifacts);
  addCount('generated-artifact-byte', input.generatedArtifactBytes);
  for (const [unit, value] of [
    ['audio-second', input.audioSeconds],
    ['video-second', input.videoSeconds],
  ] as const) {
    if (value !== undefined) {
      const normalized = normalizeAgentDecimal(value);
      amounts.push({
        unit,
        logicalAmount: normalized,
        billableAmount: normalized,
        confidence: 'measured',
      });
    }
  }
  return createAgentUsageVector(amounts);
};
