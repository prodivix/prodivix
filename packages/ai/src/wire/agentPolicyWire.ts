const canonicalStringSchema = {
  type: 'string',
  minLength: 1,
  maxLength: 512,
  pattern: '^\\S(?:[\\s\\S]*\\S)?$',
} as const;

const canonicalIdSchema = {
  ...canonicalStringSchema,
  maxLength: 256,
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$',
} as const;

const canonicalIdArraySchema = {
  type: 'array',
  maxItems: 256,
  uniqueItems: true,
  items: { $ref: '#/$defs/canonicalId' },
} as const;

const positiveSafeIntegerSchema = {
  type: 'integer',
  minimum: 1,
  maximum: 9_007_199_254_740_991,
} as const;

const nonNegativeSafeIntegerSchema = {
  type: 'integer',
  minimum: 0,
  maximum: 9_007_199_254_740_991,
} as const;

const decimalStringSchema = {
  type: 'string',
  pattern: '^(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$',
  maxLength: 128,
} as const;

const sensitivitySchema = {
  enum: ['public', 'internal', 'confidential', 'restricted'],
} as const;

const capabilitySchema = {
  enum: ['read', 'execute', 'propose', 'approve', 'commit', 'rollback'],
} as const;

const runtimeZoneSchema = {
  enum: ['browser', 'server', 'native', 'sandbox'],
} as const;

const supportTierSchema = {
  enum: ['release-evaluated', 'admission-only', 'disabled'],
} as const;

const ruleEffectSchema = { enum: ['allow', 'deny'] } as const;

const targetRefSchema = {
  type: 'object',
  required: ['kind', 'id'],
  properties: {
    kind: { enum: ['workspace', 'document', 'semantic-target'] },
    id: { $ref: '#/$defs/canonicalId' },
  },
  additionalProperties: false,
} as const;

const targetScopeSchema = {
  type: 'object',
  required: ['targets'],
  properties: {
    targets: {
      type: 'array',
      minItems: 1,
      maxItems: 512,
      items: { $ref: '#/$defs/targetRef' },
    },
  },
  additionalProperties: false,
} as const;

const providerRuleSchema = {
  type: 'object',
  required: [
    'id',
    'effect',
    'providerConfigurationIds',
    'protocolFamilies',
    'endpointClasses',
    'regions',
    'minimumSupportTier',
    'maximumSensitivity',
  ],
  properties: {
    id: { $ref: '#/$defs/canonicalId' },
    effect: ruleEffectSchema,
    providerConfigurationIds: canonicalIdArraySchema,
    protocolFamilies: {
      type: 'array',
      maxItems: 4,
      uniqueItems: true,
      items: {
        enum: [
          'openai-responses',
          'anthropic-messages',
          'gemini-interactions',
          'openai-compatible',
        ],
      },
    },
    endpointClasses: {
      type: 'array',
      maxItems: 4,
      uniqueItems: true,
      items: {
        enum: ['first-party-hosted', 'aggregator', 'self-hosted', 'local'],
      },
    },
    regions: canonicalIdArraySchema,
    minimumSupportTier: supportTierSchema,
    maximumSensitivity: sensitivitySchema,
  },
  additionalProperties: false,
} as const;

const modelRuleSchema = {
  type: 'object',
  required: [
    'id',
    'effect',
    'modelIds',
    'modelFamilyIds',
    'capabilityProfileIds',
    'minimumSupportTier',
  ],
  properties: {
    id: { $ref: '#/$defs/canonicalId' },
    effect: ruleEffectSchema,
    modelIds: canonicalIdArraySchema,
    modelFamilyIds: canonicalIdArraySchema,
    capabilityProfileIds: canonicalIdArraySchema,
    minimumSupportTier: supportTierSchema,
  },
  additionalProperties: false,
} as const;

const contextPolicySchema = {
  type: 'object',
  required: [
    'allowedAuthorities',
    'allowedItemKinds',
    'maximumSensitivity',
    'maxItems',
    'maxBytes',
    'requireSourceTrace',
    'externalInstructionBoundary',
  ],
  properties: {
    allowedAuthorities: {
      type: 'array',
      minItems: 1,
      maxItems: 4,
      uniqueItems: true,
      items: {
        enum: ['canonical', 'derived', 'user-provided', 'external-untrusted'],
      },
    },
    allowedItemKinds: canonicalIdArraySchema,
    maximumSensitivity: sensitivitySchema,
    maxItems: { ...positiveSafeIntegerSchema, maximum: 10_000 },
    maxBytes: { ...positiveSafeIntegerSchema, maximum: 1_048_576 },
    requireSourceTrace: { type: 'boolean' },
    externalInstructionBoundary: { const: 'data-only' },
  },
  additionalProperties: false,
} as const;

