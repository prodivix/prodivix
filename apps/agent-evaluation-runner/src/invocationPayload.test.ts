import {
  AGENT_EVALUATION_RESULT_SUBMISSION_SCHEMA_DIGEST,
  AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME,
  AGENT_EVALUATION_RESULT_SUBMIT_TOOL_ID,
  getG4V8PublicEvaluationCaseMaterials,
  createAgentEvaluationCaseResultContract,
  createAgentEvaluationCapabilityEffectBootstrapInvocationMaterial,
  createAgentEvaluationCapabilityEffectRequestRefIssuanceDecision,
  digestAgentCanonicalValue,
  digestAgentEvaluationInlinePayload,
  type AgentEvaluationCaseMaterial,
  type AgentNativeProviderTransportRequest,
  type AgentProviderAdapterInvocationRequest,
} from '@prodivix/ai';
import { isPlainObject } from '@prodivix/shared/safety';
import { describe, expect, it } from 'vitest';
import {
  CallbackBoundAgentEvaluationInvocationPayloadRegistry,
  createAgentEvaluationCaseInvocationPayload,
  createAgentEvaluationCaseTurnInvocationPayload,
  type AgentEvaluationNormalizedTurnToolExchange,
  type AgentEvaluationInvocationPayloadProtocol,
} from './invocationPayload';

const invocationRequest = (): AgentProviderAdapterInvocationRequest =>
  Object.freeze({
    invocationId: 'evaluation-invocation.payload-test.1',
    requestDigest: digestAgentCanonicalValue('request'),
    providerConfigurationId: 'provider.payload-test',
    modelLineageDigest: digestAgentCanonicalValue('model'),
    capabilityProfileDigest: digestAgentCanonicalValue('capability'),
    inferenceConfigurationDigest: digestAgentCanonicalValue('inference'),
    contextPackDigest: digestAgentCanonicalValue('context'),
  });

const materialFor = (
  capabilityProfileId?: string
): AgentEvaluationCaseMaterial => {
  const material = getG4V8PublicEvaluationCaseMaterials().find((candidate) =>
    capabilityProfileId === undefined
      ? candidate.invocation.blocks.some(({ kind }) => kind === 'tool-result')
      : candidate.capabilityProfileId === capabilityProfileId
  );
  if (!material) throw new Error('Expected public corpus material is missing.');
  return withValidSyntheticToolResult(material);
};

const protocolRequest = (
  protocolFamily: AgentEvaluationInvocationPayloadProtocol,
  invocation = invocationRequest()
): AgentNativeProviderTransportRequest =>
  Object.freeze({ protocolFamily, invocation });

const withInvocation = (
  material: AgentEvaluationCaseMaterial,
  invocation: AgentEvaluationCaseMaterial['invocation']
): AgentEvaluationCaseMaterial => {
  const { materialDigest: _, ...base } = material;
  const nextBase = Object.freeze({ ...base, invocation });
  return Object.freeze({
    ...nextBase,
    materialDigest: digestAgentCanonicalValue(nextBase),
  });
};

function withValidSyntheticToolResult(
  material: AgentEvaluationCaseMaterial
): AgentEvaluationCaseMaterial {
  const tool = material.invocation.tools.find(
    ({ toolId }) => toolId === 'workspace.inspect'
  );
  if (!tool || !isPlainObject(tool.inputSchema)) {
    throw new TypeError('Expected workspace inspection tool schema.');
  }
  const schema = tool.inputSchema;
  if (!Array.isArray(schema.required) || !isPlainObject(schema.properties)) {
    throw new TypeError('Expected exact workspace inspection input schema.');
  }
  const result = Object.freeze(
    Object.fromEntries(
      schema.required.map((key) => {
        if (typeof key !== 'string') {
          throw new TypeError('Expected string tool schema key.');
        }
        const property = (schema.properties as Record<string, unknown>)[key];
        if (!isPlainObject(property) || typeof property.const !== 'string') {
          throw new TypeError('Expected frozen workspace inspection value.');
        }
        return [key, property.const];
      })
    )
  );
  return withInvocation(
    material,
    Object.freeze({
      ...material.invocation,
      blocks: Object.freeze([
        ...material.invocation.blocks.filter(
          ({ kind }) => kind !== 'tool-result'
        ),
        Object.freeze({
          kind: 'tool-result' as const,
          blockId: `block.${material.caseId}.test-tool-result`,
          authority: 'canonical-workspace' as const,
          instructionBoundary: 'data-only' as const,
          toolCallId: `call.${material.caseId}.test-tool-result`,
          toolId: tool.toolId,
          result,
          resultDigest: digestAgentCanonicalValue(result),
        }),
      ]),
    })
  );
}

