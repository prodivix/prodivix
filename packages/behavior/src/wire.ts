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

const digestSchema = {
  type: 'string',
  pattern: '^sha256-[a-f0-9]{64}$',
} as const;

const positiveBudgetSchema = {
  type: 'integer',
  minimum: 1,
  maximum: 86_400_000,
} as const;

const jsonValueSchema = {
  anyOf: [
    { type: 'null' },
    { type: 'boolean' },
    { type: 'number' },
    { type: 'string', maxLength: 65_536 },
    {
      type: 'array',
      maxItems: 1_024,
      items: { $ref: '#/$defs/jsonValue' },
    },
    {
      type: 'object',
      maxProperties: 1_024,
      additionalProperties: { $ref: '#/$defs/jsonValue' },
    },
  ],
} as const;

const documentDigestRefSchema = {
  type: 'object',
  required: ['documentId'],
  properties: {
    documentId: { $ref: '#/$defs/canonicalId' },
    digest: { $ref: '#/$defs/digest' },
  },
  additionalProperties: false,
} as const;

const controlProfileRefSchema = {
  oneOf: [
    {
      type: 'object',
      required: ['kind', 'documentId'],
      properties: {
        kind: { const: 'workspace' },
        documentId: { $ref: '#/$defs/canonicalId' },
        digest: { $ref: '#/$defs/digest' },
      },
      additionalProperties: false,
    },
    {
      type: 'object',
      required: ['kind', 'presetId', 'digest'],
      properties: {
        kind: { const: 'preset' },
        presetId: { $ref: '#/$defs/canonicalId' },
        digest: { $ref: '#/$defs/digest' },
      },
      additionalProperties: false,
    },
  ],
} as const;