const capabilityRuleSchema = {
  type: 'object',
  required: [
    'id',
    'effect',
    'capabilities',
    'targetScope',
    'toolIds',
    'runtimeZones',
    'maximumRisk',
  ],
  properties: {
    id: { $ref: '#/$defs/canonicalId' },
    effect: ruleEffectSchema,
    capabilities: {
      type: 'array',
      minItems: 1,
      maxItems: 6,
      uniqueItems: true,
      items: capabilitySchema,
    },
    targetScope: targetScopeSchema,
    toolIds: canonicalIdArraySchema,
    runtimeZones: {
      type: 'array',
      minItems: 1,
      maxItems: 4,
      uniqueItems: true,
      items: runtimeZoneSchema,
    },
    maximumRisk: { enum: ['low', 'medium', 'high', 'critical'] },
  },
  additionalProperties: false,
} as const;

const approvalRuleSchema = {
  type: 'object',
  required: [
    'id',
    'riskLevels',
    'capabilities',
    'decisionAuthority',
    'rollbackAuthorization',
  ],
  properties: {
    id: { $ref: '#/$defs/canonicalId' },
    riskLevels: {
      type: 'array',
      minItems: 1,
      maxItems: 4,
      uniqueItems: true,
      items: { enum: ['low', 'medium', 'high', 'critical'] },
    },
    capabilities: {
      type: 'array',
      minItems: 1,
      maxItems: 6,
      uniqueItems: true,
      items: capabilitySchema,
    },
    decisionAuthority: { const: 'explicit-human' },
    rollbackAuthorization: {
      enum: ['none', 'on-unsatisfied-closure'],
    },
  },
  additionalProperties: false,
} as const;

const networkRuleSchema = {
  type: 'object',
  required: [
    'id',
    'effect',
    'hosts',
    'methods',
    'maxRequestBytes',
    'maxResponseBytes',
    'redirectPolicy',
    'tls',
  ],
  properties: {
    id: { $ref: '#/$defs/canonicalId' },
    effect: ruleEffectSchema,
    hosts: {
      type: 'array',
      maxItems: 256,
      uniqueItems: true,
      items: {
        type: 'string',
        minLength: 1,
        maxLength: 253,
        pattern: '^[A-Za-z0-9.-]+$',
      },
    },
    methods: {
      type: 'array',
      maxItems: 3,
      uniqueItems: true,
      items: { enum: ['GET', 'HEAD', 'POST'] },
    },
    maxRequestBytes: nonNegativeSafeIntegerSchema,
    maxResponseBytes: nonNegativeSafeIntegerSchema,
    redirectPolicy: { enum: ['deny', 'same-origin'] },
    tls: { const: 'required' },
  },
  additionalProperties: false,
} as const;

const secretRuleSchema = {
  type: 'object',
  required: ['id', 'effect', 'referenceKinds', 'purposes', 'runtimeZones'],
  properties: {
    id: { $ref: '#/$defs/canonicalId' },
    effect: ruleEffectSchema,
    referenceKinds: canonicalIdArraySchema,
    purposes: canonicalIdArraySchema,
    runtimeZones: {
      type: 'array',
      maxItems: 3,
      uniqueItems: true,
      items: { enum: ['server', 'native', 'sandbox'] },
    },
  },
  additionalProperties: false,
} as const;

const budgetSchema = {
  type: 'object',
  required: [
    'usageLimits',
    'costLimits',
    'maxModelInvocations',
    'maxToolCalls',
    'maxRepairRounds',
    'maxTransactions',
    'maxArtifactBytes',
    'maxElapsedMs',
  ],
  properties: {
    usageLimits: {
      type: 'array',
      maxItems: 16,
      items: {
        type: 'object',
        required: ['unit', 'maximum'],
        properties: {
          unit: {
            enum: [
              'text-token-input',
              'text-token-output',
              'reasoning-token',
              'cache-read-token',
              'cache-write-token',
              'image',
              'image-pixel',
              'document-page',
              'audio-second',
              'video-second',
              'video-frame',
              'hosted-search-query',
              'hosted-tool-call',
              'sandbox-compute-second',
              'provider-storage-byte-second',
            ],
          },
          maximum: decimalStringSchema,
        },
        additionalProperties: false,
      },
    },
    costLimits: {
      type: 'array',
      maxItems: 32,
      items: {
        type: 'object',
        required: ['currency', 'maximum'],
        properties: {
          currency: {
            type: 'string',
            pattern: '^[A-Z]{3}$',
          },
          maximum: decimalStringSchema,
        },
        additionalProperties: false,
      },
    },
    maxModelInvocations: { ...positiveSafeIntegerSchema, maximum: 10_000 },
    maxToolCalls: { ...nonNegativeSafeIntegerSchema, maximum: 100_000 },
    maxRepairRounds: { ...nonNegativeSafeIntegerSchema, maximum: 100 },
    maxTransactions: { ...nonNegativeSafeIntegerSchema, maximum: 1_000 },
    maxArtifactBytes: {
      ...nonNegativeSafeIntegerSchema,
      maximum: 10_737_418_240,
    },
    maxElapsedMs: {
      ...positiveSafeIntegerSchema,
      maximum: 2_592_000_000,
    },
  },
  additionalProperties: false,
} as const;

