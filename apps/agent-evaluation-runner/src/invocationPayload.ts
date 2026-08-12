import {
  AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME,
  AGENT_EVALUATION_RESULT_SUBMIT_TOOL_ID,
  createAgentEvaluationCaseResultContract,
  isAgentEvaluationCapabilityEffectBootstrapInvocationAuthority,
  digestAgentCanonicalValue,
  digestAgentEvaluationInlinePayload,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentNativeProviderCapabilityRuntimeRequestProjectionSelf,
  specializeAgentEvaluationCapabilityEffectToolSchemas,
  type AgentEvaluationCaseMaterial,
  type AgentEvaluationCapabilityEffectRequestRefAuthorityReceipt,
  type AgentEvaluationCapabilityEffectBootstrapInvocationMaterial,
  type AgentEvaluationCaseResultContract,
  scanAgentArtifactForProtectedHoldoutLeak,
  type AgentEvaluationInvocationMaterial,
  type AgentEvaluationToolInputMaterial,
  type AgentNativeProviderTransportRequest,
  type AgentNativeProviderCapabilityRuntimeRequestMaterial,
  type AgentProviderAdapterInvocationRequest,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import type {
  AgentEvaluationJsonObject,
  AgentEvaluationJsonValue,
  AgentEvaluationProviderPayload,
} from './providerTransport';

export type AgentEvaluationInvocationPayloadProtocol =
  'openai-responses' | 'anthropic-messages' | 'gemini-interactions';

export type AgentEvaluationProviderToolBinding = Readonly<{
  toolId: string;
  providerToolName: string;
  definitionDigest: CanonicalDigest;
}>;

export type AgentEvaluationProviderToolResultBinding = Readonly<{
  toolCallId: string;
  providerToolCallId: string;
  toolId: string;
  providerToolName: string;
  argumentsDigest: CanonicalDigest;
  resultDigest: CanonicalDigest;
}>;

export type AgentEvaluationResultToolBinding = Readonly<{
  toolId: typeof AGENT_EVALUATION_RESULT_SUBMIT_TOOL_ID;
  providerToolName: typeof AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME;
  toolVersion: string;
  schemaVersion: 1;
  schemaDigest: CanonicalDigest;
  inputSchemaDigest: CanonicalDigest;
  toolDefinitionDigest: CanonicalDigest;
  caseId: string;
  caseDigest: CanonicalDigest;
  materialDigest: CanonicalDigest;
  contractDigest: CanonicalDigest;
}>;

export type AgentEvaluationEncodedInvocationPayload = Readonly<{
  protocolFamily: AgentEvaluationInvocationPayloadProtocol;
  payload: AgentEvaluationProviderPayload;
  toolBindings: readonly AgentEvaluationProviderToolBinding[];
  toolResultBindings: readonly AgentEvaluationProviderToolResultBinding[];
  resultToolBinding?: AgentEvaluationResultToolBinding;
  turnHistoryDigest?: CanonicalDigest;
  payloadDigest: CanonicalDigest;
}>;

export type AgentEvaluationCaseEncodedInvocationPayload =
  AgentEvaluationEncodedInvocationPayload &
    Readonly<{ resultToolBinding: AgentEvaluationResultToolBinding }>;

export type AgentEvaluationInvocationToolPhase =
  'domain-tools' | 'result-submission';

export type AgentEvaluationNormalizedTurnToolExchange = Readonly<{
  turnIndex: number;
  toolEventSequence: number;
  toolCallId: string;
  providerToolCallId: string;
  toolId: string;
  providerToolName: string;
  arguments: AgentEvaluationJsonObject;
  argumentsDigest: CanonicalDigest;
  controlledResult: AgentEvaluationJsonValue;
  resultDigest: CanonicalDigest;
  priorResponseDigest: CanonicalDigest;
  continuationReceiptDigest: CanonicalDigest;
  providerContinuationRef?: string;
  providerContinuationRefDigest?: CanonicalDigest;
}>;

export type AgentEvaluationCaseTurnInvocationPayloadOptions =
  AgentEvaluationInvocationPayloadCodecOptions &
    Readonly<{
      phase: AgentEvaluationInvocationToolPhase;
      domainToolChoice: 'auto' | 'required';
      allowParallelDomainToolCalls: boolean;
      turnHistory: readonly AgentEvaluationNormalizedTurnToolExchange[];
      capabilityEffectRequestRefAuthorities?: readonly AgentEvaluationCapabilityEffectRequestRefAuthorityReceipt[];
      capabilityEffectBootstrapInvocationMaterial?: AgentEvaluationCapabilityEffectBootstrapInvocationMaterial;
    }>;

export type AgentEvaluationInvocationPayloadCodecOptions = Readonly<{
  maximumOutputTokens?: number;
  timeoutMs?: number;
  maximumResponseBytes?: number;
}>;

export type AgentEvaluationInvocationPayloadLease = Readonly<{
  protocolFamily: AgentEvaluationInvocationPayloadProtocol;
  invocation: AgentProviderAdapterInvocationRequest;
  encodedPayload: AgentEvaluationEncodedInvocationPayload;
  protectedLeakCanaries?: readonly string[];
  resultSpoolAuthority?: NonNullable<
    AgentEvaluationProviderPayload['resultSpoolAuthority']
  >;
}>;

const defaultMaximumOutputTokens = 4_096;
const maximumConfiguredOutputTokens = 1_048_576;
const maximumConfiguredTimeoutMs = 15 * 60_000;
const maximumConfiguredResponseBytes = 64 * 1_024 * 1_024;
const commonImageMediaTypes = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const geminiImageMediaTypes = new Set([
  ...commonImageMediaTypes,
  'image/bmp',
  'image/heic',
  'image/heif',
  'image/tiff',
]);
const documentMediaTypes = new Set(['application/pdf']);

const jsonObject = (
  value: Readonly<Record<string, AgentEvaluationJsonValue>>
): AgentEvaluationJsonObject => Object.freeze(value);

const jsonArray = <T extends AgentEvaluationJsonValue>(
  value: readonly T[]
): readonly T[] => Object.freeze(value);

const assertBoundedPositiveInteger = (
  value: number | undefined,
  fallback: number,
  maximum: number,
  label: string
): number => {
  const normalized = value ?? fallback;
  if (
    !Number.isSafeInteger(normalized) ||
    normalized < 1 ||
    normalized > maximum
  ) {
    throw new TypeError(`${label} is outside its frozen bounds.`);
  }
  return normalized;
};

const inspectJson = (value: unknown, label: string): void => {
  const ancestors = new Set<object>();
  let nodes = 0;
  const visit = (candidate: unknown, depth: number): void => {
    nodes += 1;
    if (nodes > 100_000 || depth > 48) {
      throw new TypeError(`${label} exceeds JSON safety bounds.`);
    }
    if (
      candidate === null ||
      typeof candidate === 'string' ||
      typeof candidate === 'boolean'
    ) {
      return;
    }
    if (typeof candidate === 'number') {
      if (Number.isFinite(candidate)) return;
      throw new TypeError(`${label} contains a non-finite number.`);
    }
    if (typeof candidate !== 'object' || ancestors.has(candidate)) {
      throw new TypeError(`${label} contains a cycle or non-JSON value.`);
    }
    ancestors.add(candidate);
    try {
      if (Array.isArray(candidate)) {
        if (
          Object.getPrototypeOf(candidate) !== Array.prototype ||
          Object.getOwnPropertySymbols(candidate).length > 0 ||
          Object.getOwnPropertyNames(candidate).length !== candidate.length + 1
        ) {
          throw new TypeError(`${label} contains an unsafe array.`);
        }
        for (let index = 0; index < candidate.length; index += 1) {
          const descriptor = Object.getOwnPropertyDescriptor(
            candidate,
            String(index)
          );
          if (!descriptor?.enumerable || !('value' in descriptor)) {
            throw new TypeError(
              `${label} contains an accessor or sparse array.`
            );
          }
          visit(descriptor.value, depth + 1);
        }
        return;
      }
      if (
        !isPlainObject(candidate) ||
        Object.getOwnPropertySymbols(candidate).length > 0
      ) {
        throw new TypeError(`${label} contains an unsafe object.`);
      }
      for (const [key, descriptor] of Object.entries(
        Object.getOwnPropertyDescriptors(candidate)
      )) {
        if (
          isUnsafeObjectKey(key) ||
          !descriptor.enumerable ||
          !('value' in descriptor)
        ) {
          throw new TypeError(`${label} contains an unsafe object member.`);
        }
        visit(descriptor.value, depth + 1);
      }
    } finally {
      ancestors.delete(candidate);
    }
  };
  visit(value, 0);
};

const cloneJsonValue = (value: unknown): AgentEvaluationJsonValue => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => cloneJsonValue(entry)));
  }
  if (!isPlainObject(value)) {
    throw new TypeError('Evaluation JSON value is not a plain record.');
  }
  const clone: Record<string, AgentEvaluationJsonValue> = Object.create(null);
  for (const [key, descriptor] of Object.entries(
    Object.getOwnPropertyDescriptors(value)
  )) {
    if (
      isUnsafeObjectKey(key) ||
      !descriptor.enumerable ||
      !('value' in descriptor)
    ) {
      throw new TypeError('Evaluation JSON value contains an unsafe member.');
    }
    Object.defineProperty(clone, key, {
      configurable: false,
      enumerable: true,
      value: cloneJsonValue(descriptor.value),
      writable: false,
    });
  }
  return Object.freeze(clone);
};

