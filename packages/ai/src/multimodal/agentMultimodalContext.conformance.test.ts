import { describe, expect, it } from 'vitest';
import type { AgentProviderDataPolicy } from '../index';
import {
  buildAgentMultimodalContext,
  createAgentProviderDataPolicy,
  createAgentBudgetLedger,
  createAgentVisualObservation,
  createBinaryAssetSanitizeMediaTransformer,
  createRequiredAgentMultimodalCapabilityProfiles,
  createScriptedAgentVisualTargetResolver,
  digestAgentCanonicalValue,
  resolveAgentVisualObservation,
  reserveAgentBudget,
} from '../index';
import {
  V2_DATA_POLICY,
  V2_PDF,
  V2_PNG,
  V2_TEST_REVISION,
  createV2CleanPngScanner,
  createV2DocumentScanner,
  createV2PdfSource,
  createV2PdfTransformer,
  createV2RequiredProfiles,
  createV2ScreenshotSource,
} from '../__tests__/agentV2Fixtures';

const createMedia = () => {
  const profiles = createV2RequiredProfiles();
  return Object.freeze([
    Object.freeze({
      profile: profiles.screenshot,
      source: createV2ScreenshotSource(),
      contents: new Uint8Array(V2_PNG),
      steps: Object.freeze([
        Object.freeze({
          operation: 'redact' as const,
          parameters: Object.freeze({ stripMetadata: true }),
          transformer: createBinaryAssetSanitizeMediaTransformer(),
        }),
      ]),
      scanner: createV2CleanPngScanner(),
    }),
    Object.freeze({
      profile: profiles.pdf,
      source: createV2PdfSource(),
      contents: new Uint8Array(V2_PDF),
      steps: Object.freeze([
        Object.freeze({
          operation: 'page-select' as const,
          parameters: Object.freeze({ pages: Object.freeze([1, 2]) }),
          transformer: createV2PdfTransformer(),
        }),
      ]),
      scanner: createV2DocumentScanner(),
    }),
  ]);
};

const build = (
  protocolFamily:
    'openai-responses' | 'anthropic-messages' | 'gemini-interactions',
  input: Readonly<{
    media?: ReturnType<typeof createMedia>;
    providerDataPolicy?: AgentProviderDataPolicy;
  }> = {}
) =>
  buildAgentMultimodalContext({
    taskId: 'task.g4-v2.catalog',
    runId: 'run.g4-v2.catalog',
    generation: 1,
    taskMode: 'plan',
    workspaceRevision: V2_TEST_REVISION,
    baseContextPackDigest: digestAgentCanonicalValue('base-context-pack'),
    protocolFamily,
    providerDataPolicy: input.providerDataPolicy ?? V2_DATA_POLICY,
    media: input.media ?? createMedia(),
  });