const withoutSyntheticToolResults = (
  material: AgentEvaluationCaseMaterial
): AgentEvaluationCaseMaterial =>
  withInvocation(
    material,
    Object.freeze({
      ...material.invocation,
      blocks: Object.freeze(
        material.invocation.blocks.filter(({ kind }) => kind !== 'tool-result')
      ),
    })
  );

describe('production invocation payload codec', () => {
  it.each([
    'openai-responses',
    'anthropic-messages',
    'gemini-interactions',
  ] as const)(
    'maps text, Context, tool definitions, and tool results to %s',
    (protocolFamily) => {
      const material = materialFor();
      const contract = createAgentEvaluationCaseResultContract(material);
      const encoded = createAgentEvaluationCaseInvocationPayload(
        protocolFamily,
        material
      );
      expect(encoded).toMatchObject({
        protocolFamily,
        payloadDigest: expect.stringMatching(/^sha256-/u),
        toolBindings: expect.arrayContaining([
          expect.objectContaining({
            toolId: 'workspace.inspect',
            providerToolName: expect.stringMatching(/^tool_[a-f0-9]+$/u),
          }),
          {
            toolId: AGENT_EVALUATION_RESULT_SUBMIT_TOOL_ID,
            providerToolName: AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME,
            definitionDigest: contract.tool.toolDefinitionDigest,
          },
        ]),
        toolResultBindings: [
          expect.objectContaining({
            toolId: 'workspace.inspect',
            providerToolCallId: expect.stringMatching(/^call_[a-f0-9]+$/u),
          }),
        ],
        resultToolBinding: {
          toolId: AGENT_EVALUATION_RESULT_SUBMIT_TOOL_ID,
          providerToolName: AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME,
          schemaDigest: AGENT_EVALUATION_RESULT_SUBMISSION_SCHEMA_DIGEST,
          inputSchemaDigest: contract.tool.inputSchemaDigest,
          toolDefinitionDigest: contract.tool.toolDefinitionDigest,
          caseId: material.caseId,
          caseDigest: material.caseDigest,
          materialDigest: material.materialDigest,
          contractDigest: contract.contractDigest,
        },
      });
      const bodyText = JSON.stringify(encoded.payload.body);
      expect(bodyText).toContain('prodivix.agent-evaluation-data');
      expect(bodyText).toContain(material.invocation.contextItems[0]!.content);
      expect(bodyText).toContain(
        encoded.toolBindings.find(
          ({ toolId }) => toolId === 'workspace.inspect'
        )!.providerToolName
      );
      switch (protocolFamily) {
        case 'openai-responses':
          expect(encoded.payload.body).toMatchObject({
            input: expect.arrayContaining([
              expect.objectContaining({ type: 'function_call_output' }),
              expect.objectContaining({ role: 'user' }),
            ]),
            max_output_tokens: 4_096,
            tools: expect.arrayContaining([
              expect.objectContaining({
                type: 'function',
                name: AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME,
                strict: true,
              }),
            ]),
            tool_choice: {
              type: 'function',
              name: AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME,
            },
            parallel_tool_calls: false,
          });
          break;
        case 'anthropic-messages':
          expect(encoded.payload.body).toMatchObject({
            system: expect.any(String),
            max_tokens: 4_096,
            messages: expect.arrayContaining([
              expect.objectContaining({ role: 'assistant' }),
              expect.objectContaining({ role: 'user' }),
            ]),
            tools: expect.arrayContaining([
              expect.objectContaining({ input_schema: expect.any(Object) }),
              expect.objectContaining({
                name: AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME,
              }),
            ]),
            tool_choice: {
              type: 'tool',
              name: AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME,
              disable_parallel_tool_use: true,
            },
          });
          break;
        case 'gemini-interactions':
          expect(encoded.payload.body).toMatchObject({
            system_instruction: expect.any(String),
            input: expect.arrayContaining([
              expect.objectContaining({ type: 'function_call' }),
              expect.objectContaining({ type: 'function_result' }),
              expect.objectContaining({ type: 'user_input' }),
            ]),
            generation_config: {
              max_output_tokens: 4_096,
              tool_choice: {
                allowed_tools: {
                  mode: 'any',
                  tools: [AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME],
                },
              },
            },
            tools: expect.arrayContaining([
              expect.objectContaining({ type: 'function' }),
              expect.objectContaining({
                type: 'function',
                name: AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME,
              }),
            ]),
          });
          break;
      }
    },
    15_000
  );

  it.each([
    'openai-responses',
    'anthropic-messages',
    'gemini-interactions',
  ] as const)(
    'places user data and media before synthetic tool history for %s',
    (protocolFamily) => {
      const material = materialFor('g4-visual-input');
      const encoded = createAgentEvaluationCaseInvocationPayload(
        protocolFamily,
        material
      );
      const historicalResult = material.invocation.blocks.find(
        (block) => block.kind === 'tool-result'
      );
      if (
        !historicalResult ||
        historicalResult.kind !== 'tool-result' ||
        typeof historicalResult.result !== 'object' ||
        historicalResult.result === null ||
        Array.isArray(historicalResult.result)
      ) {
        throw new Error('Historical tool result is missing.');
      }
      const historicalResultRecord = historicalResult.result as Readonly<
        Record<string, unknown>
      >;
      const historicalTool = material.invocation.tools.find(
        ({ toolId }) => toolId === historicalResult.toolId
      );
      if (
        !historicalTool ||
        !isPlainObject(historicalTool.inputSchema) ||
        !Array.isArray(historicalTool.inputSchema.required)
      ) {
        throw new TypeError('Historical tool input schema is missing.');
      }
      const expectedArguments = Object.fromEntries(
        historicalTool.inputSchema.required.map((key) => {
          if (typeof key !== 'string') {
            throw new TypeError('Historical tool input schema key drifted.');
          }
          return [key, historicalResultRecord[key]];
        })
      );
      if (protocolFamily === 'openai-responses') {
        const input = encoded.payload.body.input as readonly Record<
          string,
          unknown
        >[];
        expect(
          input.findIndex(({ role }) => role === 'user')
        ).toBeGreaterThanOrEqual(0);
        expect(input.findIndex(({ role }) => role === 'user')).toBeLessThan(
          input.findIndex(({ type }) => type === 'function_call')
        );
        expect(
          JSON.parse(
            input.find(({ type }) => type === 'function_call')!
              .arguments as string
          )
        ).toEqual(expectedArguments);
        return;
      }
      if (protocolFamily === 'anthropic-messages') {
        const messages = encoded.payload.body.messages as readonly Record<
          string,
          unknown
        >[];
        expect(messages[0]).toMatchObject({ role: 'user' });
        expect(messages[1]).toMatchObject({ role: 'assistant' });
        expect(messages[2]).toMatchObject({ role: 'user' });
        expect(messages[1]).toMatchObject({
          content: [expect.objectContaining({ input: expectedArguments })],
        });
        return;
      }
      const input = encoded.payload.body.input as readonly Record<
        string,
        unknown
      >[];
      expect(input.map(({ type }) => type)).toEqual([
        'user_input',
        'function_call',
        'function_result',
      ]);
      expect(input[1]).toMatchObject({ arguments: expectedArguments });
    }
  );

  it.each([
    'openai-responses',
    'anthropic-messages',
    'gemini-interactions',
  ] as const)(
    'omits every Provider tool field for a sealed turn-zero bootstrap on %s',
    (protocolFamily) => {
      const material = withoutSyntheticToolResults(
        materialFor('g4-provider-background-job')
      );
      const decision =
        createAgentEvaluationCapabilityEffectRequestRefIssuanceDecision({
          bindingKind: 'provider-job',
          turnIndex: 0,
          priorSourceTurnIndex: null,
          priorSourceObservationReceiptDigest: null,
          priorSourceDisposition: null,
          priorEffectResultSealReceiptDigest: null,
        });
      const bootstrapInvocation =
        createAgentEvaluationCapabilityEffectBootstrapInvocationMaterial({
          invocation: material.invocation,
          decision,
        });
      const encoded = createAgentEvaluationCaseTurnInvocationPayload(
        protocolFamily,
        material,
        {
          phase: 'domain-tools',
          domainToolChoice: 'required',
          allowParallelDomainToolCalls: false,
          turnHistory: Object.freeze([]),
          capabilityEffectBootstrapInvocationMaterial: bootstrapInvocation,
        }
      );
      const body = encoded.payload.body;
      expect(encoded.toolBindings).toEqual([]);
      expect(Object.hasOwn(body, 'tools')).toBe(false);
      expect(Object.hasOwn(body, 'tool_choice')).toBe(false);
      expect(Object.hasOwn(body, 'parallel_tool_calls')).toBe(false);
      if (protocolFamily === 'gemini-interactions') {
        expect(body.generation_config).toEqual({
          max_output_tokens: 4_096,
        });
      }

      expect(() =>
        createAgentEvaluationCaseTurnInvocationPayload(
          protocolFamily,
          material,
          {
            phase: 'domain-tools',
            domainToolChoice: 'required',
            allowParallelDomainToolCalls: false,
            turnHistory: Object.freeze([]),
            capabilityEffectRequestRefAuthorities: Object.freeze([]),
            capabilityEffectBootstrapInvocationMaterial: Object.freeze({
              ...bootstrapInvocation,
              authority: Object.freeze({
                ...bootstrapInvocation.authority,
                sourceInvocationMaterialDigest:
                  digestAgentCanonicalValue('drifted-source'),
              }),
            }),
          }
        )
      ).toThrow(/bootstrap invocation material drifted/u);
    }
  );

  it('uses one case-bound result schema and digest across all protocols', () => {
    const material = materialFor();
    const contract = createAgentEvaluationCaseResultContract(material);
    const encodings = (
      ['openai-responses', 'anthropic-messages', 'gemini-interactions'] as const
    ).map((protocolFamily) =>
      createAgentEvaluationCaseInvocationPayload(protocolFamily, material)
    );
    expect(encodings.map(({ resultToolBinding }) => resultToolBinding)).toEqual(
      [
        encodings[0]!.resultToolBinding,
        encodings[0]!.resultToolBinding,
        encodings[0]!.resultToolBinding,
      ]
    );
    const schemas = encodings.map(({ payload: { body } }, index) => {
      const tools = body.tools as readonly Record<string, unknown>[];
      const resultTool = tools.find(
        ({ name }) => name === AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME
      );
      if (!resultTool) throw new Error(`Result tool ${index} is missing.`);
      return (resultTool.parameters ?? resultTool.input_schema) as Record<
        string,
        unknown
      >;
    });
    expect(schemas.map((schema) => digestAgentCanonicalValue(schema))).toEqual([
      contract.tool.inputSchemaDigest,
      contract.tool.inputSchemaDigest,
      contract.tool.inputSchemaDigest,
    ]);
  });

  it.each([
    'openai-responses',
    'anthropic-messages',
    'gemini-interactions',
  ] as const)(
    'separates domain-tool and terminal result-submission phases for %s',
    (protocolFamily) => {
      const material = withoutSyntheticToolResults(materialFor());
      const domain = createAgentEvaluationCaseTurnInvocationPayload(
        protocolFamily,
        material,
        {
          phase: 'domain-tools',
          domainToolChoice: 'required',
          allowParallelDomainToolCalls: false,
          turnHistory: Object.freeze([]),
        }
      );
      const terminal = createAgentEvaluationCaseTurnInvocationPayload(
        protocolFamily,
        material,
        {
          phase: 'result-submission',
          domainToolChoice: 'auto',
          allowParallelDomainToolCalls: true,
          turnHistory: Object.freeze([]),
        }
      );
      const domainBody = JSON.stringify(domain.payload.body);
      const terminalBody = JSON.stringify(terminal.payload.body);
      expect(domainBody).toContain(
        domain.toolBindings.find(
          ({ toolId }) => toolId === 'workspace.inspect'
        )!.providerToolName
      );
      expect(domainBody).not.toContain(
        AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME
      );
      expect(domain.resultToolBinding).toBeUndefined();
      expect(terminalBody).toContain(
        AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME
      );
      for (const binding of terminal.toolBindings) {
        if (binding.toolId === AGENT_EVALUATION_RESULT_SUBMIT_TOOL_ID) continue;
        expect(terminalBody).not.toContain(binding.providerToolName);
      }
      expect(terminal.resultToolBinding).toMatchObject({
        toolId: AGENT_EVALUATION_RESULT_SUBMIT_TOOL_ID,
      });

      if (protocolFamily === 'openai-responses') {
        expect(domain.payload.body).toMatchObject({
          tool_choice: 'required',
          parallel_tool_calls: false,
        });
        expect(terminal.payload.body).toMatchObject({
          tool_choice: {
            type: 'function',
            name: AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME,
          },
          parallel_tool_calls: false,
        });
      } else if (protocolFamily === 'anthropic-messages') {
        expect(domain.payload.body).toMatchObject({
          tool_choice: { type: 'any', disable_parallel_tool_use: true },
        });
        expect(terminal.payload.body).toMatchObject({
          tool_choice: {
            type: 'tool',
            name: AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME,
            disable_parallel_tool_use: true,
          },
        });
      } else {
        expect(domain.payload.body).toMatchObject({
          generation_config: {
            tool_choice: { allowed_tools: { mode: 'any' } },
          },
        });
        expect(terminal.payload.body).toMatchObject({
          generation_config: {
            tool_choice: {
              allowed_tools: {
                mode: 'any',
                tools: [AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME],
              },
            },
          },
        });
      }
    }
  );

  it.each([
    'openai-responses',
    'anthropic-messages',
    'gemini-interactions',
  ] as const)(
    'replays exact canonical tool arguments and controlled results for %s',
    (protocolFamily) => {
      const original = withoutSyntheticToolResults(materialFor());
      const inspectTool = original.invocation.tools.find(
        ({ toolId }) => toolId === 'workspace.inspect'
      );
      if (!inspectTool || typeof inspectTool.inputSchema !== 'object') {
        throw new Error('workspace.inspect input schema is missing.');
      }
      const schema = inspectTool.inputSchema as Readonly<{
        type: string;
        additionalProperties: boolean;
        required: readonly string[];
        properties: Readonly<Record<string, unknown>>;
      }>;
      const extendedSchema = Object.freeze({
        ...schema,
        properties: Object.freeze({
          ...schema.properties,
          detailLevel: Object.freeze({ type: 'string' }),
        }),
      });
      const toolBase = Object.freeze({
        ...inspectTool,
        inputSchema: extendedSchema,
      });
      const extendedTool = Object.freeze({
        ...toolBase,
        definitionDigest: digestAgentCanonicalValue(
          Object.fromEntries(
            Object.entries(toolBase).filter(
              ([key]) => key !== 'definitionDigest'
            )
          )
        ),
      });
      const material = withInvocation(
        original,
        Object.freeze({
          ...original.invocation,
          tools: Object.freeze(
            original.invocation.tools.map((tool) =>
              tool.toolId === extendedTool.toolId ? extendedTool : tool
            )
          ),
        })
      );
      const firstTurn = createAgentEvaluationCaseTurnInvocationPayload(
        protocolFamily,
        material,
        {
          phase: 'domain-tools',
          domainToolChoice: 'required',
          allowParallelDomainToolCalls: false,
          turnHistory: Object.freeze([]),
        }
      );
      const providerToolName = firstTurn.toolBindings.find(
        ({ toolId }) => toolId === extendedTool.toolId
      )?.providerToolName;
      const properties = extendedSchema.properties as Readonly<
        Record<string, Readonly<{ const?: unknown }>>
      >;
      if (!providerToolName) throw new Error('provider tool name is missing.');
      const argumentsValue = Object.freeze({
        snapshotDigest: properties.snapshotDigest?.const as string,
        targetRef: properties.targetRef?.const as string,
        detailLevel: 'complete',
      });
      const controlledResult = Object.freeze({
        status: 'available',
        artifactDigest: digestAgentCanonicalValue('artifact'),
      });
      const exchange: AgentEvaluationNormalizedTurnToolExchange = Object.freeze(
        {
          turnIndex: 0,
          toolEventSequence: 1,
          toolCallId: 'tool-call.workspace-inspect.1',
          providerToolCallId: 'provider-tool-call.workspace-inspect.1',
          toolId: extendedTool.toolId,
          providerToolName,
          arguments: argumentsValue,
          argumentsDigest: digestAgentCanonicalValue(argumentsValue),
          controlledResult,
          resultDigest: digestAgentCanonicalValue(controlledResult),
          priorResponseDigest: digestAgentCanonicalValue('prior-response'),
          continuationReceiptDigest: digestAgentCanonicalValue(
            'continuation-receipt'
          ),
        }
      );
      const encoded = createAgentEvaluationCaseTurnInvocationPayload(
        protocolFamily,
        material,
        {
          phase: 'domain-tools',
          domainToolChoice: 'auto',
          allowParallelDomainToolCalls: false,
          turnHistory: Object.freeze([exchange]),
        }
      );
      expect(encoded.toolResultBindings).toEqual([
        expect.objectContaining({
          argumentsDigest: exchange.argumentsDigest,
          resultDigest: exchange.resultDigest,
        }),
      ]);
      const bodyText = JSON.stringify(encoded.payload.body);
      expect(bodyText).toContain('detailLevel');
      expect(bodyText).toContain('complete');
      expect(bodyText).toContain('artifactDigest');
    }
  );

  it('rejects synthetic history and every normalized history cross-binding drift', () => {
    const fixtureMaterial = materialFor();
    expect(() =>
      createAgentEvaluationCaseTurnInvocationPayload(
        'openai-responses',
        fixtureMaterial,
        {
          phase: 'domain-tools',
          domainToolChoice: 'auto',
          allowParallelDomainToolCalls: false,
          turnHistory: Object.freeze([]),
        }
      )
    ).toThrow(/fixture-synthetic/u);

    const material = withoutSyntheticToolResults(fixtureMaterial);
    const initial = createAgentEvaluationCaseTurnInvocationPayload(
      'openai-responses',
      material,
      {
        phase: 'domain-tools',
        domainToolChoice: 'auto',
        allowParallelDomainToolCalls: false,
        turnHistory: Object.freeze([]),
      }
    );
    const binding = initial.toolBindings.find(
      ({ toolId }) => toolId === 'workspace.inspect'
    );
    const tool = material.invocation.tools.find(
      ({ toolId }) => toolId === 'workspace.inspect'
    );
    if (!binding || !tool || typeof tool.inputSchema !== 'object') {
      throw new Error('workspace.inspect binding is missing.');
    }
    const properties = (
      tool.inputSchema as Readonly<{
        properties: Readonly<Record<string, Readonly<{ const: string }>>>;
      }>
    ).properties;
    const argumentsValue = Object.freeze({
      snapshotDigest: properties.snapshotDigest!.const,
      targetRef: properties.targetRef!.const,
    });
    const controlledResult = Object.freeze({ status: 'available' });
    const valid: AgentEvaluationNormalizedTurnToolExchange = Object.freeze({
      turnIndex: 0,
      toolEventSequence: 1,
      toolCallId: 'tool-call.workspace-inspect.negative',
      providerToolCallId: 'provider-tool-call.workspace-inspect.negative',
      toolId: binding.toolId,
      providerToolName: binding.providerToolName,
      arguments: argumentsValue,
      argumentsDigest: digestAgentCanonicalValue(argumentsValue),
      controlledResult,
      resultDigest: digestAgentCanonicalValue(controlledResult),
      priorResponseDigest: digestAgentCanonicalValue('prior-response'),
      continuationReceiptDigest: digestAgentCanonicalValue(
        'continuation-receipt'
      ),
    });
    for (const drift of [
      { providerToolName: 'wrong_provider_tool' },
      { argumentsDigest: digestAgentCanonicalValue('wrong-arguments') },
      { resultDigest: digestAgentCanonicalValue('wrong-result') },
      { priorResponseDigest: 'invalid-digest' },
      { continuationReceiptDigest: 'invalid-digest' },
      {
        providerContinuationRef: 'continuation.provider.1',
        providerContinuationRefDigest: digestAgentCanonicalValue(
          'wrong-continuation-ref'
        ),
      },
    ] as const) {
      expect(() =>
        createAgentEvaluationCaseTurnInvocationPayload(
          'openai-responses',
          material,
          {
            phase: 'domain-tools',
            domainToolChoice: 'auto',
            allowParallelDomainToolCalls: false,
            turnHistory: Object.freeze([Object.freeze({ ...valid, ...drift })]),
          }
        )
      ).toThrow(/history binding drifted/u);
    }
  });

  it('projects workspace input without hidden expected or oracle authority', () => {
    const material = withoutSyntheticToolResults(
      materialFor('g4-visual-input')
    );
    const encoded = createAgentEvaluationCaseTurnInvocationPayload(
      'openai-responses',
      material,
      {
        phase: 'domain-tools',
        domainToolChoice: 'auto',
        allowParallelDomainToolCalls: false,
        turnHistory: Object.freeze([]),
      }
    );
    const bodyText = JSON.stringify(encoded.payload.body);
    expect(bodyText).not.toContain('expectedOutcome');
    expect(bodyText).not.toContain('visualOracle');
    expect(bodyText).not.toContain('documentOracle');
    expect(bodyText).not.toContain('fixtureDigest');
    expect(bodyText).toContain('actionRegistry');
  });

  it('maps PDF documents and supported raster images without source URI fetches', () => {
    const documentMaterial = materialFor('g4-document-input');
    for (const protocolFamily of [
      'openai-responses',
      'anthropic-messages',
      'gemini-interactions',
    ] as const) {
      const encoded = createAgentEvaluationCaseInvocationPayload(
        protocolFamily,
        documentMaterial
      );
      const documentBlock = documentMaterial.invocation.blocks.find(
        (block) => block.kind === 'document'
      );
      if (!documentBlock || documentBlock.kind !== 'document') {
        throw new Error('Document block is missing.');
      }
      expect(JSON.stringify(encoded.payload.body)).toContain(
        documentBlock.bytesBase64
      );
    }

    const visualMaterial = materialFor('g4-visual-input');
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const rasterInvocation = Object.freeze({
      ...visualMaterial.invocation,
      blocks: Object.freeze(
        visualMaterial.invocation.blocks.map((block) =>
          block.kind === 'image'
            ? Object.freeze({
                ...block,
                mediaType: 'image/png',
                bytesBase64: pngBase64,
                contentDigest: digestAgentEvaluationInlinePayload(
                  'image/png',
                  pngBase64
                ),
              })
            : block
        )
      ),
    });
    for (const protocolFamily of [
      'openai-responses',
      'anthropic-messages',
      'gemini-interactions',
    ] as const) {
      const encoded = createAgentEvaluationCaseInvocationPayload(
        protocolFamily,
        withInvocation(visualMaterial, rasterInvocation)
      );
      expect(JSON.stringify(encoded.payload.body)).toContain(pngBase64);
    }
  });

  it('fails closed on unsupported media and cross-bound tool results', () => {
    const visualMaterial = materialFor('g4-visual-input');
    const unsupportedInvocation = Object.freeze({
      ...visualMaterial.invocation,
      blocks: Object.freeze(
        visualMaterial.invocation.blocks.map((block) =>
          block.kind === 'image'
            ? Object.freeze({
                ...block,
                mediaType: 'image/svg+xml',
                contentDigest: digestAgentEvaluationInlinePayload(
                  'image/svg+xml',
                  block.bytesBase64
                ),
              })
            : block
        )
      ),
    });
    expect(() =>
      createAgentEvaluationCaseInvocationPayload(
        'gemini-interactions',
        withInvocation(visualMaterial, unsupportedInvocation)
      )
    ).toThrow(/unsupported/u);

    const material = materialFor();
    const crossBound = Object.freeze({
      ...material.invocation,
      blocks: Object.freeze(
        material.invocation.blocks.map((block) =>
          block.kind === 'tool-result'
            ? Object.freeze({ ...block, toolId: 'unknown.tool' })
            : block
        )
      ),
    });
    expect(() =>
      createAgentEvaluationCaseInvocationPayload(
        'openai-responses',
        withInvocation(material, crossBound)
      )
    ).toThrow(/tool-result binding/u);
  });

  it('fails closed when case tools collide with the reserved result tool', () => {
    const material = materialFor();
    const reservedBase = Object.freeze({
      toolId: AGENT_EVALUATION_RESULT_SUBMIT_TOOL_ID,
      description: 'Colliding tool.',
      effect: 'read-only' as const,
      inputSchema: Object.freeze({
        type: 'object',
        additionalProperties: false,
        properties: Object.freeze({}),
      }),
    });
    const invocation = Object.freeze({
      ...material.invocation,
      tools: Object.freeze([
        ...material.invocation.tools,
        Object.freeze({
          ...reservedBase,
          definitionDigest: digestAgentCanonicalValue(reservedBase),
        }),
      ]),
    });
    expect(() =>
      createAgentEvaluationCaseInvocationPayload(
        'anthropic-messages',
        withInvocation(material, invocation)
      )
    ).toThrow(/reserved result-submit tool/u);
  });

  it('fails closed on a drifted case material binding', () => {
    const material = materialFor();
    expect(() =>
      createAgentEvaluationCaseInvocationPayload(
        'openai-responses',
        Object.freeze({
          ...material,
          materialDigest: digestAgentCanonicalValue('drifted-material'),
        })
      )
    ).toThrow(/material digest drifted/u);
  });

  it('fails closed when synthetic tool arguments cannot bind required fields', () => {
    const material = materialFor();
    const unboundResult = Object.freeze({ status: 'available' });
    const invocation = Object.freeze({
      ...material.invocation,
      blocks: Object.freeze(
        material.invocation.blocks.map((block) =>
          block.kind === 'tool-result'
            ? Object.freeze({
                ...block,
                result: unboundResult,
                resultDigest: digestAgentCanonicalValue(unboundResult),
              })
            : block
        )
      ),
    });
    expect(() =>
      createAgentEvaluationCaseInvocationPayload(
        'openai-responses',
        withInvocation(material, invocation)
      )
    ).toThrow(/synthetic tool arguments/u);

    const originalToolResult = material.invocation.blocks.find(
      (
        block
      ): block is Extract<
        AgentEvaluationCaseMaterial['invocation']['blocks'][number],
        { kind: 'tool-result' }
      > => block.kind === 'tool-result'
    );
    if (!originalToolResult || !isPlainObject(originalToolResult.result)) {
      throw new TypeError('Expected synthetic tool result fixture.');
    }
    const wrongTypeResult = Object.freeze({
      ...originalToolResult.result,
      targetRef: 42,
    });
    const wrongTypeInvocation = Object.freeze({
      ...material.invocation,
      blocks: Object.freeze(
        material.invocation.blocks.map((block) =>
          block.kind === 'tool-result'
            ? Object.freeze({
                ...block,
                result: wrongTypeResult,
                resultDigest: digestAgentCanonicalValue(wrongTypeResult),
              })
            : block
        )
      ),
    });
    expect(() =>
      createAgentEvaluationCaseInvocationPayload(
        'gemini-interactions',
        withInvocation(material, wrongTypeInvocation)
      )
    ).toThrow(/input schema/u);
  });
});