const providerToolNameFor = (toolId: string): string =>
  `tool_${digestAgentCanonicalValue({ toolId }).slice('sha256-'.length, 31)}`;

const providerToolCallIdFor = (toolCallId: string): string =>
  `call_${digestAgentCanonicalValue({ toolCallId }).slice('sha256-'.length, 31)}`;

const assertInvocationMaterial = (
  material: AgentEvaluationInvocationMaterial,
  allowEmptyTools = false
): void => {
  inspectJson(material, 'Evaluation invocation material');
  if (
    material.blocks.length === 0 ||
    material.contextItems.length === 0 ||
    (!allowEmptyTools && material.tools.length === 0) ||
    new Set(material.blocks.map(({ blockId }) => blockId)).size !==
      material.blocks.length ||
    new Set(material.contextItems.map(({ contextItemId }) => contextItemId))
      .size !== material.contextItems.length ||
    new Set(material.tools.map(({ toolId }) => toolId)).size !==
      material.tools.length
  ) {
    throw new TypeError('Evaluation invocation material is incomplete.');
  }
  const tools = new Set(material.tools.map(({ toolId }) => toolId));
  for (const block of material.blocks) {
    if (block.kind === 'text') {
      if (
        block.text.length === 0 ||
        (block.role === 'developer') !==
          (block.instructionBoundary === 'developer')
      ) {
        throw new TypeError('Evaluation text authority boundary drifted.');
      }
      continue;
    }
    if (block.kind === 'tool-result') {
      if (
        (!allowEmptyTools && !tools.has(block.toolId)) ||
        block.instructionBoundary !== 'data-only' ||
        digestAgentCanonicalValue(block.result) !== block.resultDigest
      ) {
        throw new TypeError('Evaluation tool-result binding drifted.');
      }
      continue;
    }
    if (block.kind === 'workspace-fixture') {
      if (block.instructionBoundary !== 'data-only') {
        throw new TypeError('Evaluation workspace fixture boundary drifted.');
      }
      continue;
    }
    if (
      block.instructionBoundary !== 'data-only' ||
      digestAgentEvaluationInlinePayload(block.mediaType, block.bytesBase64) !==
        block.contentDigest
    ) {
      throw new TypeError('Evaluation media binding drifted.');
    }
  }
  for (const context of material.contextItems) {
    if (
      context.instructionBoundary !== 'data-only' ||
      digestAgentCanonicalValue(context.content) !== context.contentDigest
    ) {
      throw new TypeError('Evaluation Context binding drifted.');
    }
  }
  for (const tool of material.tools) {
    const { definitionDigest, ...definition } = tool;
    if (digestAgentCanonicalValue(definition) !== definitionDigest) {
      throw new TypeError('Evaluation tool definition binding drifted.');
    }
  }
};

const dataEnvelope = (value: Readonly<Record<string, unknown>>): string =>
  canonicalJsonText({
    format: 'prodivix.agent-evaluation-data',
    version: 1,
    instructionBoundary: 'data-only',
    ...value,
  });

const developerText = (material: AgentEvaluationInvocationMaterial): string =>
  material.blocks
    .filter(
      (
        block
      ): block is Extract<(typeof material.blocks)[number], { kind: 'text' }> =>
        block.kind === 'text' && block.role === 'developer'
    )
    .map(({ authority, blockId, text }) =>
      canonicalJsonText({
        format: 'prodivix.agent-evaluation-developer-instruction',
        version: 1,
        authority,
        blockId,
        text,
      })
    )
    .join('\n');

const textAndContextInputs = (
  material: AgentEvaluationInvocationMaterial
): readonly string[] =>
  Object.freeze([
    ...material.blocks.flatMap((block) =>
      block.kind === 'text' && block.role === 'user'
        ? [
            dataEnvelope({
              kind: 'text',
              blockId: block.blockId,
              authority: block.authority,
              text: block.text,
            }),
          ]
        : block.kind === 'workspace-fixture'
          ? [
              dataEnvelope({
                kind: 'workspace-fixture',
                blockId: block.blockId,
                authority: block.authority,
                fixture: {
                  format: block.fixture.format,
                  version: block.fixture.version,
                  scenarioId: block.fixture.scenarioId,
                  domainOwner: block.fixture.domainOwner,
                  frameworkTarget: block.fixture.frameworkTarget,
                  snapshot: block.fixture.snapshot,
                  targetRefs: block.fixture.targetRefs,
                  sourceRefs: block.fixture.sourceRefs,
                  actionRegistry: block.fixture.actionRegistry,
                  capabilities: block.fixture.capabilities,
                },
              }),
            ]
          : []
    ),
    ...material.contextItems.map((item) =>
      dataEnvelope({
        kind: 'context',
        contextItemId: item.contextItemId,
        sourceRef: item.sourceRef,
        authority: item.authority,
        contentDigest: item.contentDigest,
        content: item.content,
      })
    ),
  ]);