describe('G4 V2 native multimodal Provider conformance', () => {
  it.each([
    ['openai-responses', ['input_image', 'input_file']],
    ['anthropic-messages', ['image', 'document']],
    ['gemini-interactions', ['inline_data', 'inline_data']],
  ] as const)(
    'normalizes screenshot and document blocks for %s without URLs or bytes',
    async (protocolFamily, expectedTypes) => {
      const result = await build(protocolFamily);
      expect(result.status).toBe('ready');
      if (result.status !== 'ready') return;
      expect(
        result.manifest.providerBlockManifest.blocks.map(
          ({ providerBlockType }) => providerBlockType
        )
      ).toEqual(expect.arrayContaining([...expectedTypes]));
      expect(
        result.manifest.providerBlockManifest.blocks.every(
          ({ payloadAuthority, instructionBoundary }) =>
            payloadAuthority === 'callback-bound-bytes' &&
            instructionBoundary === 'data-only'
        )
      ).toBe(true);
      expect(JSON.stringify(result.manifest)).not.toMatch(
        /https?:|signed|authorization|contents/iu
      );
      expect(result.ephemeralPayloads).toHaveLength(2);
      expect(result.manifest.usage.amounts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ unit: 'document-page' }),
          expect.objectContaining({ unit: 'ocr-character' }),
          expect.objectContaining({ unit: 'provider-upload-byte' }),
        ])
      );
    }
  );

  it('keeps manifest identity byte-stable independent of media order', async () => {
    const media = createMedia();
    const first = await build('openai-responses', { media });
    const reversed = await build('openai-responses', {
      media: Object.freeze([...media].reverse()) as ReturnType<
        typeof createMedia
      >,
    });
    expect(first.status).toBe('ready');
    expect(reversed.status).toBe('ready');
    if (first.status !== 'ready' || reversed.status !== 'ready') return;
    expect(reversed.manifest).toEqual(first.manifest);
  });

  it('freezes required visual/document capability profiles', () => {
    const profiles = createRequiredAgentMultimodalCapabilityProfiles();
    expect(profiles.visual).toMatchObject({
      profileId: 'g4-visual-input',
      featureFlags: expect.arrayContaining(['visual-input']),
    });
    expect(profiles.document).toMatchObject({
      profileId: 'g4-document-input',
      featureFlags: expect.arrayContaining(['document-input']),
    });
    expect(profiles.visual.inputModalityRefs).toEqual(
      expect.arrayContaining(['g4-raster-image-input', 'g4-screenshot-input'])
    );
    expect(profiles.document.inputModalityRefs).toEqual(
      expect.arrayContaining([
        'g4-document-input-representation',
        'g4-pdf-input',
      ])
    );
  });

  it('fails closed when Provider retention/deletion identity is unknown', async () => {
    const unknown = createAgentProviderDataPolicy({
      region: 'us-east-1',
      maximumSensitivity: 'internal',
      training: 'disabled',
      telemetry: 'disabled',
      retentionDays: 0,
      deletionReceipt: 'unknown',
      ambientMemory: 'disabled',
      storage: 'unknown',
      cacheIsolation: 'unknown',
    });
    const result = await build('openai-responses', {
      providerDataPolicy: unknown,
    });
    expect(result).toMatchObject({
      status: 'blocked',
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'AI-7010' }),
      ]),
    });
  });

  it('rejects media above the Provider data-policy sensitivity ceiling', async () => {
    const publicOnly = createAgentProviderDataPolicy({
      region: 'us-east-1',
      maximumSensitivity: 'public',
      training: 'disabled',
      telemetry: 'disabled',
      retentionDays: 0,
      deletionReceipt: 'available',
      ambientMemory: 'disabled',
      storage: 'disabled',
      cacheIsolation: 'invocation',
    });
    const result = await build('openai-responses', {
      providerDataPolicy: publicOnly,
    });
    expect(result).toMatchObject({
      status: 'blocked',
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'AI-7010' }),
      ]),
    });
  });

  it('reserves pixel/page/transform/upload usage with the shared atomic budget ledger', async () => {
    const result = await build('openai-responses');
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    const usageLimits = result.manifest.usage.amounts.map((amount) => ({
      unit: amount.unit,
      maximum: amount.logicalAmount ?? amount.billableAmount ?? '0',
    }));
    const budget = {
      usageLimits,
      costLimits: [],
      maxModelInvocations: 1,
      maxToolCalls: 0,
      maxRepairRounds: 0,
      maxTransactions: 0,
      maxArtifactBytes: 0,
      maxElapsedMs: 1_000,
    } as const;
    const ledger = createAgentBudgetLedger(budget);
    const reserved = reserveAgentBudget(ledger, {
      reservationId: 'reservation.g4-v2.media',
      expectedRevision: 0,
      demand: {
        usage: result.manifest.usage,
        cost: [],
        modelInvocations: 1,
        toolCalls: 0,
        repairRounds: 0,
        transactions: 0,
        artifactBytes: 0,
        elapsedMs: 100,
      },
      reservedAt: '2026-08-01T02:00:00.000Z',
    });
    expect(reserved.ok).toBe(true);

    const exhaustedBudget = {
      ...budget,
      usageLimits: usageLimits.map((limit) =>
        limit.unit === 'document-page' ? { ...limit, maximum: '0' } : limit
      ),
    };
    const exhausted = reserveAgentBudget(
      createAgentBudgetLedger(exhaustedBudget),
      {
        reservationId: 'reservation.g4-v2.media.exhausted',
        expectedRevision: 0,
        demand: {
          usage: result.manifest.usage,
          cost: [],
          modelInvocations: 1,
          toolCalls: 0,
          repairRounds: 0,
          transactions: 0,
          artifactBytes: 0,
          elapsedMs: 100,
        },
        reservedAt: '2026-08-01T02:00:00.000Z',
      }
    );
    expect(exhausted).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: 'AI-6002' })],
    });
  });

  it('resolves observations through typed SourceTrace and never treats coordinates as targets', () => {
    const observation = createAgentVisualObservation({
      observationId: 'observation.catalog.hero',
      representationDigest: digestAgentCanonicalValue('catalog-screenshot'),
      workspaceRevision: V2_TEST_REVISION,
      sourceTraceRef: 'trace.catalog.screenshot',
      label: 'Catalog hero card',
      coordinates: Object.freeze({ x: 20, y: 30, width: 300, height: 180 }),
    });
    const resolved = resolveAgentVisualObservation({
      observation,
      workspaceRevision: V2_TEST_REVISION,
      resolver: createScriptedAgentVisualTargetResolver(() => ({
        target: { kind: 'semantic-target', id: 'pir.catalog.hero' },
        sourceTraceRef: 'trace.catalog.screenshot',
      })),
    });
    expect(resolved).toMatchObject({
      status: 'resolved',
      target: { kind: 'semantic-target', id: 'pir.catalog.hero' },
    });
    expect('coordinates' in resolved).toBe(false);

    const coordinateOnly = createAgentVisualObservation({
      observationId: 'observation.coordinate-only',
      representationDigest: digestAgentCanonicalValue('catalog-screenshot'),
      workspaceRevision: V2_TEST_REVISION,
      coordinates: Object.freeze({ x: 20, y: 30, width: 300, height: 180 }),
    });
    const unresolved = resolveAgentVisualObservation({
      observation: coordinateOnly,
      workspaceRevision: V2_TEST_REVISION,
      resolver: createScriptedAgentVisualTargetResolver(() => undefined),
    });
    expect(unresolved).toMatchObject({
      status: 'unresolved',
      reason: 'missing-source-trace',
    });
    expect('target' in unresolved).toBe(false);
  });
});