const verificationRulesSchema = {
  type: 'object',
  required: [
    'requiredModes',
    'requiredClosure',
    'requiredCheckKinds',
    'repair',
    'rollback',
  ],
  properties: {
    requiredModes: {
      type: 'array',
      minItems: 1,
      maxItems: 1,
      uniqueItems: true,
      items: { const: 'apply' },
    },
    requiredClosure: { const: 'satisfied' },
    requiredCheckKinds: canonicalIdArraySchema,
    repair: { enum: ['forbidden', 'approval-bound'] },
    rollback: { enum: ['forbidden', 'approval-bound'] },
  },
  additionalProperties: false,
} as const;

const retentionRulesSchema = {
  type: 'object',
  required: [
    'auditDays',
    'sanitizedTraceDays',
    'rawPrivateArtifactDays',
    'providerStateDays',
    'requireDeletionReceipt',
  ],
  properties: {
    auditDays: { ...nonNegativeSafeIntegerSchema, maximum: 3_650 },
    sanitizedTraceDays: { ...nonNegativeSafeIntegerSchema, maximum: 3_650 },
    rawPrivateArtifactDays: { ...nonNegativeSafeIntegerSchema, maximum: 90 },
    providerStateDays: { ...nonNegativeSafeIntegerSchema, maximum: 90 },
    requireDeletionReceipt: { type: 'boolean' },
  },
  additionalProperties: false,
} as const;

const privacySchema = {
  type: 'object',
  required: [
    'maximumSensitivity',
    'allowedRegions',
    'providerTraining',
    'providerTelemetry',
    'rawArtifactCapture',
  ],
  properties: {
    maximumSensitivity: sensitivitySchema,
    allowedRegions: canonicalIdArraySchema,
    providerTraining: { enum: ['deny', 'policy-qualified'] },
    providerTelemetry: { enum: ['deny', 'policy-qualified'] },
    rawArtifactCapture: { enum: ['deny', 'role-restricted'] },
  },
  additionalProperties: false,
} as const;

const policyProperties = {
  id: { $ref: '#/$defs/canonicalId' },
  name: canonicalStringSchema,
  providerRules: {
    type: 'array',
    maxItems: 256,
    items: { $ref: '#/$defs/providerRule' },
  },
  modelRules: {
    type: 'array',
    maxItems: 256,
    items: { $ref: '#/$defs/modelRule' },
  },
  contextRules: contextPolicySchema,
  capabilityRules: {
    type: 'array',
    maxItems: 256,
    items: { $ref: '#/$defs/capabilityRule' },
  },
  approvalRules: {
    type: 'array',
    minItems: 1,
    maxItems: 256,
    items: { $ref: '#/$defs/approvalRule' },
  },
  networkRules: {
    type: 'array',
    maxItems: 256,
    items: { $ref: '#/$defs/networkRule' },
  },
  secretRules: {
    type: 'array',
    maxItems: 256,
    items: { $ref: '#/$defs/secretRule' },
  },
  budgetCeiling: budgetSchema,
  verificationRules: verificationRulesSchema,
  retentionRules: retentionRulesSchema,
  privacy: privacySchema,
} as const;

const policyRequired = [
  'wireVersion',
  'id',
  'name',
  'providerRules',
  'modelRules',
  'contextRules',
  'capabilityRules',
  'approvalRules',
  'networkRules',
  'secretRules',
  'budgetCeiling',
  'verificationRules',
  'retentionRules',
  'privacy',
] as const;

const policyDefinitions = {
  canonicalString: canonicalStringSchema,
  canonicalId: canonicalIdSchema,
  targetRef: targetRefSchema,
  providerRule: providerRuleSchema,
  modelRule: modelRuleSchema,
  capabilityRule: capabilityRuleSchema,
  approvalRule: approvalRuleSchema,
  networkRule: networkRuleSchema,
  secretRule: secretRuleSchema,
} as const;

/** Current immutable Workspace persistence wire contract. */
export const agentPolicyWireSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://prodivix.dev/schemas/agent/policy/v1.json',
  title: 'Prodivix AgentPolicy wire document',
  type: 'object',
  required: policyRequired,
  properties: {
    wireVersion: { const: 1 },
    ...policyProperties,
  },
  additionalProperties: false,
  $defs: policyDefinitions,
} as const;

/**
 * The only admitted pre-freeze wire shape. Migration adds a fail-closed
 * privacy policy; it never grants a provider more disclosure than v0 stated.
 */
export const agentPolicyWireSchemaV0 = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://prodivix.dev/schemas/agent/policy/v0.json',
  title: 'Prodivix AgentPolicy legacy wire document',
  type: 'object',
  required: policyRequired.filter((field) => field !== 'privacy'),
  properties: {
    wireVersion: { const: 0 },
    ...Object.fromEntries(
      Object.entries(policyProperties).filter(([field]) => field !== 'privacy')
    ),
  },
  additionalProperties: false,
  $defs: policyDefinitions,
} as const;

export const agentWorkspaceDocumentWireSchemas = Object.freeze({
  'agent-policy': agentPolicyWireSchema,
});

export const agentWorkspaceDocumentMigrationWireSchemas = Object.freeze({
  'agent-policy@0': agentPolicyWireSchemaV0,
  'agent-policy@1': agentPolicyWireSchema,
});