const mediaMetadata = (
  block: Extract<
    AgentEvaluationInvocationMaterial['blocks'][number],
    { kind: 'image' | 'document' }
  >
): string =>
  dataEnvelope({
    kind: block.kind,
    blockId: block.blockId,
    sourceRef: block.sourceRef,
    authority: block.authority,
    mediaType: block.mediaType,
    contentDigest: block.contentDigest,
  });

const assertSupportedMedia = (
  protocolFamily: AgentEvaluationInvocationPayloadProtocol,
  kind: 'image' | 'document',
  mediaType: string
): void => {
  const supported =
    kind === 'document'
      ? documentMediaTypes
      : protocolFamily === 'gemini-interactions'
        ? geminiImageMediaTypes
        : commonImageMediaTypes;
  if (!supported.has(mediaType)) {
    throw new TypeError(
      `Evaluation ${kind} media type is unsupported by ${protocolFamily}.`
    );
  }
};

const sortedTools = (
  material: AgentEvaluationInvocationMaterial
): readonly AgentEvaluationToolInputMaterial[] =>
  Object.freeze(
    [...material.tools].sort((left, right) =>
      compareUnicodeCodePoints(left.toolId, right.toolId)
    )
  );

const assertCaseMaterialBinding = (
  material: AgentEvaluationCaseMaterial
): void => {
  inspectJson(material, 'Evaluation case material');
  const { materialDigest, ...base } = material;
  if (
    !isAgentCanonicalDigest(materialDigest) ||
    digestAgentCanonicalValue(base) !== materialDigest
  ) {
    throw new TypeError('Evaluation case material digest drifted.');
  }
};

const toolDescription = (tool: AgentEvaluationToolInputMaterial): string =>
  `${tool.description}\n${dataEnvelope({
    kind: 'tool-authority',
    toolId: tool.toolId,
    effect: tool.effect,
    definitionDigest: tool.definitionDigest,
  })}`;

const resultToolDescription = (
  contract: AgentEvaluationCaseResultContract
): string =>
  `Submit the sole typed terminal evaluation result.\n${dataEnvelope({
    kind: 'evaluation-result-contract',
    toolId: contract.tool.toolId,
    toolVersion: contract.tool.toolVersion,
    schemaVersion: contract.tool.schemaVersion,
    schemaDigest: contract.tool.schemaDigest,
    inputSchemaDigest: contract.tool.inputSchemaDigest,
    toolDefinitionDigest: contract.tool.toolDefinitionDigest,
    contractDigest: contract.contractDigest,
    caseId: contract.tool.caseId,
    caseDigest: contract.tool.caseDigest,
    materialDigest: contract.tool.materialDigest,
  })}`;

const resultToolBindingFor = (
  contract: AgentEvaluationCaseResultContract
): AgentEvaluationResultToolBinding =>
  Object.freeze({
    toolId: contract.tool.toolId,
    providerToolName: contract.tool.nativeToolName,
    toolVersion: contract.tool.toolVersion,
    schemaVersion: contract.tool.schemaVersion,
    schemaDigest: contract.tool.schemaDigest,
    inputSchemaDigest: contract.tool.inputSchemaDigest,
    toolDefinitionDigest: contract.tool.toolDefinitionDigest,
    caseId: contract.tool.caseId,
    caseDigest: contract.tool.caseDigest,
    materialDigest: contract.tool.materialDigest,
    contractDigest: contract.contractDigest,
  });

const toolBindingsFor = (
  material: AgentEvaluationInvocationMaterial,
  resultContract?: AgentEvaluationCaseResultContract
): readonly AgentEvaluationProviderToolBinding[] =>
  Object.freeze([
    ...sortedTools(material).map((tool) =>
      Object.freeze({
        toolId: tool.toolId,
        providerToolName: providerToolNameFor(tool.toolId),
        definitionDigest: tool.definitionDigest,
      })
    ),
    ...(resultContract
      ? [
          Object.freeze({
            toolId: resultContract.tool.toolId,
            providerToolName: resultContract.tool.nativeToolName,
            definitionDigest: resultContract.tool.toolDefinitionDigest,
          }),
        ]
      : []),
  ]);

type AgentEvaluationToolResultBlock = Extract<
  AgentEvaluationInvocationMaterial['blocks'][number],
  { kind: 'tool-result' }
>;

const matchesPortableSchemaValue = (
  value: unknown,
  schemaValue: unknown,
  depth = 0
): boolean => {
  if (!isPlainObject(schemaValue) || depth > 16) return false;
  const schema = schemaValue as Record<string, unknown>;
  if (
    Array.isArray(schema.enum) &&
    !schema.enum.some((candidate) => sameCanonicalJson(candidate, value))
  ) {
    return false;
  }
  if ('const' in schema && !sameCanonicalJson(schema.const, value)) {
    return false;
  }
  switch (schema.type) {
    case undefined:
      return true;
    case 'null':
      return value === null;
    case 'boolean':
      return typeof value === 'boolean';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isSafeInteger(value);
    case 'string':
      return (
        typeof value === 'string' &&
        (typeof schema.minLength !== 'number' ||
          value.length >= schema.minLength) &&
        (typeof schema.maxLength !== 'number' ||
          value.length <= schema.maxLength)
      );
    case 'array':
      return (
        Array.isArray(value) &&
        (typeof schema.minItems !== 'number' ||
          value.length >= schema.minItems) &&
        (typeof schema.maxItems !== 'number' ||
          value.length <= schema.maxItems) &&
        (schema.items === undefined ||
          value.every((entry) =>
            matchesPortableSchemaValue(entry, schema.items, depth + 1)
          ))
      );
    case 'object': {
      if (!isPlainObject(value)) return false;
      const properties = isPlainObject(schema.properties)
        ? (schema.properties as Record<string, unknown>)
        : {};
      const required = Array.isArray(schema.required) ? schema.required : [];
      return (
        required.every(
          (key) => typeof key === 'string' && Object.hasOwn(value, key)
        ) &&
        Object.entries(value).every(
          ([key, entry]) =>
            (Object.hasOwn(properties, key) &&
              matchesPortableSchemaValue(entry, properties[key], depth + 1)) ||
            schema.additionalProperties !== false
        )
      );
    }
    default:
      return false;
  }
};

