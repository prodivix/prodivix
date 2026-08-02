const boundedStringSchema = {
  type: 'string',
  minLength: 1,
  maxLength: 4_096,
} as const;

const canonicalDigestSchema = {
  type: 'string',
  pattern: '^sha256-[0-9a-f]{64}$',
} as const;

const instantSchema = {
  type: 'string',
  minLength: 20,
  maxLength: 64,
} as const;

const nonNegativeIntegerSchema = {
  type: 'integer',
  minimum: 0,
  maximum: Number.MAX_SAFE_INTEGER,
} as const;

const decimalStringSchema = {
  type: 'string',
  pattern: '^(?:0|[1-9][0-9]*)(?:\\.[0-9]*[1-9])?$',
} as const;

const usageUnitSchema = {
  enum: [
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
  ],
} as const;

const usageLimitSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['unit', 'maximum'],
  properties: {
    unit: usageUnitSchema,
    maximum: decimalStringSchema,
  },
} as const;

const adapterIdentitySchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'adapterId',
    'adapterVersion',
    'adapterDigest',
    'protocolFamily',
    'transportSchemaDigest',
    'eventNormalizationDigest',
  ],
  properties: {
    adapterId: boundedStringSchema,
    adapterVersion: boundedStringSchema,
    adapterDigest: canonicalDigestSchema,
    protocolFamily: {
      enum: [
        'openai-responses',
        'anthropic-messages',
        'gemini-interactions',
        'openai-compatible',
      ],
    },
    transportSchemaDigest: canonicalDigestSchema,
    eventNormalizationDigest: canonicalDigestSchema,
  },
} as const;

const providerConfigurationSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'providerConfigurationId',
    'providerOperatorId',
    'endpointClass',
    'endpointProfileDigest',
    'adapter',
    'dataPolicyDigest',
  ],
  properties: {
    providerConfigurationId: boundedStringSchema,
    providerOperatorId: boundedStringSchema,
    endpointClass: {
      enum: ['first-party-hosted', 'aggregator', 'self-hosted', 'local'],
    },
    endpointProfileDigest: canonicalDigestSchema,
    providerRegion: boundedStringSchema,
    apiRevision: boundedStringSchema,
    adapter: adapterIdentitySchema,
    dataPolicyDigest: canonicalDigestSchema,
  },
} as const;

const modelReferenceSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['modelId', 'lineageDigest'],
  properties: {
    modelId: boundedStringSchema,
    lineageDigest: canonicalDigestSchema,
  },
} as const;

const fineTuneReferenceSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'fineTuneId',
    'jobId',
    'deploymentId',
    'baseModelLineageDigest',
    'trainingPolicyDigest',
    'disclosedDataLineageDigest',
  ],
  properties: {
    fineTuneId: boundedStringSchema,
    jobId: boundedStringSchema,
    deploymentId: boundedStringSchema,
    baseModelLineageDigest: canonicalDigestSchema,
    trainingPolicyDigest: canonicalDigestSchema,
    disclosedDataLineageDigest: canonicalDigestSchema,
  },
} as const;

const modelLineageSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['modelId', 'modelFamilyId', 'modelFamilyOwnerId', 'lineageDigest'],
  properties: {
    modelId: boundedStringSchema,
    modelFamilyId: boundedStringSchema,
    modelFamilyOwnerId: boundedStringSchema,
    immutableVersion: boundedStringSchema,
    baseModelRef: modelReferenceSchema,
    fineTuneRef: fineTuneReferenceSchema,
    tokenizerDigest: canonicalDigestSchema,
    chatTemplateDigest: canonicalDigestSchema,
    quantizationDigest: canonicalDigestSchema,
    runtimeBackendDigest: canonicalDigestSchema,
    lineageDigest: canonicalDigestSchema,
  },
} as const;

const providerDataPolicySchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'policyDigest',
    'maximumSensitivity',
    'training',
    'telemetry',
    'retentionDays',
    'deletionReceipt',
    'ambientMemory',
    'storage',
    'cacheIsolation',
  ],
  properties: {
    policyDigest: canonicalDigestSchema,
    region: boundedStringSchema,
    maximumSensitivity: {
      enum: ['public', 'internal', 'confidential', 'restricted'],
    },
    training: {
      enum: ['disabled', 'policy-qualified', 'enabled', 'unknown'],
    },
    telemetry: {
      enum: ['disabled', 'policy-qualified', 'enabled', 'unknown'],
    },
    retentionDays: { ...nonNegativeIntegerSchema, maximum: 3_650 },
    deletionReceipt: { enum: ['available', 'unavailable', 'unknown'] },
    ambientMemory: { enum: ['disabled', 'enabled', 'unknown'] },
    storage: {
      enum: ['disabled', 'task-scoped', 'workspace-scoped', 'unknown'],
    },
    cacheIsolation: {
      enum: ['invocation', 'task', 'workspace', 'cross-tenant', 'unknown'],
    },
  },
} as const;

const capabilityProfileSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'profileId',
    'inputModalityRefs',
    'outputModalityRefs',
    'outputContracts',
    'toolExecutionLoci',
    'deliveryModes',
    'providerStateModes',
    'cacheModes',
    'contextMutationModes',
    'reasoningModes',
    'featureFlags',
    'hardLimits',
    'profileDigest',
  ],
  properties: {
    profileId: boundedStringSchema,
    inputModalityRefs: {
      type: 'array',
      maxItems: 64,
      uniqueItems: true,
      items: boundedStringSchema,
    },
    outputModalityRefs: {
      type: 'array',
      maxItems: 64,
      uniqueItems: true,
      items: boundedStringSchema,
    },
    outputContracts: {
      type: 'array',
      maxItems: 3,
      uniqueItems: true,
      items: { enum: ['structured', 'text', 'tool-call'] },
    },
    toolExecutionLoci: {
      type: 'array',
      maxItems: 4,
      uniqueItems: true,
      items: {
        enum: [
          'client-hosted',
          'prodivix-runtime',
          'provider-hosted',
          'pinned-mcp',
        ],
      },
    },
    deliveryModes: {
      type: 'array',
      maxItems: 4,
      uniqueItems: true,
      items: {
        enum: ['background', 'realtime-session', 'response', 'stream'],
      },
    },
    providerStateModes: {
      type: 'array',
      maxItems: 4,
      uniqueItems: true,
      items: {
        enum: [
          'stateless',
          'provider-stored-parent',
          'provider-background-job',
          'realtime-session',
        ],
      },
    },
    cacheModes: {
      type: 'array',
      maxItems: 4,
      uniqueItems: true,
      items: { enum: ['disabled', 'prompt', 'file', 'conversation'] },
    },
    contextMutationModes: {
      type: 'array',
      maxItems: 5,
      uniqueItems: true,
      items: {
        enum: [
          'none',
          'provider-compaction',
          'provider-context-editing',
          'tool-result-trimming',
          'deferred-tool-expansion',
        ],
      },
    },
    reasoningModes: {
      type: 'array',
      maxItems: 3,
      uniqueItems: true,
      items: { enum: ['none', 'summary', 'opaque-continuation'] },
    },
    featureFlags: {
      type: 'array',
      maxItems: 15,
      uniqueItems: true,
      items: {
        enum: [
          'bounded-text-input',
          'bounded-code-input',
          'visual-input',
          'document-input',
          'generated-asset-output',
          'audio-input-output',
          'video-input',
          'realtime-media',
          'structured-output',
          'client-hosted-tool-calling',
          'streaming',
          'refusal-normalization',
          'truncation-normalization',
          'parallel-tool-calling',
          'usage-reporting',
        ],
      },
    },
    hardLimits: {
      type: 'object',
      additionalProperties: false,
      required: [
        'maxInputBytes',
        'maxOutputUnits',
        'maxToolCalls',
        'maxParallelToolCalls',
        'maxBackgroundRuntimeMs',
      ],
      properties: {
        maxInputBytes: nonNegativeIntegerSchema,
        maxOutputUnits: {
          type: 'array',
          maxItems: 32,
          uniqueItems: true,
          items: usageLimitSchema,
        },
        maxToolCalls: nonNegativeIntegerSchema,
        maxParallelToolCalls: nonNegativeIntegerSchema,
        maxBackgroundRuntimeMs: nonNegativeIntegerSchema,
      },
    },
    profileDigest: canonicalDigestSchema,
  },
} as const;

const usageAmountSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['unit', 'confidence'],
  properties: {
    unit: usageUnitSchema,
    logicalAmount: decimalStringSchema,
    billableAmount: decimalStringSchema,
    cachedAmount: decimalStringSchema,
    confidence: { enum: ['reported', 'measured', 'estimated', 'unknown'] },
    sourceDigest: canonicalDigestSchema,
  },
} as const;

const usageVectorSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['amounts', 'vectorDigest'],
  properties: {
    amounts: {
      type: 'array',
      minItems: 1,
      maxItems: 32,
      items: usageAmountSchema,
    },
    vectorDigest: canonicalDigestSchema,
  },
} as const;

const contextTransformReceiptSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'invocationId',
    'submittedContextPackDigest',
    'transformMode',
    'confidence',
    'receiptDigest',
  ],
  properties: {
    invocationId: boundedStringSchema,
    submittedContextPackDigest: canonicalDigestSchema,
    transformMode: {
      enum: [
        'none',
        'provider-compaction',
        'provider-context-editing',
        'tool-result-trimming',
        'deferred-tool-expansion',
      ],
    },
    transformConfigurationDigest: canonicalDigestSchema,
    retainedItemDigests: {
      type: 'array',
      maxItems: 10_000,
      uniqueItems: true,
      items: canonicalDigestSchema,
    },
    omittedOrCompacted: {
      type: 'array',
      maxItems: 10_000,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['itemDigest', 'reason'],
        properties: {
          itemDigest: canonicalDigestSchema,
          reason: {
            enum: [
              'compacted',
              'provider-limit',
              'tool-result-trimmed',
              'unknown',
            ],
          },
        },
      },
    },
    effectiveContextDigest: canonicalDigestSchema,
    confidence: { enum: ['verified', 'provider-reported', 'unknown'] },
    receiptDigest: canonicalDigestSchema,
  },
} as const;

const opaqueContinuationSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'continuationId',
    'encryptedBlobRef',
    'providerConfigurationId',
    'modelLineageDigest',
    'taskId',
    'runId',
    'generation',
    'parentInvocationId',
    'purpose',
    'createdAt',
    'expiresAt',
    'continuationDigest',
  ],
  properties: {
    continuationId: boundedStringSchema,
    encryptedBlobRef: boundedStringSchema,
    providerConfigurationId: boundedStringSchema,
    modelLineageDigest: canonicalDigestSchema,
    taskId: boundedStringSchema,
    runId: boundedStringSchema,
    generation: nonNegativeIntegerSchema,
    parentInvocationId: boundedStringSchema,
    purpose: { const: 'provider-tool-loop-continuation' },
    createdAt: instantSchema,
    expiresAt: instantSchema,
    continuationDigest: canonicalDigestSchema,
  },
} as const;

const providerStateReceiptSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'stateMode',
    'storage',
    'ambientMemory',
    'retentionDays',
    'receiptDigest',
  ],
  properties: {
    stateMode: {
      enum: [
        'stateless',
        'provider-stored-parent',
        'provider-background-job',
        'realtime-session',
      ],
    },
    storage: {
      enum: ['disabled', 'task-scoped', 'workspace-scoped', 'unknown'],
    },
    ambientMemory: { enum: ['disabled', 'enabled', 'unknown'] },
    providerRegion: boundedStringSchema,
    retentionDays: { ...nonNegativeIntegerSchema, maximum: 3_650 },
    deletionReceiptRef: boundedStringSchema,
    receiptDigest: canonicalDigestSchema,
  },
} as const;

const providerCacheReceiptSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'cacheMode',
    'cacheScope',
    'provenIsolation',
    'prefixOrItemDigests',
    'usageRef',
    'receiptDigest',
  ],
  properties: {
    cacheMode: { enum: ['prompt', 'file', 'conversation'] },
    cacheScope: { enum: ['invocation', 'task', 'workspace'] },
    provenIsolation: { enum: ['invocation', 'task', 'workspace'] },
    cacheKeyDigest: canonicalDigestSchema,
    prefixOrItemDigests: {
      type: 'array',
      maxItems: 10_000,
      uniqueItems: true,
      items: canonicalDigestSchema,
    },
    providerRegion: boundedStringSchema,
    createdAt: instantSchema,
    expiresAt: instantSchema,
    usageRef: boundedStringSchema,
    receiptDigest: canonicalDigestSchema,
  },
} as const;

const providerEventSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'eventId',
    'invocationId',
    'sequence',
    'type',
    'payloadDigest',
    'occurredAt',
    'eventDigest',
  ],
  properties: {
    eventId: boundedStringSchema,
    invocationId: boundedStringSchema,
    sequence: nonNegativeIntegerSchema,
    type: {
      enum: [
        'output-delta',
        'tool-call',
        'usage',
        'refusal',
        'safety-block',
        'truncation',
        'cancelled',
        'timed-out',
        'partial',
        'completed',
        'failed',
      ],
    },
    payloadDigest: canonicalDigestSchema,
    occurredAt: instantSchema,
    eventDigest: canonicalDigestSchema,
  },
} as const;

const providerJobReceiptSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'providerJobId',
    'taskId',
    'runId',
    'generation',
    'invocationId',
    'phase',
    'callbackAuthority',
    'receiptDigest',
  ],
  properties: {
    providerJobId: boundedStringSchema,
    taskId: boundedStringSchema,
    runId: boundedStringSchema,
    generation: nonNegativeIntegerSchema,
    invocationId: boundedStringSchema,
    phase: {
      enum: ['submitting', 'accepted', 'running', 'cancelling', 'terminal'],
    },
    outcome: {
      enum: [
        'completed',
        'failed',
        'cancelled',
        'expired',
        'reconciliation-required',
      ],
    },
    callbackAuthority: { enum: ['active', 'revoked'] },
    receiptDigest: canonicalDigestSchema,
  },
} as const;

const providerJobEventSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'eventId',
    'providerJobId',
    'taskId',
    'runId',
    'generation',
    'invocationId',
    'type',
    'source',
    'payloadDigest',
    'occurredAt',
    'eventDigest',
  ],
  properties: {
    eventId: boundedStringSchema,
    providerJobId: boundedStringSchema,
    taskId: boundedStringSchema,
    runId: boundedStringSchema,
    generation: nonNegativeIntegerSchema,
    invocationId: boundedStringSchema,
    type: {
      enum: [
        'accepted',
        'running',
        'cancel-requested',
        'completed',
        'failed',
        'cancelled',
        'expired',
        'reconciliation-required',
      ],
    },
    source: { enum: ['submit', 'poll', 'stream', 'webhook', 'coordinator'] },
    signatureVerified: { type: 'boolean' },
    replayWindowValid: { type: 'boolean' },
    payloadDigest: canonicalDigestSchema,
    occurredAt: instantSchema,
    eventDigest: canonicalDigestSchema,
  },
} as const;

const factEnvelope = (
  factType: string,
  valueSchema: Readonly<Record<string, unknown>>
) =>
  ({
    type: 'object',
    additionalProperties: false,
    required: ['wireVersion', 'factType', 'value'],
    properties: {
      wireVersion: { const: 1 },
      factType: { const: factType },
      value: valueSchema,
    },
  }) as const;

const providerCatalogEntrySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['provider', 'model', 'dataPolicy', 'capabilityProfile'],
  properties: {
    provider: providerConfigurationSchema,
    model: modelLineageSchema,
    dataPolicy: providerDataPolicySchema,
    capabilityProfile: capabilityProfileSchema,
  },
} as const;

/** Strict adapter/service wire facts. These are not Canonical Workspace documents. */
export const agentProviderFactWireSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://prodivix.dev/schemas/agent-provider-fact.v1.json',
  title: 'Prodivix Agent Provider normalized fact wire',
  oneOf: [
    factEnvelope('provider-catalog-entry', providerCatalogEntrySchema),
    factEnvelope('opaque-continuation', opaqueContinuationSchema),
    factEnvelope('context-transform-receipt', contextTransformReceiptSchema),
    factEnvelope('provider-state-receipt', providerStateReceiptSchema),
    factEnvelope('provider-cache-receipt', providerCacheReceiptSchema),
    factEnvelope('usage-vector', usageVectorSchema),
    factEnvelope('provider-event', providerEventSchema),
    factEnvelope('provider-job-event', providerJobEventSchema),
    factEnvelope('provider-job-receipt', providerJobReceiptSchema),
  ],
} as const;

export const agentProviderWireSchemas = Object.freeze({
  'agent-provider-fact@1': agentProviderFactWireSchema,
});