describe('callback-bound invocation payload registry', () => {
  it('resolves the exact invocation and request digest once, then revokes it', async () => {
    const registry =
      new CallbackBoundAgentEvaluationInvocationPayloadRegistry();
    const invocation = invocationRequest();
    const encodedPayload = createAgentEvaluationCaseInvocationPayload(
      'openai-responses',
      materialFor()
    );
    const request = protocolRequest('openai-responses', invocation);
    await expect(
      registry.use(
        { protocolFamily: 'openai-responses', invocation, encodedPayload },
        async () => {
          const first = registry.resolveOnce(request);
          expect(first).toStrictEqual(encodedPayload.payload);
          expect(() => registry.resolveOnce(request)).toThrow(/replayed/u);
          return Object.freeze({ receipt: digestAgentCanonicalValue('safe') });
        }
      )
    ).resolves.toMatchObject({ receipt: expect.stringMatching(/^sha256-/u) });
    expect(() => registry.resolveOnce(request)).toThrow(/replayed/u);
  });

  it('invalidates a lease on request-digest or protocol cross-binding', async () => {
    const registry =
      new CallbackBoundAgentEvaluationInvocationPayloadRegistry();
    const invocation = invocationRequest();
    const encodedPayload = createAgentEvaluationCaseInvocationPayload(
      'anthropic-messages',
      materialFor()
    );
    await expect(
      registry.use(
        { protocolFamily: 'anthropic-messages', invocation, encodedPayload },
        async () => {
          expect(() =>
            registry.resolveOnce(
              protocolRequest(
                'anthropic-messages',
                Object.freeze({
                  ...invocation,
                  requestDigest: digestAgentCanonicalValue('cross-bound'),
                })
              )
            )
          ).toThrow(/mismatched/u);
          return null;
        }
      )
    ).rejects.toThrow(/exact transport/u);
  });

  it('fails closed when protected material escapes the transport callback', async () => {
    const registry =
      new CallbackBoundAgentEvaluationInvocationPayloadRegistry();
    const invocation = invocationRequest();
    const encodedPayload = createAgentEvaluationCaseInvocationPayload(
      'gemini-interactions',
      materialFor()
    );
    const canary = 'protected-holdout-canary-payload-123456789';
    await expect(
      registry.use(
        {
          protocolFamily: 'gemini-interactions',
          invocation,
          encodedPayload,
          protectedLeakCanaries: [canary],
        },
        async () => {
          registry.resolveOnce(
            protocolRequest('gemini-interactions', invocation)
          );
          return Object.freeze({ leaked: canary });
        }
      )
    ).rejects.toThrow(/no-leak/u);
  });
});