export const isAgentEvaluationToolInputArguments = (
  value: unknown,
  tool: AgentEvaluationToolInputMaterial
): value is AgentEvaluationJsonObject =>
  isPlainObject(value) && matchesPortableSchemaValue(value, tool.inputSchema);

const syntheticToolArgumentsFor = (
  material: AgentEvaluationInvocationMaterial,
  block: AgentEvaluationToolResultBlock
): AgentEvaluationJsonObject => {
  const tool = material.tools.find(({ toolId }) => toolId === block.toolId);
  if (!tool || !isPlainObject(tool.inputSchema)) {
    throw new TypeError(
      'Evaluation synthetic tool history requires an object input schema.'
    );
  }
  const schema = tool.inputSchema as Record<string, unknown>;
  if (
    schema.type !== 'object' ||
    !isPlainObject(schema.properties) ||
    (schema.required !== undefined &&
      (!Array.isArray(schema.required) ||
        schema.required.some(
          (key) =>
            typeof key !== 'string' ||
            isUnsafeObjectKey(key) ||
            !Object.hasOwn(schema.properties as object, key)
        )))
  ) {
    throw new TypeError(
      'Evaluation synthetic tool history has an unsupported input schema.'
    );
  }
  const required = (schema.required ?? []) as readonly string[];
  if (!isPlainObject(block.result) && required.length > 0) {
    throw new TypeError(
      'Evaluation synthetic tool arguments cannot bind the tool result.'
    );
  }
  const result = block.result as Record<string, unknown>;
  const properties = schema.properties as Record<string, unknown>;
  const argumentsRecord: Record<string, AgentEvaluationJsonValue> =
    Object.create(null);
  for (const key of required) {
    const descriptor = Object.getOwnPropertyDescriptor(result, key);
    if (!descriptor?.enumerable || !('value' in descriptor)) {
      throw new TypeError(
        'Evaluation synthetic tool arguments cannot bind the tool result.'
      );
    }
    if (!matchesPortableSchemaValue(descriptor.value, properties[key])) {
      throw new TypeError(
        'Evaluation synthetic tool arguments violate the tool input schema.'
      );
    }
    Object.defineProperty(argumentsRecord, key, {
      configurable: false,
      enumerable: true,
      value: cloneJsonValue(descriptor.value),
      writable: false,
    });
  }
  return Object.freeze(argumentsRecord);
};

type ReplayToolExchange = Readonly<{
  turnIndex: number;
  toolEventSequence: number;
  toolCallId: string;
  providerToolCallId: string;
  toolId: string;
  providerToolName: string;
  arguments: AgentEvaluationJsonObject;
  argumentsDigest: CanonicalDigest;
  controlledResult: AgentEvaluationJsonValue;
  resultDigest: CanonicalDigest;
  priorResponseDigest?: CanonicalDigest;
  continuationReceiptDigest?: CanonicalDigest;
  providerContinuationRef?: string;
  providerContinuationRefDigest?: CanonicalDigest;
}>;

const normalizedTurnHistoryRequiredKeys = Object.freeze([
  'turnIndex',
  'toolEventSequence',
  'toolCallId',
  'providerToolCallId',
  'toolId',
  'providerToolName',
  'arguments',
  'argumentsDigest',
  'controlledResult',
  'resultDigest',
  'priorResponseDigest',
  'continuationReceiptDigest',
] as const);

const hasExactNormalizedTurnHistoryKeys = (
  value: AgentEvaluationNormalizedTurnToolExchange
): boolean => {
  const optionalKeys = [
    value.providerContinuationRef === undefined
      ? undefined
      : 'providerContinuationRef',
    value.providerContinuationRefDigest === undefined
      ? undefined
      : 'providerContinuationRefDigest',
  ].filter((key): key is string => key !== undefined);
  const expected = new Set<string>([
    ...normalizedTurnHistoryRequiredKeys,
    ...optionalKeys,
  ]);
  return (
    Object.keys(value).length === expected.size &&
    Object.keys(value).every((key) => expected.has(key)) &&
    Object.getOwnPropertySymbols(value).length === 0
  );
};

const fixtureReplayHistoryFor = (
  material: AgentEvaluationInvocationMaterial,
  bindings: readonly AgentEvaluationProviderToolBinding[]
): readonly ReplayToolExchange[] => {
  const names = new Map(
    bindings.map(({ toolId, providerToolName }) => [toolId, providerToolName])
  );
  let toolEventSequence = 0;
  return Object.freeze(
    material.blocks.flatMap((block) => {
      if (block.kind !== 'tool-result') return [];
      const providerToolName = names.get(block.toolId);
      if (!providerToolName) {
        throw new TypeError(
          'Evaluation tool-result references an unknown tool.'
        );
      }
      toolEventSequence += 1;
      const argumentsValue = syntheticToolArgumentsFor(material, block);
      return [
        Object.freeze({
          turnIndex: 0,
          toolEventSequence,
          toolCallId: block.toolCallId,
          providerToolCallId: providerToolCallIdFor(block.toolCallId),
          toolId: block.toolId,
          providerToolName,
          arguments: argumentsValue,
          argumentsDigest: digestAgentCanonicalValue(argumentsValue),
          controlledResult: cloneJsonValue(block.result),
          resultDigest: block.resultDigest,
        }),
      ];
    })
  );
};