const semanticTargetSchema = {
  type: 'object',
  required: ['kind', 'id', 'workspaceDocumentId', 'capability'],
  properties: {
    kind: {
      enum: [
        'diagnostic-target',
        'semantic-symbol',
        'public-contract',
        'verification-target',
      ],
    },
    id: { $ref: '#/$defs/canonicalId' },
    workspaceDocumentId: { $ref: '#/$defs/canonicalId' },
    capability: { $ref: '#/$defs/canonicalId' },
    instanceScope: {
      type: 'object',
      required: ['kind', 'id'],
      properties: {
        kind: {
          enum: ['component-instance', 'collection-item', 'route-instance'],
        },
        id: { $ref: '#/$defs/canonicalId' },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
} as const;

const behaviorSourceRefSchema = {
  type: 'object',
  required: ['workspaceDocumentId', 'path'],
  properties: {
    workspaceDocumentId: { $ref: '#/$defs/canonicalId' },
    path: {
      type: 'string',
      minLength: 1,
      maxLength: 2_048,
      pattern: '^/',
    },
  },
  additionalProperties: false,
} as const;

const behaviorTriggerSchema = {
  type: 'object',
  required: ['id', 'domain', 'event'],
  properties: {
    id: { $ref: '#/$defs/canonicalId' },
    domain: {
      enum: [
        'route',
        'pir',
        'data',
        'nodegraph',
        'animation',
        'auth',
        'server',
        'scenario',
      ],
    },
    event: { $ref: '#/$defs/canonicalString' },
    target: { $ref: '#/$defs/semanticTarget' },
  },
  additionalProperties: false,
} as const;

const behaviorActionSchema = {
  type: 'object',
  required: [
    'kind',
    'target',
    'capabilityId',
    'runtimeZone',
    'effect',
    'cancellation',
  ],
  properties: {
    kind: {
      enum: [
        'navigate',
        'semantic-click',
        'semantic-input',
        'dispatch-data-operation',
        'invoke-nodegraph',
        'control-animation',
        'update-temporary-state',
        'invoke-code-slot',
        'wait-observation',
      ],
    },
    target: { $ref: '#/$defs/semanticTarget' },
    input: { $ref: '#/$defs/jsonValue' },
    capabilityId: { $ref: '#/$defs/canonicalId' },
    runtimeZone: { enum: ['client', 'server', 'test'] },
    effect: { enum: ['none', 'read', 'write'] },
    cancellation: { enum: ['none', 'cooperative', 'required'] },
  },
  additionalProperties: false,
} as const;

const behaviorObservationSchema = {
  type: 'object',
  required: ['kind', 'target'],
  properties: {
    kind: {
      enum: [
        'route',
        'visible',
        'enabled',
        'value',
        'data-lifecycle',
        'network-absence',
        'console-absence',
        'nodegraph-output',
        'animation-state',
        'composition-result',
        'composition-marker',
        'accessible-tree',
        'visual-baseline',
        'code-assertion',
      ],
    },
    target: { $ref: '#/$defs/semanticTarget' },
    expected: { $ref: '#/$defs/jsonValue' },
  },
  additionalProperties: false,
} as const;

const behaviorAssertionSchema = {
  type: 'object',
  required: ['id', 'operator'],
  properties: {
    id: { $ref: '#/$defs/canonicalId' },
    operator: {
      enum: [
        'equals',
        'not-equals',
        'contains',
        'matches-schema',
        'absent',
        'custom',
      ],
    },
    expected: { $ref: '#/$defs/jsonValue' },
    codeReferenceId: { $ref: '#/$defs/canonicalId' },
  },
  additionalProperties: false,
} as const;

const behaviorStepMetadataProperties = {
  id: { $ref: '#/$defs/canonicalId' },
  label: { $ref: '#/$defs/canonicalString' },
  source: { $ref: '#/$defs/sourceRef' },
  failureMode: { enum: ['stop', 'collect-and-stop', 'advisory'] },
} as const;

const behaviorStepSchema = {
  oneOf: [
    {
      type: 'object',
      required: ['id', 'kind', 'failureMode', 'action'],
      properties: {
        ...behaviorStepMetadataProperties,
        kind: { const: 'action' },
        action: { $ref: '#/$defs/action' },
      },
      additionalProperties: false,
    },
    {
      type: 'object',
      required: ['id', 'kind', 'failureMode', 'observation', 'assertions'],
      properties: {
        ...behaviorStepMetadataProperties,
        kind: { const: 'observation' },
        observation: { $ref: '#/$defs/observation' },
        assertions: {
          type: 'array',
          minItems: 1,
          maxItems: 256,
          items: { $ref: '#/$defs/assertion' },
        },
      },
      additionalProperties: false,
    },
    {
      type: 'object',
      required: ['id', 'kind', 'failureMode', 'steps'],
      properties: {
        ...behaviorStepMetadataProperties,
        kind: { const: 'parallel' },
        steps: {
          type: 'array',
          minItems: 1,
          maxItems: 256,
          items: { $ref: '#/$defs/step' },
        },
      },
      additionalProperties: false,
    },
    {
      type: 'object',
      required: ['id', 'kind', 'failureMode', 'participantStepIds'],
      properties: {
        ...behaviorStepMetadataProperties,
        kind: { const: 'barrier' },
        participantStepIds: {
          type: 'array',
          minItems: 1,
          maxItems: 256,
          uniqueItems: true,
          items: { $ref: '#/$defs/canonicalId' },
        },
        observation: { $ref: '#/$defs/observation' },
      },
      additionalProperties: false,
    },
  ],
} as const;

/** Numeric evolution metadata is intentionally confined to this wire schema. */
export const behaviorScenarioWireSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://prodivix.dev/schemas/behavior/scenario/v1.json',
  title: 'Prodivix BehaviorScenario wire document',
  type: 'object',
  required: [
    'wireVersion',
    'id',
    'name',
    'criticality',
    'tags',
    'entry',
    'steps',
    'fixtureRefs',
    'controlProfileRef',
    'baselineRefs',
    'timeoutPolicy',
  ],
  properties: {
    wireVersion: { const: 1 },
    id: { $ref: '#/$defs/canonicalId' },
    name: { $ref: '#/$defs/canonicalString' },
    description: { type: 'string', maxLength: 8_192 },
    owner: {
      type: 'object',
      required: ['principalId'],
      properties: {
        principalId: { $ref: '#/$defs/canonicalId' },
      },
      additionalProperties: false,
    },
    criticality: { enum: ['smoke', 'standard', 'critical'] },
    tags: {
      type: 'array',
      maxItems: 128,
      uniqueItems: true,
      items: { $ref: '#/$defs/canonicalId' },
    },
    entry: { $ref: '#/$defs/trigger' },
    steps: {
      type: 'array',
      minItems: 1,
      maxItems: 2_048,
      items: { $ref: '#/$defs/step' },
    },
    fixtureRefs: {
      type: 'array',
      maxItems: 256,
      items: { $ref: '#/$defs/documentDigestRef' },
    },
    controlProfileRef: { $ref: '#/$defs/controlProfileRef' },
    baselineRefs: {
      type: 'array',
      maxItems: 256,
      items: { $ref: '#/$defs/documentDigestRef' },
    },
    timeoutPolicy: {
      type: 'object',
      required: ['totalMs', 'stepMs', 'settleMs'],
      properties: {
        totalMs: { $ref: '#/$defs/positiveBudget' },
        stepMs: { $ref: '#/$defs/positiveBudget' },
        settleMs: { $ref: '#/$defs/positiveBudget' },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
  $defs: {
    canonicalString: canonicalStringSchema,
    canonicalId: canonicalIdSchema,
    digest: digestSchema,
    positiveBudget: positiveBudgetSchema,
    jsonValue: jsonValueSchema,
    documentDigestRef: documentDigestRefSchema,
    controlProfileRef: controlProfileRefSchema,
    semanticTarget: semanticTargetSchema,
    sourceRef: behaviorSourceRefSchema,
    trigger: behaviorTriggerSchema,
    action: behaviorActionSchema,
    observation: behaviorObservationSchema,
    assertion: behaviorAssertionSchema,
    step: behaviorStepSchema,
  },
} as const;

export const behaviorControlProfileWireSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://prodivix.dev/schemas/behavior/control-profile/v1.json',
  title: 'Prodivix BehaviorControlProfile wire document',
  type: 'object',
  required: [
    'wireVersion',
    'id',
    'name',
    'clock',
    'timezone',
    'random',
    'identifiers',
    'scheduler',
    'network',
    'storage',
    'rendering',
    'serviceWorker',
    'settle',
    'budgets',
  ],
  properties: {
    wireVersion: { const: 1 },
    id: { $ref: '#/$defs/canonicalId' },
    name: { $ref: '#/$defs/canonicalString' },
    clock: {
      type: 'object',
      required: ['mode', 'epoch', 'tickMs'],
      properties: {
        mode: { const: 'virtual' },
        epoch: { $ref: '#/$defs/canonicalString' },
        tickMs: { $ref: '#/$defs/positiveBudget' },
      },
      additionalProperties: false,
    },
    timezone: { $ref: '#/$defs/canonicalString' },
    random: {
      type: 'object',
      required: ['algorithm', 'seed'],
      properties: {
        algorithm: { $ref: '#/$defs/canonicalId' },
        seed: { $ref: '#/$defs/canonicalString' },
      },
      additionalProperties: false,
    },
    identifiers: {
      type: 'object',
      required: ['seed', 'namespaces'],
      properties: {
        seed: { $ref: '#/$defs/canonicalString' },
        namespaces: {
          type: 'array',
          minItems: 4,
          maxItems: 4,
          uniqueItems: true,
          items: { enum: ['attempt', 'step', 'action', 'operation'] },
        },
      },
      additionalProperties: false,
    },
    scheduler: {
      type: 'object',
      required: ['strategy', 'seed', 'maximumTurns'],
      properties: {
        strategy: { const: 'deterministic' },
        seed: { $ref: '#/$defs/canonicalString' },
        maximumTurns: {
          type: 'integer',
          minimum: 1,
          maximum: 1_000_000,
        },
      },
      additionalProperties: false,
    },
    network: {
      type: 'object',
      required: ['mode', 'undeclaredRequest'],
      properties: {
        mode: { enum: ['fixture-only', 'isolated-live-read'] },
        undeclaredRequest: { const: 'reject' },
      },
      additionalProperties: false,
    },
    storage: {
      type: 'object',
      required: ['bootstrapFixtureIds', 'cleanup'],
      properties: {
        bootstrapFixtureIds: {
          type: 'array',
          maxItems: 256,
          uniqueItems: true,
          items: { $ref: '#/$defs/canonicalId' },
        },
        cleanup: { const: 'required' },
      },
      additionalProperties: false,
    },
    rendering: {
      type: 'object',
      required: ['devicePixelRatio', 'animationClock', 'fontReadiness'],
      properties: {
        devicePixelRatio: {
          type: 'number',
          exclusiveMinimum: 0,
          maximum: 8,
        },
        animationClock: { const: 'virtual' },
        fontReadiness: { enum: ['required', 'bounded'] },
      },
      additionalProperties: false,
    },
    serviceWorker: {
      type: 'object',
      required: ['mode', 'cache'],
      properties: {
        mode: { enum: ['disabled', 'isolated'] },
        cache: { enum: ['empty', 'fixture'] },
      },
      additionalProperties: false,
    },
    settle: {
      type: 'object',
      required: ['conditions', 'maximumFrames'],
      properties: {
        conditions: {
          type: 'array',
          minItems: 1,
          maxItems: 5,
          uniqueItems: true,
          items: {
            enum: [
              'render-stable',
              'declared-effects-complete',
              'font-ready',
              'animation-marker',
              'barrier',
            ],
          },
        },
        maximumFrames: {
          type: 'integer',
          minimum: 1,
          maximum: 10_000,
        },
      },
      additionalProperties: false,
    },
    budgets: {
      type: 'object',
      required: ['totalMs', 'stepMs', 'settleMs', 'networkMs', 'animationMs'],
      properties: {
        totalMs: { $ref: '#/$defs/positiveBudget' },
        stepMs: { $ref: '#/$defs/positiveBudget' },
        settleMs: { $ref: '#/$defs/positiveBudget' },
        networkMs: { $ref: '#/$defs/positiveBudget' },
        animationMs: { $ref: '#/$defs/positiveBudget' },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
  $defs: {
    canonicalString: canonicalStringSchema,
    canonicalId: canonicalIdSchema,
    positiveBudget: positiveBudgetSchema,
  },
} as const;

export const behaviorFixtureSetWireSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://prodivix.dev/schemas/behavior/fixture-set/v1.json',
  title: 'Prodivix BehaviorFixtureSet wire document',
  type: 'object',
  required: ['wireVersion', 'id', 'name', 'fixtures'],
  properties: {
    wireVersion: { const: 1 },
    id: { $ref: '#/$defs/canonicalId' },
    name: { $ref: '#/$defs/canonicalString' },
    fixtures: {
      type: 'array',
      maxItems: 2_048,
      items: { $ref: '#/$defs/fixture' },
    },
  },
  additionalProperties: false,
  $defs: {
    canonicalString: canonicalStringSchema,
    canonicalId: canonicalIdSchema,
    digest: digestSchema,
    jsonValue: jsonValueSchema,
    fixture: {
      type: 'object',
      required: ['id', 'target', 'inputDigest', 'outcome'],
      properties: {
        id: { $ref: '#/$defs/canonicalId' },
        target: {
          type: 'object',
          required: ['kind', 'resourceId'],
          properties: {
            kind: {
              enum: [
                'data-operation',
                'server-function',
                'storage',
                'auth-session',
              ],
            },
            resourceId: { $ref: '#/$defs/canonicalId' },
          },
          additionalProperties: false,
        },
        inputDigest: { $ref: '#/$defs/digest' },
        attempt: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
        },
        page: { $ref: '#/$defs/canonicalString' },
        outcome: {
          oneOf: [
            {
              type: 'object',
              required: ['kind', 'value'],
              properties: {
                kind: { const: 'result' },
                value: { $ref: '#/$defs/jsonValue' },
              },
              additionalProperties: false,
            },
            {
              type: 'object',
              required: ['kind', 'fault'],
              properties: {
                kind: { const: 'fault' },
                fault: {
                  enum: ['error', 'timeout', 'disconnect', 'retry-after'],
                },
                delayMs: {
                  type: 'integer',
                  minimum: 0,
                  maximum: 86_400_000,
                },
              },
              additionalProperties: false,
            },
          ],
        },
      },
      additionalProperties: false,
    },
  },
} as const;

export const behaviorDocumentWireSchemas = Object.freeze({
  'behavior-scenario': behaviorScenarioWireSchema,
  'behavior-control-profile': behaviorControlProfileWireSchema,
  'behavior-fixture-set': behaviorFixtureSetWireSchema,
});