const normalizedReplayHistory = (
  material: AgentEvaluationInvocationMaterial,
  bindings: readonly AgentEvaluationProviderToolBinding[],
  history: readonly AgentEvaluationNormalizedTurnToolExchange[]
): readonly ReplayToolExchange[] => {
  if (material.blocks.some(({ kind }) => kind === 'tool-result')) {
    throw new TypeError(
      'Production evaluation turn history cannot consume fixture-synthetic tool results.'
    );
  }
  const tools = new Map(material.tools.map((tool) => [tool.toolId, tool]));
  const names = new Map(
    bindings.map(({ toolId, providerToolName }) => [toolId, providerToolName])
  );
  if (history.length > 10_000) {
    throw new TypeError('Evaluation turn history exceeds its frozen bound.');
  }
  let previousTurnIndex = -1;
  let previousToolEventSequence = -1;
  const toolCallIds = new Set<string>();
  const providerToolCallIds = new Set<string>();
  return Object.freeze(
    history.map((exchange) => {
      inspectJson(exchange, 'Evaluation normalized turn history');
      const tool = tools.get(exchange.toolId);
      const expectedProviderName = names.get(exchange.toolId);
      const continuationRefPresent =
        exchange.providerContinuationRef !== undefined ||
        exchange.providerContinuationRefDigest !== undefined;
      if (
        !hasExactNormalizedTurnHistoryKeys(exchange) ||
        !Number.isSafeInteger(exchange.turnIndex) ||
        exchange.turnIndex < 0 ||
        !Number.isSafeInteger(exchange.toolEventSequence) ||
        exchange.toolEventSequence < 0 ||
        exchange.turnIndex < previousTurnIndex ||
        (exchange.turnIndex === previousTurnIndex &&
          exchange.toolEventSequence <= previousToolEventSequence) ||
        !isAgentControlIdentity(exchange.toolCallId) ||
        !isAgentControlIdentity(exchange.providerToolCallId) ||
        toolCallIds.has(exchange.toolCallId) ||
        providerToolCallIds.has(exchange.providerToolCallId) ||
        !tool ||
        expectedProviderName !== exchange.providerToolName ||
        !isPlainObject(exchange.arguments) ||
        !matchesPortableSchemaValue(exchange.arguments, tool.inputSchema) ||
        digestAgentCanonicalValue(exchange.arguments) !==
          exchange.argumentsDigest ||
        digestAgentCanonicalValue(exchange.controlledResult) !==
          exchange.resultDigest ||
        !isAgentCanonicalDigest(exchange.priorResponseDigest) ||
        !isAgentCanonicalDigest(exchange.continuationReceiptDigest) ||
        continuationRefPresent !==
          (exchange.providerContinuationRef !== undefined &&
            exchange.providerContinuationRefDigest !== undefined) ||
        (exchange.providerContinuationRef !== undefined &&
          (!isAgentControlIdentity(exchange.providerContinuationRef) ||
            digestAgentCanonicalValue({
              providerContinuationRef: exchange.providerContinuationRef,
            }) !== exchange.providerContinuationRefDigest))
      ) {
        throw new TypeError(
          'Evaluation normalized turn history binding drifted.'
        );
      }
      previousTurnIndex = exchange.turnIndex;
      previousToolEventSequence = exchange.toolEventSequence;
      toolCallIds.add(exchange.toolCallId);
      providerToolCallIds.add(exchange.providerToolCallId);
      return Object.freeze({
        ...exchange,
        arguments: cloneJsonValue(
          exchange.arguments
        ) as AgentEvaluationJsonObject,
        controlledResult: cloneJsonValue(exchange.controlledResult),
      });
    })
  );
};

const toolResultBindingsFor = (
  history: readonly ReplayToolExchange[]
): readonly AgentEvaluationProviderToolResultBinding[] => {
  return Object.freeze(
    history.map((exchange) =>
      Object.freeze({
        toolCallId: exchange.toolCallId,
        providerToolCallId: exchange.providerToolCallId,
        toolId: exchange.toolId,
        providerToolName: exchange.providerToolName,
        argumentsDigest: exchange.argumentsDigest,
        resultDigest: exchange.resultDigest,
      })
    )
  );
};

const openAIInput = (
  material: AgentEvaluationInvocationMaterial,
  history: readonly ReplayToolExchange[]
): readonly AgentEvaluationJsonValue[] => {
  const input: AgentEvaluationJsonValue[] = [];
  const system = developerText(material);
  if (system.length > 0) {
    input.push(
      jsonObject({
        role: 'developer',
        content: jsonArray([jsonObject({ type: 'input_text', text: system })]),
      })
    );
  }
  const userContent: AgentEvaluationJsonValue[] = textAndContextInputs(
    material
  ).map((text) => jsonObject({ type: 'input_text', text }));
  for (const block of material.blocks) {
    if (block.kind !== 'image' && block.kind !== 'document') continue;
    assertSupportedMedia('openai-responses', block.kind, block.mediaType);
    userContent.push(
      jsonObject({ type: 'input_text', text: mediaMetadata(block) }),
      block.kind === 'image'
        ? jsonObject({
            type: 'input_image',
            image_url: `data:${block.mediaType};base64,${block.bytesBase64}`,
            detail: 'auto',
          })
        : jsonObject({
            type: 'input_file',
            filename: `document-${block.contentDigest.slice('sha256-'.length, 23)}.pdf`,
            file_data: `data:${block.mediaType};base64,${block.bytesBase64}`,
          })
    );
  }
  if (userContent.length === 0) {
    throw new TypeError('Evaluation invocation has no user data input.');
  }
  input.push(jsonObject({ role: 'user', content: jsonArray(userContent) }));
  for (const exchange of history) {
    input.push(
      jsonObject({
        type: 'function_call',
        call_id: exchange.providerToolCallId,
        name: exchange.providerToolName,
        arguments: canonicalJsonText(exchange.arguments),
      }),
      jsonObject({
        type: 'function_call_output',
        call_id: exchange.providerToolCallId,
        output: canonicalJsonText(exchange.controlledResult),
      })
    );
  }
  return Object.freeze(input);
};

const openAIBody = (
  material: AgentEvaluationInvocationMaterial,
  maximumOutputTokens: number,
  history: readonly ReplayToolExchange[],
  phase: AgentEvaluationInvocationToolPhase,
  domainToolChoice: 'auto' | 'required',
  allowParallelDomainToolCalls: boolean,
  omitProviderTools: boolean,
  resultContract?: AgentEvaluationCaseResultContract
): AgentEvaluationJsonObject =>
  jsonObject({
    input: openAIInput(material, history),
    max_output_tokens: maximumOutputTokens,
    ...(omitProviderTools
      ? {}
      : {
          tools: jsonArray([
            ...(phase === 'domain-tools'
              ? sortedTools(material).map((tool) =>
                  jsonObject({
                    type: 'function',
                    name: providerToolNameFor(tool.toolId),
                    description: toolDescription(tool),
                    parameters: cloneJsonValue(tool.inputSchema),
                    strict: false,
                  })
                )
              : []),
            ...(phase === 'result-submission' && resultContract
              ? [
                  jsonObject({
                    type: 'function',
                    name: resultContract.tool.nativeToolName,
                    description: resultToolDescription(resultContract),
                    parameters: cloneJsonValue(resultContract.tool.inputSchema),
                    strict: true,
                  }),
                ]
              : []),
          ]),
          ...(phase === 'result-submission' && resultContract
            ? {
                tool_choice: jsonObject({
                  type: 'function',
                  name: resultContract.tool.nativeToolName,
                }),
                parallel_tool_calls: false,
              }
            : {
                tool_choice: domainToolChoice,
                parallel_tool_calls: allowParallelDomainToolCalls,
              }),
        }),
  });

const anthropicBody = (
  material: AgentEvaluationInvocationMaterial,
  maximumOutputTokens: number,
  history: readonly ReplayToolExchange[],
  phase: AgentEvaluationInvocationToolPhase,
  domainToolChoice: 'auto' | 'required',
  allowParallelDomainToolCalls: boolean,
  omitProviderTools: boolean,
  resultContract?: AgentEvaluationCaseResultContract
): AgentEvaluationJsonObject => {
  const messages: AgentEvaluationJsonValue[] = [];
  const userContent: AgentEvaluationJsonValue[] = textAndContextInputs(
    material
  ).map((text) => jsonObject({ type: 'text', text }));
  for (const block of material.blocks) {
    if (block.kind !== 'image' && block.kind !== 'document') continue;
    assertSupportedMedia('anthropic-messages', block.kind, block.mediaType);
    userContent.push(
      jsonObject({ type: 'text', text: mediaMetadata(block) }),
      block.kind === 'image'
        ? jsonObject({
            type: 'image',
            source: jsonObject({
              type: 'base64',
              media_type: block.mediaType,
              data: block.bytesBase64,
            }),
          })
        : jsonObject({
            type: 'document',
            source: jsonObject({
              type: 'base64',
              media_type: block.mediaType,
              data: block.bytesBase64,
            }),
          })
    );
  }
  if (userContent.length === 0) {
    throw new TypeError('Evaluation invocation has no user data input.');
  }
  messages.push(jsonObject({ role: 'user', content: jsonArray(userContent) }));
  for (const exchange of history) {
    messages.push(
      jsonObject({
        role: 'assistant',
        content: jsonArray([
          jsonObject({
            type: 'tool_use',
            id: exchange.providerToolCallId,
            name: exchange.providerToolName,
            input: exchange.arguments,
          }),
        ]),
      }),
      jsonObject({
        role: 'user',
        content: jsonArray([
          jsonObject({
            type: 'tool_result',
            tool_use_id: exchange.providerToolCallId,
            content: canonicalJsonText(exchange.controlledResult),
          }),
        ]),
      })
    );
  }
  const system = developerText(material);
  return jsonObject({
    ...(system.length > 0 ? { system } : {}),
    messages: jsonArray(messages),
    max_tokens: maximumOutputTokens,
    ...(omitProviderTools
      ? {}
      : {
          tools: jsonArray([
            ...(phase === 'domain-tools'
              ? sortedTools(material).map((tool) =>
                  jsonObject({
                    name: providerToolNameFor(tool.toolId),
                    description: toolDescription(tool),
                    input_schema: cloneJsonValue(tool.inputSchema),
                  })
                )
              : []),
            ...(phase === 'result-submission' && resultContract
              ? [
                  jsonObject({
                    name: resultContract.tool.nativeToolName,
                    description: resultToolDescription(resultContract),
                    input_schema: cloneJsonValue(
                      resultContract.tool.inputSchema
                    ),
                  }),
                ]
              : []),
          ]),
          ...(phase === 'result-submission' && resultContract
            ? {
                tool_choice: jsonObject({
                  type: 'tool',
                  name: resultContract.tool.nativeToolName,
                  disable_parallel_tool_use: true,
                }),
              }
            : {
                tool_choice: jsonObject({
                  type: domainToolChoice === 'required' ? 'any' : 'auto',
                  disable_parallel_tool_use: !allowParallelDomainToolCalls,
                }),
              }),
        }),
  });
};

const geminiBody = (
  material: AgentEvaluationInvocationMaterial,
  maximumOutputTokens: number,
  history: readonly ReplayToolExchange[],
  phase: AgentEvaluationInvocationToolPhase,
  domainToolChoice: 'auto' | 'required',
  omitProviderTools: boolean,
  resultContract?: AgentEvaluationCaseResultContract
): AgentEvaluationJsonObject => {
  const steps: AgentEvaluationJsonValue[] = [];
  const userContent: AgentEvaluationJsonValue[] = textAndContextInputs(
    material
  ).map((text) => jsonObject({ type: 'text', text }));
  for (const block of material.blocks) {
    if (block.kind !== 'image' && block.kind !== 'document') continue;
    assertSupportedMedia('gemini-interactions', block.kind, block.mediaType);
    userContent.push(
      jsonObject({ type: 'text', text: mediaMetadata(block) }),
      jsonObject({
        type: block.kind,
        mime_type: block.mediaType,
        data: block.bytesBase64,
      })
    );
  }
  if (userContent.length === 0) {
    throw new TypeError('Evaluation invocation has no user data input.');
  }
  steps.push(
    jsonObject({ type: 'user_input', content: jsonArray(userContent) })
  );
  for (const exchange of history) {
    steps.push(
      jsonObject({
        type: 'function_call',
        id: exchange.providerToolCallId,
        name: exchange.providerToolName,
        arguments: exchange.arguments,
      }),
      jsonObject({
        type: 'function_result',
        call_id: exchange.providerToolCallId,
        name: exchange.providerToolName,
        result: jsonArray([
          jsonObject({
            type: 'text',
            text: canonicalJsonText(exchange.controlledResult),
          }),
        ]),
      })
    );
  }
  const system = developerText(material);
  return jsonObject({
    input: jsonArray(steps),
    ...(system.length > 0 ? { system_instruction: system } : {}),
    generation_config: jsonObject({
      max_output_tokens: maximumOutputTokens,
      ...(omitProviderTools
        ? {}
        : {
            tool_choice: jsonObject({
              allowed_tools: jsonObject({
                mode:
                  phase === 'result-submission' ||
                  domainToolChoice === 'required'
                    ? 'any'
                    : 'auto',
                tools: jsonArray(
                  phase === 'result-submission' && resultContract
                    ? [resultContract.tool.nativeToolName]
                    : sortedTools(material).map(({ toolId }) =>
                        providerToolNameFor(toolId)
                      )
                ),
              }),
            }),
          }),
    }),
    ...(omitProviderTools
      ? {}
      : {
          tools: jsonArray([
            ...(phase === 'domain-tools'
              ? sortedTools(material).map((tool) =>
                  jsonObject({
                    type: 'function',
                    name: providerToolNameFor(tool.toolId),
                    description: toolDescription(tool),
                    parameters: cloneJsonValue(tool.inputSchema),
                  })
                )
              : []),
            ...(phase === 'result-submission' && resultContract
              ? [
                  jsonObject({
                    type: 'function',
                    name: resultContract.tool.nativeToolName,
                    description: resultToolDescription(resultContract),
                    parameters: cloneJsonValue(resultContract.tool.inputSchema),
                  }),
                ]
              : []),
          ]),
        }),
  });
};

const encodeAgentEvaluationInvocationPayload = (
  protocolFamily: AgentEvaluationInvocationPayloadProtocol,
  material: AgentEvaluationInvocationMaterial,
  options: AgentEvaluationInvocationPayloadCodecOptions,
  resultContract?: AgentEvaluationCaseResultContract,
  turnPolicy?: AgentEvaluationCaseTurnInvocationPayloadOptions
): AgentEvaluationEncodedInvocationPayload => {
  const bootstrapInvocation =
    turnPolicy?.capabilityEffectBootstrapInvocationMaterial;
  assertInvocationMaterial(material, bootstrapInvocation !== undefined);
  if (
    resultContract &&
    material.tools.some(
      ({ toolId }) => toolId === AGENT_EVALUATION_RESULT_SUBMIT_TOOL_ID
    )
  ) {
    throw new TypeError(
      'Evaluation invocation collides with the reserved result-submit tool.'
    );
  }
  const maximumOutputTokens = assertBoundedPositiveInteger(
    options.maximumOutputTokens,
    defaultMaximumOutputTokens,
    maximumConfiguredOutputTokens,
    'Evaluation maximum output tokens'
  );
  const timeoutMs =
    options.timeoutMs === undefined
      ? undefined
      : assertBoundedPositiveInteger(
          options.timeoutMs,
          options.timeoutMs,
          maximumConfiguredTimeoutMs,
          'Evaluation provider timeout'
        );
  const maximumResponseBytes =
    options.maximumResponseBytes === undefined
      ? undefined
      : assertBoundedPositiveInteger(
          options.maximumResponseBytes,
          options.maximumResponseBytes,
          maximumConfiguredResponseBytes,
          'Evaluation maximum response bytes'
        );
  const allToolBindings = toolBindingsFor(material, resultContract);
  if (
    new Set(allToolBindings.map(({ providerToolName }) => providerToolName))
      .size !== allToolBindings.length
  ) {
    throw new TypeError('Evaluation provider tool-name binding collided.');
  }
  const phase =
    turnPolicy?.phase ??
    (resultContract ? 'result-submission' : 'domain-tools');
  const domainToolChoice = turnPolicy?.domainToolChoice ?? 'auto';
  const allowParallelDomainToolCalls =
    turnPolicy?.allowParallelDomainToolCalls ?? false;
  const omitProviderTools = bootstrapInvocation !== undefined;
  const toolBindings = turnPolicy
    ? Object.freeze(
        allToolBindings.filter(({ toolId }) =>
          phase === 'result-submission'
            ? toolId === AGENT_EVALUATION_RESULT_SUBMIT_TOOL_ID
            : toolId !== AGENT_EVALUATION_RESULT_SUBMIT_TOOL_ID
        )
      )
    : allToolBindings;
  const replayHistory = turnPolicy
    ? normalizedReplayHistory(material, allToolBindings, turnPolicy.turnHistory)
    : fixtureReplayHistoryFor(material, allToolBindings);
  const toolResultBindings = toolResultBindingsFor(replayHistory);
  const resultToolBinding =
    resultContract && phase === 'result-submission'
      ? resultToolBindingFor(resultContract)
      : undefined;
  const turnHistoryDigest = turnPolicy
    ? digestAgentCanonicalValue(turnPolicy.turnHistory)
    : undefined;
  const body = (() => {
    switch (protocolFamily) {
      case 'openai-responses':
        return openAIBody(
          material,
          maximumOutputTokens,
          replayHistory,
          phase,
          domainToolChoice,
          allowParallelDomainToolCalls,
          omitProviderTools,
          resultContract
        );
      case 'anthropic-messages':
        return anthropicBody(
          material,
          maximumOutputTokens,
          replayHistory,
          phase,
          domainToolChoice,
          allowParallelDomainToolCalls,
          omitProviderTools,
          resultContract
        );
      case 'gemini-interactions':
        return geminiBody(
          material,
          maximumOutputTokens,
          replayHistory,
          phase,
          domainToolChoice,
          omitProviderTools,
          resultContract
        );
    }
  })();
  inspectJson(body, 'Evaluation provider payload');
  const payload = Object.freeze({
    body,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    ...(maximumResponseBytes === undefined ? {} : { maximumResponseBytes }),
  });
  const base = Object.freeze({
    format: 'prodivix.agent-evaluation-invocation-payload' as const,
    version: 1 as const,
    protocolFamily,
    payload,
    toolBindings,
    toolResultBindings,
    ...(resultToolBinding ? { resultToolBinding } : {}),
    ...(turnHistoryDigest ? { turnHistoryDigest } : {}),
  });
  return Object.freeze({
    protocolFamily,
    payload,
    toolBindings,
    toolResultBindings,
    ...(resultToolBinding ? { resultToolBinding } : {}),
    ...(turnHistoryDigest ? { turnHistoryDigest } : {}),
    payloadDigest: digestAgentCanonicalValue(base),
  });
};

/** Encodes one case-bound request with a forced typed terminal submission. */
export const createAgentEvaluationCaseInvocationPayload = (
  protocolFamily: AgentEvaluationInvocationPayloadProtocol,
  material: AgentEvaluationCaseMaterial,
  options: AgentEvaluationInvocationPayloadCodecOptions = {}
): AgentEvaluationCaseEncodedInvocationPayload => {
  assertCaseMaterialBinding(material);
  const resultContract = createAgentEvaluationCaseResultContract(material);
  return encodeAgentEvaluationInvocationPayload(
    protocolFamily,
    material.invocation,
    options,
    resultContract
  ) as AgentEvaluationCaseEncodedInvocationPayload;
};

/**
 * Production multi-turn codec. Domain turns expose only frozen domain tools;
 * the terminal phase exposes only the case-bound result submission tool.
 */
export const createAgentEvaluationCaseTurnInvocationPayload = (
  protocolFamily: AgentEvaluationInvocationPayloadProtocol,
  material: AgentEvaluationCaseMaterial,
  options: AgentEvaluationCaseTurnInvocationPayloadOptions
): AgentEvaluationEncodedInvocationPayload => {
  assertCaseMaterialBinding(material);
  const resultContract = createAgentEvaluationCaseResultContract(material);
  const requestRefAuthorities =
    options.capabilityEffectRequestRefAuthorities ?? Object.freeze([]);
  const bootstrapInvocation =
    options.capabilityEffectBootstrapInvocationMaterial;
  if (
    options.phase !== 'domain-tools' &&
    (requestRefAuthorities.length > 0 || bootstrapInvocation !== undefined)
  ) {
    throw new TypeError(
      'Capability effect invocation authority is unavailable during result submission.'
    );
  }
  if (
    bootstrapInvocation &&
    (requestRefAuthorities.length > 0 ||
      options.turnHistory.length > 0 ||
      !isAgentEvaluationCapabilityEffectBootstrapInvocationAuthority(
        bootstrapInvocation.authority
      ) ||
      bootstrapInvocation.authority.sourceInvocationMaterialDigest !==
        digestAgentCanonicalValue(material.invocation) ||
      bootstrapInvocation.authority.specializedInvocationMaterialDigest !==
        digestAgentCanonicalValue(bootstrapInvocation.invocation) ||
      !sameCanonicalJson(
        bootstrapInvocation.authority.omittedToolIds,
        material.invocation.tools.map(({ toolId }) => toolId)
      ) ||
      !sameCanonicalJson(
        bootstrapInvocation.invocation.blocks,
        material.invocation.blocks
      ) ||
      !sameCanonicalJson(
        bootstrapInvocation.invocation.contextItems,
        material.invocation.contextItems
      ) ||
      bootstrapInvocation.invocation.tools.length !== 0)
  ) {
    throw new TypeError(
      'Capability effect bootstrap invocation material drifted.'
    );
  }
  const invocationMaterial = bootstrapInvocation
    ? bootstrapInvocation.invocation
    : requestRefAuthorities.length === 0
      ? material.invocation
      : Object.freeze({
          ...material.invocation,
          tools: specializeAgentEvaluationCapabilityEffectToolSchemas(
            material.invocation.tools,
            requestRefAuthorities
          ),
        });
  return encodeAgentEvaluationInvocationPayload(
    protocolFamily,
    invocationMaterial,
    options,
    resultContract,
    options
  );
};

export const digestAgentEvaluationInvocationPayload = (
  value: Omit<AgentEvaluationEncodedInvocationPayload, 'payloadDigest'>
): CanonicalDigest =>
  digestAgentCanonicalValue({
    format: 'prodivix.agent-evaluation-invocation-payload',
    version: 1,
    protocolFamily: value.protocolFamily,
    payload: value.payload,
    toolBindings: value.toolBindings,
    toolResultBindings: value.toolResultBindings,
    ...(value.resultToolBinding
      ? { resultToolBinding: value.resultToolBinding }
      : {}),
    ...(value.turnHistoryDigest
      ? { turnHistoryDigest: value.turnHistoryDigest }
      : {}),
  });

export const bindAgentEvaluationCapabilityRuntimeRequestMaterial = (
  encodedPayload: AgentEvaluationEncodedInvocationPayload,
  material: AgentNativeProviderCapabilityRuntimeRequestMaterial
): AgentEvaluationEncodedInvocationPayload => {
  if (
    encodedPayload.payload.capabilityRuntimeRequestMaterial !== undefined ||
    !isAgentNativeProviderCapabilityRuntimeRequestProjectionSelf(
      material.projection
    ) ||
    material.projection.protocolFamily !== encodedPayload.protocolFamily ||
    material.callbackLocalBody === null ||
    !isPlainObject(material.callbackLocalBody) ||
    digestAgentCanonicalValue({ path: material.callbackLocalPath }) !==
      material.projection.pathDigest ||
    digestAgentCanonicalValue({ body: material.callbackLocalBody }) !==
      material.projection.requestBodyDigest
  ) {
    throw new TypeError(
      'Evaluation capability runtime request material drifted.'
    );
  }
  const payload = Object.freeze({
    ...encodedPayload.payload,
    capabilityRuntimeRequestMaterial: material,
  });
  const unsigned = Object.freeze({
    protocolFamily: encodedPayload.protocolFamily,
    payload,
    toolBindings: encodedPayload.toolBindings,
    toolResultBindings: encodedPayload.toolResultBindings,
    ...(encodedPayload.resultToolBinding
      ? { resultToolBinding: encodedPayload.resultToolBinding }
      : {}),
    ...(encodedPayload.turnHistoryDigest
      ? { turnHistoryDigest: encodedPayload.turnHistoryDigest }
      : {}),
  });
  return Object.freeze({
    ...unsigned,
    payloadDigest: digestAgentEvaluationInvocationPayload(unsigned),
  });
};

const invocationKey = (invocationId: string, requestDigest: string): string =>
  `${invocationId}\u0000${requestDigest}`;

type ActivePayloadLease = {
  readonly protocolFamily: AgentEvaluationInvocationPayloadProtocol;
  readonly invocation: AgentProviderAdapterInvocationRequest;
  readonly encodedPayload: AgentEvaluationEncodedInvocationPayload;
  readonly protectedLeakCanaries?: readonly string[];
  readonly resultSpoolAuthority?: NonNullable<
    AgentEvaluationProviderPayload['resultSpoolAuthority']
  >;
  consumed: boolean;
  invalidated: boolean;
};

/**
 * Makes one plaintext provider payload available to the matching native
 * transport exactly once, then revokes it on every callback exit.
 */
export class CallbackBoundAgentEvaluationInvocationPayloadRegistry {
  readonly #active = new Map<string, ActivePayloadLease>();
  readonly #used = new Set<string>();

  async use<TResult>(
    lease: AgentEvaluationInvocationPayloadLease,
    callback: () => TResult | Promise<TResult>
  ): Promise<TResult> {
    if (
      lease.encodedPayload.protocolFamily !== lease.protocolFamily ||
      digestAgentEvaluationInvocationPayload(lease.encodedPayload) !==
        lease.encodedPayload.payloadDigest ||
      !isAgentCanonicalDigest(lease.invocation.requestDigest)
    ) {
      throw new TypeError('Evaluation invocation payload lease drifted.');
    }
    const key = invocationKey(
      lease.invocation.invocationId,
      lease.invocation.requestDigest
    );
    if (this.#active.has(key) || this.#used.has(key)) {
      throw new Error('Evaluation invocation payload lease was replayed.');
    }
    const active: ActivePayloadLease = {
      protocolFamily: lease.protocolFamily,
      invocation: lease.invocation,
      encodedPayload: lease.encodedPayload,
      ...(lease.protectedLeakCanaries
        ? {
            protectedLeakCanaries: Object.freeze([
              ...lease.protectedLeakCanaries,
            ]),
          }
        : {}),
      ...(lease.resultSpoolAuthority
        ? { resultSpoolAuthority: lease.resultSpoolAuthority }
        : {}),
      consumed: false,
      invalidated: false,
    };
    this.#active.set(key, active);
    this.#used.add(key);
    try {
      const result = await callback();
      if (!active.consumed || active.invalidated) {
        throw new Error(
          'Evaluation invocation payload was not consumed by its exact transport.'
        );
      }
      if (
        lease.protectedLeakCanaries &&
        lease.protectedLeakCanaries.length > 0 &&
        scanAgentArtifactForProtectedHoldoutLeak(
          result,
          lease.protectedLeakCanaries
        ).length > 0
      ) {
        throw new Error(
          'Evaluation invocation payload callback failed the no-leak invariant.'
        );
      }
      return result;
    } finally {
      this.#active.delete(key);
    }
  }

  resolveOnce(
    request: AgentNativeProviderTransportRequest
  ): AgentEvaluationProviderPayload {
    const key = invocationKey(
      request.invocation.invocationId,
      request.invocation.requestDigest
    );
    const active = this.#active.get(key);
    if (!active) {
      const sameInvocation = [...this.#active.entries()].find(
        ([, lease]) =>
          lease.invocation.invocationId === request.invocation.invocationId
      );
      if (sameInvocation) {
        sameInvocation[1].invalidated = true;
        sameInvocation[1].consumed = true;
        this.#active.delete(sameInvocation[0]);
      }
      throw new Error(
        'Evaluation invocation payload request is absent, mismatched, or replayed.'
      );
    }
    this.#active.delete(key);
    active.consumed = true;
    if (
      request.protocolFamily !== active.protocolFamily ||
      !sameCanonicalJson(request.invocation, active.invocation)
    ) {
      active.invalidated = true;
      throw new Error('Evaluation invocation payload cross-binding failed.');
    }
    return Object.freeze({
      ...active.encodedPayload.payload,
      ...(active.protectedLeakCanaries
        ? { protectedLeakCanaries: active.protectedLeakCanaries }
        : {}),
      ...(active.resultSpoolAuthority
        ? { resultSpoolAuthority: active.resultSpoolAuthority }
        : {}),
    });
  }
}
