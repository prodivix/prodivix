import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  cloneAgentControlJson,
  inspectAgentControlJson,
  isAgentControlIdentity,
} from '../control/agentControlValidation';
import type { AgentJsonValue, CanonicalDigest } from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import type {
  AgentEvaluationCaseMaterial,
  AgentEvaluationDeterministicGraderCheck,
} from './agentEvaluationCorpusMaterial.types';
import type { AgentEvaluationControlledRuntimeReceipt } from './agentEvaluationControlledRuntime';

export const AGENT_EVALUATION_RESULT_SUBMIT_TOOL_ID =
  'evaluation.result.submit';
export const AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME =
  'evaluation_result_submit';
export const AGENT_EVALUATION_RESULT_SUBMIT_TOOL_VERSION = 'v1';
export const AGENT_EVALUATION_RESULT_SUBMISSION_SCHEMA_VERSION = 1;

const maximumSubmissionBytes = 262_144;
const maximumResultItems = 256;
const maximumArtifactBytes = 67_108_864;
const digestPattern = '^sha256-[0-9a-f]{64}$';
const identityPattern = '^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$';

export type AgentEvaluationResultArtifactKind =
  | 'proposal'
  | 'verification-plan'
  | 'tool-receipt'
  | 'transaction-receipt'
  | 'verification-closure'
  | 'diagnostic-report';

export type AgentEvaluationResultArtifactRef = Readonly<{
  artifactKind: AgentEvaluationResultArtifactKind;
  artifactRef: string;
  artifactDigest: CanonicalDigest;
  byteLength: number;
}>;

/** Model-authored claims. Controlled runtime receipts establish execution authority. */
export type AgentEvaluationResultSubmissionInput = Readonly<{
  resultSchemaVersion: 1;
  resultSchemaDigest: CanonicalDigest;
  caseId: string;
  caseDigest: CanonicalDigest;
  materialDigest: CanonicalDigest;
  caseDefinitionDigest: CanonicalDigest;
  expectedAuthorityDigest: CanonicalDigest;
  gradingPolicyDigest: CanonicalDigest;
  graderMaterialDigest: CanonicalDigest;
  targetRefs: readonly string[];
  actionIds: readonly string[];
  contextSourceRefs: readonly string[];
  diagnosticCodes: readonly string[];
  plan: Readonly<{
    kind: 'typed-plan';
    planRef: string;
    planDigest: CanonicalDigest;
    repairRoundCount: number;
  }>;
  closure: Readonly<{
    kind: 'g3-closure';
    closureRef: string;
    closureDigest: CanonicalDigest;
    verdict: 'passed' | 'failed';
  }>;
  artifactRefs: readonly AgentEvaluationResultArtifactRef[];
}>;

export type AgentEvaluationResultSubmission =
  AgentEvaluationResultSubmissionInput &
    Readonly<{
      argumentsDigest: CanonicalDigest;
      submissionDigest: CanonicalDigest;
    }>;

export type AgentEvaluationResultSubmitToolContract = Readonly<{
  toolId: typeof AGENT_EVALUATION_RESULT_SUBMIT_TOOL_ID;
  nativeToolName: typeof AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME;
  toolVersion: typeof AGENT_EVALUATION_RESULT_SUBMIT_TOOL_VERSION;
  schemaVersion: 1;
  schemaDigest: CanonicalDigest;
  inputSchema: AgentJsonValue;
  inputSchemaDigest: CanonicalDigest;
  caseId: string;
  caseDigest: CanonicalDigest;
  materialDigest: CanonicalDigest;
  caseDefinitionDigest: CanonicalDigest;
  expectedAuthorityDigest: CanonicalDigest;
  gradingPolicyDigest: CanonicalDigest;
  graderMaterialDigest: CanonicalDigest;
  toolDefinitionDigest: CanonicalDigest;
}>;

export type AgentEvaluationResultAuthorityExpectation = Readonly<{
  caseId: string;
  caseDigest: CanonicalDigest;
  materialDigest: CanonicalDigest;
  caseDefinitionDigest: CanonicalDigest;
  expectedAuthorityDigest: CanonicalDigest;
  gradingPolicyDigest: CanonicalDigest;
  graderMaterialDigest: CanonicalDigest;
  schemaDigest: CanonicalDigest;
  exactTargetRefs: readonly string[];
  allowedActionIds: readonly string[];
  forbiddenActionIds: readonly string[];
  requiredContextSourceRefs: readonly string[];
  expectedDiagnosticCodes: readonly string[];
  requiredPlan: 'typed-plan';
  requiredClosure: 'g3-closure';
  graderChecks: readonly AgentEvaluationDeterministicGraderCheck[];
  graderCheckDigests: readonly CanonicalDigest[];
  authorityExpectationDigest: CanonicalDigest;
}>;

export type AgentEvaluationCaseResultContract = Readonly<{
  tool: AgentEvaluationResultSubmitToolContract;
  authority: AgentEvaluationResultAuthorityExpectation;
  contractDigest: CanonicalDigest;
}>;

export type AgentEvaluationResultSubmissionReceipt = Readonly<{
  format: 'prodivix.agent-evaluation-result-submission-receipt';
  version: 1;
  attemptId: string;
  invocationId: string;
  descriptorDigest: CanonicalDigest;
  caseId: string;
  caseDigest: CanonicalDigest;
  materialDigest: CanonicalDigest;
  caseDefinitionDigest: CanonicalDigest;
  toolId: typeof AGENT_EVALUATION_RESULT_SUBMIT_TOOL_ID;
  nativeToolName: typeof AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME;
  toolVersion: typeof AGENT_EVALUATION_RESULT_SUBMIT_TOOL_VERSION;
  schemaDigest: CanonicalDigest;
  inputSchemaDigest: CanonicalDigest;
  toolDefinitionDigest: CanonicalDigest;
  providerToolCallId: string;
  toolArgumentsDigest: CanonicalDigest;
  toolEventSequence: number;
  toolEventDigest: CanonicalDigest;
  terminalEventSequence: number;
  terminalEventDigest: CanonicalDigest;
  submissionDigest: CanonicalDigest;
  receiptDigest: CanonicalDigest;
}>;

const stringSchema = Object.freeze({
  type: 'string',
  minLength: 1,
  maxLength: 256,
  pattern: identityPattern,
});
const digestSchema = Object.freeze({
  type: 'string',
  pattern: digestPattern,
});
const identityArraySchema = Object.freeze({
  type: 'array',
  maxItems: maximumResultItems,
  uniqueItems: true,
  items: stringSchema,
});

/** Portable strict-JSON subset shared by the three native provider codecs. */
export const AGENT_EVALUATION_RESULT_SUBMISSION_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: Object.freeze([
    'resultSchemaVersion',
    'resultSchemaDigest',
    'caseId',
    'caseDigest',
    'materialDigest',
    'caseDefinitionDigest',
    'expectedAuthorityDigest',
    'gradingPolicyDigest',
    'graderMaterialDigest',
    'targetRefs',
    'actionIds',
    'contextSourceRefs',
    'diagnosticCodes',
    'plan',
    'closure',
    'artifactRefs',
  ]),
  properties: Object.freeze({
    resultSchemaVersion: Object.freeze({ type: 'integer', enum: [1] }),
    resultSchemaDigest: digestSchema,
    caseId: stringSchema,
    caseDigest: digestSchema,
    materialDigest: digestSchema,
    caseDefinitionDigest: digestSchema,
    expectedAuthorityDigest: digestSchema,
    gradingPolicyDigest: digestSchema,
    graderMaterialDigest: digestSchema,
    targetRefs: identityArraySchema,
    actionIds: identityArraySchema,
    contextSourceRefs: identityArraySchema,
    diagnosticCodes: identityArraySchema,
    plan: Object.freeze({
      type: 'object',
      additionalProperties: false,
      required: Object.freeze([
        'kind',
        'planRef',
        'planDigest',
        'repairRoundCount',
      ]),
      properties: Object.freeze({
        kind: Object.freeze({ type: 'string', enum: ['typed-plan'] }),
        planRef: stringSchema,
        planDigest: digestSchema,
        repairRoundCount: Object.freeze({
          type: 'integer',
          minimum: 0,
          maximum: 64,
        }),
      }),
    }),
    closure: Object.freeze({
      type: 'object',
      additionalProperties: false,
      required: Object.freeze([
        'kind',
        'closureRef',
        'closureDigest',
        'verdict',
      ]),
      properties: Object.freeze({
        kind: Object.freeze({ type: 'string', enum: ['g3-closure'] }),
        closureRef: stringSchema,
        closureDigest: digestSchema,
        verdict: Object.freeze({
          type: 'string',
          enum: Object.freeze(['passed', 'failed']),
        }),
      }),
    }),
    artifactRefs: Object.freeze({
      type: 'array',
      minItems: 2,
      maxItems: maximumResultItems,
      items: Object.freeze({
        type: 'object',
        additionalProperties: false,
        required: Object.freeze([
          'artifactKind',
          'artifactRef',
          'artifactDigest',
          'byteLength',
        ]),
        properties: Object.freeze({
          artifactKind: Object.freeze({
            type: 'string',
            enum: Object.freeze([
              'proposal',
              'verification-plan',
              'tool-receipt',
              'transaction-receipt',
              'verification-closure',
              'diagnostic-report',
            ]),
          }),
          artifactRef: stringSchema,
          artifactDigest: digestSchema,
          byteLength: Object.freeze({
            type: 'integer',
            minimum: 0,
            maximum: maximumArtifactBytes,
          }),
        }),
      }),
    }),
  }),
}) satisfies AgentJsonValue;

export const AGENT_EVALUATION_RESULT_SUBMISSION_SCHEMA_DIGEST =
  digestAgentCanonicalValue(AGENT_EVALUATION_RESULT_SUBMISSION_SCHEMA);

const exactRecord = (
  value: unknown,
  keys: readonly string[],
  label: string
): Record<string, unknown> => {
  if (
    !isPlainObject(value) ||
    Object.getOwnPropertySymbols(value).length > 0 ||
    Object.keys(value).some(isUnsafeObjectKey) ||
    !sameCanonicalJson(
      Object.keys(value).sort(compareUnicodeCodePoints),
      [...keys].sort(compareUnicodeCodePoints)
    )
  ) {
    throw new TypeError(`${label} has an invalid exact shape.`);
  }
  return value;
};

const frozenJson = <T>(value: T): T => {
  const clone = cloneAgentControlJson(value);
  const freeze = (candidate: unknown): void => {
    if (candidate === null || typeof candidate !== 'object') return;
    for (const child of Object.values(candidate)) freeze(child);
    Object.freeze(candidate);
  };
  freeze(clone);
  return clone;
};

const singletonEnum = (value: string | number): AgentJsonValue =>
  Object.freeze({
    type: typeof value === 'number' ? 'integer' : 'string',
    enum: Object.freeze([value]),
  });

const concreteInputSchema = (
  material: AgentEvaluationCaseMaterial
): AgentJsonValue => {
  const generic = cloneAgentControlJson(
    AGENT_EVALUATION_RESULT_SUBMISSION_SCHEMA
  ) as Record<string, AgentJsonValue>;
  const properties = generic.properties as Record<string, AgentJsonValue>;
  properties.resultSchemaVersion = singletonEnum(1);
  properties.resultSchemaDigest = singletonEnum(
    AGENT_EVALUATION_RESULT_SUBMISSION_SCHEMA_DIGEST
  );
  properties.caseId = singletonEnum(material.caseId);
  properties.caseDigest = singletonEnum(material.caseDigest);
  properties.materialDigest = singletonEnum(material.materialDigest);
  properties.caseDefinitionDigest = singletonEnum(
    material.caseDefinitionDigest
  );
  properties.expectedAuthorityDigest = singletonEnum(
    material.expectedAuthorityDigest
  );
  properties.gradingPolicyDigest = singletonEnum(material.gradingPolicyDigest);
  properties.graderMaterialDigest = singletonEnum(
    material.grader.graderMaterialDigest
  );
  return frozenJson(generic);
};

export const createAgentEvaluationCaseResultContract = (
  material: AgentEvaluationCaseMaterial
): AgentEvaluationCaseResultContract => {
  const { materialDigest, ...materialBase } = material;
  if (
    !isAgentCanonicalDigest(materialDigest) ||
    digestAgentCanonicalValue(materialBase) !== materialDigest
  ) {
    throw new TypeError('Evaluation result material binding drifted.');
  }
  const inputSchema = concreteInputSchema(material);
  const toolBase = Object.freeze({
    toolId: AGENT_EVALUATION_RESULT_SUBMIT_TOOL_ID,
    nativeToolName: AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME,
    toolVersion: AGENT_EVALUATION_RESULT_SUBMIT_TOOL_VERSION,
    schemaVersion: AGENT_EVALUATION_RESULT_SUBMISSION_SCHEMA_VERSION,
    schemaDigest: AGENT_EVALUATION_RESULT_SUBMISSION_SCHEMA_DIGEST,
    inputSchema,
    inputSchemaDigest: digestAgentCanonicalValue(inputSchema),
    caseId: material.caseId,
    caseDigest: material.caseDigest,
    materialDigest: material.materialDigest,
    caseDefinitionDigest: material.caseDefinitionDigest,
    expectedAuthorityDigest: material.expectedAuthorityDigest,
    gradingPolicyDigest: material.gradingPolicyDigest,
    graderMaterialDigest: material.grader.graderMaterialDigest,
  });
  const tool = Object.freeze({
    ...toolBase,
    toolDefinitionDigest: digestAgentCanonicalValue(toolBase),
  });
  const authorityBase = Object.freeze({
    caseId: material.caseId,
    caseDigest: material.caseDigest,
    materialDigest: material.materialDigest,
    caseDefinitionDigest: material.caseDefinitionDigest,
    expectedAuthorityDigest: material.expectedAuthorityDigest,
    gradingPolicyDigest: material.gradingPolicyDigest,
    graderMaterialDigest: material.grader.graderMaterialDigest,
    schemaDigest: AGENT_EVALUATION_RESULT_SUBMISSION_SCHEMA_DIGEST,
    exactTargetRefs: material.expectedAuthority.exactTargetRefs,
    allowedActionIds: material.expectedAuthority.allowedActionIds,
    forbiddenActionIds: material.expectedAuthority.forbiddenActionIds,
    requiredContextSourceRefs:
      material.expectedAuthority.requiredContextSourceRefs,
    expectedDiagnosticCodes: material.expectedAuthority.expectedDiagnosticCodes,
    requiredPlan: material.expectedAuthority.requiredPlan,
    requiredClosure: material.expectedAuthority.requiredClosure,
    graderChecks: material.grader.checks,
    graderCheckDigests: Object.freeze(
      material.grader.checks.map(({ checkDigest }) => checkDigest)
    ),
  });
  const authority = Object.freeze({
    ...authorityBase,
    authorityExpectationDigest: digestAgentCanonicalValue(authorityBase),
  });
  return Object.freeze({
    tool,
    authority,
    contractDigest: digestAgentCanonicalValue({
      toolDefinitionDigest: tool.toolDefinitionDigest,
      authorityExpectationDigest: authority.authorityExpectationDigest,
    }),
  });
};

const exactIdentityArray = (
  value: unknown,
  label: string
): readonly string[] => {
  if (
    !Array.isArray(value) ||
    value.length > maximumResultItems ||
    value.some((entry) => !isAgentControlIdentity(entry)) ||
    new Set(value).size !== value.length
  ) {
    throw new TypeError(`${label} must be a canonical unique identity array.`);
  }
  return Object.freeze(
    [...value].sort(compareUnicodeCodePoints)
  ) as readonly string[];
};

const artifactKinds = new Set<AgentEvaluationResultArtifactKind>([
  'proposal',
  'verification-plan',
  'tool-receipt',
  'transaction-receipt',
  'verification-closure',
  'diagnostic-report',
]);

const decodeJson = (value: unknown): unknown => {
  if (typeof value !== 'string' && !(value instanceof Uint8Array)) return value;
  try {
    const text =
      typeof value === 'string'
        ? value
        : new TextDecoder('utf-8', { fatal: true }).decode(value);
    if (new TextEncoder().encode(text).byteLength > maximumSubmissionBytes) {
      throw new TypeError('Evaluation result submission exceeds its bound.');
    }
    return JSON.parse(text) as unknown;
  } catch {
    throw new TypeError('Evaluation result submission is not strict JSON.');
  }
};

/** Strictly decodes the sole typed terminal result; no free-text inference occurs. */
export const decodeAgentEvaluationResultSubmission = (
  value: unknown,
  contract: AgentEvaluationCaseResultContract
): AgentEvaluationResultSubmission => {
  const decoded = decodeJson(value);
  if (inspectAgentControlJson(decoded, maximumSubmissionBytes).length > 0) {
    throw new TypeError(
      'Evaluation result submission is not bounded safe JSON.'
    );
  }
  const record = exactRecord(
    decoded,
    [
      'resultSchemaVersion',
      'resultSchemaDigest',
      'caseId',
      'caseDigest',
      'materialDigest',
      'caseDefinitionDigest',
      'expectedAuthorityDigest',
      'gradingPolicyDigest',
      'graderMaterialDigest',
      'targetRefs',
      'actionIds',
      'contextSourceRefs',
      'diagnosticCodes',
      'plan',
      'closure',
      'artifactRefs',
    ],
    'Evaluation result submission'
  );
  const tool = contract.tool;
  if (
    record.resultSchemaVersion !== 1 ||
    record.resultSchemaDigest !== tool.schemaDigest ||
    record.caseId !== tool.caseId ||
    record.caseDigest !== tool.caseDigest ||
    record.materialDigest !== tool.materialDigest ||
    record.caseDefinitionDigest !== tool.caseDefinitionDigest ||
    record.expectedAuthorityDigest !== tool.expectedAuthorityDigest ||
    record.gradingPolicyDigest !== tool.gradingPolicyDigest ||
    record.graderMaterialDigest !== tool.graderMaterialDigest
  ) {
    throw new TypeError('Evaluation result submission binding drifted.');
  }
  const plan = exactRecord(
    record.plan,
    ['kind', 'planRef', 'planDigest', 'repairRoundCount'],
    'Evaluation result plan'
  );
  const closure = exactRecord(
    record.closure,
    ['kind', 'closureRef', 'closureDigest', 'verdict'],
    'Evaluation result closure'
  );
  if (
    plan.kind !== 'typed-plan' ||
    !isAgentControlIdentity(plan.planRef) ||
    !isAgentCanonicalDigest(plan.planDigest) ||
    !Number.isSafeInteger(plan.repairRoundCount) ||
    Number(plan.repairRoundCount) < 0 ||
    Number(plan.repairRoundCount) > 64 ||
    closure.kind !== 'g3-closure' ||
    !isAgentControlIdentity(closure.closureRef) ||
    !isAgentCanonicalDigest(closure.closureDigest) ||
    !['passed', 'failed'].includes(String(closure.verdict)) ||
    !Array.isArray(record.artifactRefs) ||
    record.artifactRefs.length < 2 ||
    record.artifactRefs.length > maximumResultItems
  ) {
    throw new TypeError('Evaluation result plan or closure is invalid.');
  }
  const artifactRefs = record.artifactRefs.map((entry) => {
    const artifact = exactRecord(
      entry,
      ['artifactKind', 'artifactRef', 'artifactDigest', 'byteLength'],
      'Evaluation result artifact reference'
    );
    if (
      !artifactKinds.has(
        artifact.artifactKind as AgentEvaluationResultArtifactKind
      ) ||
      !isAgentControlIdentity(artifact.artifactRef) ||
      !isAgentCanonicalDigest(artifact.artifactDigest) ||
      !Number.isSafeInteger(artifact.byteLength) ||
      Number(artifact.byteLength) < 0 ||
      Number(artifact.byteLength) > maximumArtifactBytes
    ) {
      throw new TypeError('Evaluation result artifact reference is invalid.');
    }
    return Object.freeze({
      artifactKind: artifact.artifactKind as AgentEvaluationResultArtifactKind,
      artifactRef: artifact.artifactRef,
      artifactDigest: artifact.artifactDigest,
      byteLength: artifact.byteLength,
    }) as AgentEvaluationResultArtifactRef;
  });
  if (
    new Set(artifactRefs.map(({ artifactRef }) => artifactRef)).size !==
      artifactRefs.length ||
    !artifactRefs.some(
      ({ artifactKind, artifactRef, artifactDigest }) =>
        artifactKind === 'verification-plan' &&
        artifactRef === plan.planRef &&
        artifactDigest === plan.planDigest
    ) ||
    !artifactRefs.some(
      ({ artifactKind, artifactRef, artifactDigest }) =>
        artifactKind === 'verification-closure' &&
        artifactRef === closure.closureRef &&
        artifactDigest === closure.closureDigest
    )
  ) {
    throw new TypeError('Evaluation result artifact bindings are invalid.');
  }
  artifactRefs.sort((left, right) =>
    compareUnicodeCodePoints(
      `${left.artifactKind}\u0000${left.artifactRef}`,
      `${right.artifactKind}\u0000${right.artifactRef}`
    )
  );
  const base = frozenJson({
    resultSchemaVersion: 1 as const,
    resultSchemaDigest: tool.schemaDigest,
    caseId: tool.caseId,
    caseDigest: tool.caseDigest,
    materialDigest: tool.materialDigest,
    caseDefinitionDigest: tool.caseDefinitionDigest,
    expectedAuthorityDigest: tool.expectedAuthorityDigest,
    gradingPolicyDigest: tool.gradingPolicyDigest,
    graderMaterialDigest: tool.graderMaterialDigest,
    targetRefs: exactIdentityArray(record.targetRefs, 'Evaluation target refs'),
    actionIds: exactIdentityArray(record.actionIds, 'Evaluation action ids'),
    contextSourceRefs: exactIdentityArray(
      record.contextSourceRefs,
      'Evaluation Context source refs'
    ),
    diagnosticCodes: exactIdentityArray(
      record.diagnosticCodes,
      'Evaluation diagnostic codes'
    ),
    plan: Object.freeze({
      kind: 'typed-plan' as const,
      planRef: plan.planRef,
      planDigest: plan.planDigest,
      repairRoundCount: plan.repairRoundCount,
    }),
    closure: Object.freeze({
      kind: 'g3-closure' as const,
      closureRef: closure.closureRef,
      closureDigest: closure.closureDigest,
      verdict: closure.verdict,
    }),
    artifactRefs: Object.freeze(artifactRefs),
  }) as AgentEvaluationResultSubmissionInput;
  const argumentsDigest = digestAgentCanonicalValue(decoded);
  return Object.freeze({
    ...base,
    argumentsDigest,
    submissionDigest: digestAgentCanonicalValue({
      argumentsDigest,
      result: base,
    }),
  });
};

/** Creates the durable binding only after the caller found one exact submit call and a later completed terminal event. */
export const createAgentEvaluationResultSubmissionReceipt = (
  input: Readonly<{
    attemptId: string;
    invocationId: string;
    descriptorDigest: CanonicalDigest;
    providerToolCallId: string;
    toolArgumentsDigest: CanonicalDigest;
    toolEventSequence: number;
    toolEventDigest: CanonicalDigest;
    terminalEventSequence: number;
    terminalEventDigest: CanonicalDigest;
  }>,
  submission: AgentEvaluationResultSubmission,
  contract: AgentEvaluationCaseResultContract
): AgentEvaluationResultSubmissionReceipt => {
  exactRecord(
    input,
    [
      'attemptId',
      'invocationId',
      'descriptorDigest',
      'providerToolCallId',
      'toolArgumentsDigest',
      'toolEventSequence',
      'toolEventDigest',
      'terminalEventSequence',
      'terminalEventDigest',
    ],
    'Evaluation result submission receipt input'
  );
  if (
    inspectAgentControlJson(input, maximumSubmissionBytes).length > 0 ||
    !isAgentControlIdentity(input.attemptId) ||
    !isAgentControlIdentity(input.invocationId) ||
    !isAgentCanonicalDigest(input.descriptorDigest) ||
    !isAgentControlIdentity(input.providerToolCallId) ||
    !isAgentCanonicalDigest(input.toolArgumentsDigest) ||
    !Number.isSafeInteger(input.toolEventSequence) ||
    input.toolEventSequence < 0 ||
    !isAgentCanonicalDigest(input.toolEventDigest) ||
    !Number.isSafeInteger(input.terminalEventSequence) ||
    input.terminalEventSequence <= input.toolEventSequence ||
    !isAgentCanonicalDigest(input.terminalEventDigest) ||
    submission.submissionDigest !==
      digestAgentCanonicalValue({
        argumentsDigest: submission.argumentsDigest,
        result: (({ argumentsDigest: _, submissionDigest: __, ...base }) =>
          base)(submission),
      }) ||
    input.toolArgumentsDigest !== submission.argumentsDigest ||
    submission.caseId !== contract.tool.caseId ||
    submission.caseDigest !== contract.tool.caseDigest ||
    submission.materialDigest !== contract.tool.materialDigest ||
    submission.caseDefinitionDigest !== contract.tool.caseDefinitionDigest
  ) {
    throw new TypeError('Evaluation result submission receipt is invalid.');
  }
  const base = Object.freeze({
    format: 'prodivix.agent-evaluation-result-submission-receipt' as const,
    version: 1 as const,
    attemptId: input.attemptId,
    invocationId: input.invocationId,
    descriptorDigest: input.descriptorDigest,
    caseId: contract.tool.caseId,
    caseDigest: contract.tool.caseDigest,
    materialDigest: contract.tool.materialDigest,
    caseDefinitionDigest: contract.tool.caseDefinitionDigest,
    toolId: contract.tool.toolId,
    nativeToolName: contract.tool.nativeToolName,
    toolVersion: contract.tool.toolVersion,
    schemaDigest: contract.tool.schemaDigest,
    inputSchemaDigest: contract.tool.inputSchemaDigest,
    toolDefinitionDigest: contract.tool.toolDefinitionDigest,
    providerToolCallId: input.providerToolCallId,
    toolArgumentsDigest: input.toolArgumentsDigest,
    toolEventSequence: input.toolEventSequence,
    toolEventDigest: input.toolEventDigest,
    terminalEventSequence: input.terminalEventSequence,
    terminalEventDigest: input.terminalEventDigest,
    submissionDigest: submission.submissionDigest,
  });
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

export type AgentEvaluationResultAuthorityAssessment = Readonly<{
  exactTargets: boolean;
  allowedActionsOnly: boolean;
  forbiddenActionsAbsent: boolean;
  requiredSourcesPresent: boolean;
  expectedDiagnosticsPresent: boolean;
  typedPlanPresent: boolean;
  g3ClosurePresent: boolean;
  checks: readonly Readonly<{
    checkId: string;
    kind: AgentEvaluationDeterministicGraderCheck['kind'];
    checkDigest: CanonicalDigest;
    passed: boolean;
    checkAssessmentDigest: CanonicalDigest;
  }>[];
  passed: boolean;
  assessmentDigest: CanonicalDigest;
}>;

/** Deterministic oracle projection requiring both the typed submit receipt and controlled execution authority. */
export const assessAgentEvaluationResultAuthority = (
  submission: AgentEvaluationResultSubmission,
  receipt: AgentEvaluationResultSubmissionReceipt,
  runtimeReceipt: AgentEvaluationControlledRuntimeReceipt,
  contract: AgentEvaluationCaseResultContract
): AgentEvaluationResultAuthorityAssessment => {
  if (
    submission.submissionDigest !==
      digestAgentCanonicalValue({
        argumentsDigest: submission.argumentsDigest,
        result: (({ argumentsDigest: _, submissionDigest: __, ...base }) =>
          base)(submission),
      }) ||
    submission.caseId !== contract.authority.caseId ||
    submission.caseDigest !== contract.authority.caseDigest ||
    receipt.submissionDigest !== submission.submissionDigest ||
    receipt.caseId !== submission.caseId ||
    receipt.caseDigest !== submission.caseDigest ||
    receipt.materialDigest !== submission.materialDigest ||
    receipt.caseDefinitionDigest !== submission.caseDefinitionDigest ||
    receipt.toolDefinitionDigest !== contract.tool.toolDefinitionDigest ||
    receipt.receiptDigest !==
      digestAgentCanonicalValue(
        (({ receiptDigest: _, ...base }) => base)(receipt)
      ) ||
    runtimeReceipt.submissionReceiptDigest !== receipt.receiptDigest ||
    runtimeReceipt.attemptId !== receipt.attemptId ||
    runtimeReceipt.descriptorDigest !== receipt.descriptorDigest ||
    runtimeReceipt.caseId !== submission.caseId ||
    runtimeReceipt.caseDigest !== submission.caseDigest ||
    runtimeReceipt.materialDigest !== submission.materialDigest ||
    runtimeReceipt.receiptDigest !==
      digestAgentCanonicalValue(
        (({ receiptDigest: _, ...base }) => base)(runtimeReceipt)
      )
  ) {
    throw new TypeError(
      'Evaluation result submission authority binding drifted.'
    );
  }
  const authority = contract.authority;
  const exactTargets = sameCanonicalJson(
    submission.targetRefs,
    authority.exactTargetRefs
  );
  const allowedActionsOnly = submission.actionIds.every((actionId) =>
    authority.allowedActionIds.includes(actionId)
  );
  const forbiddenActionsAbsent = authority.forbiddenActionIds.every(
    (actionId) => !submission.actionIds.includes(actionId)
  );
  const requiredSourcesPresent = authority.requiredContextSourceRefs.every(
    (sourceRef) => submission.contextSourceRefs.includes(sourceRef)
  );
  const expectedDiagnosticsPresent = authority.expectedDiagnosticCodes.every(
    (code) => submission.diagnosticCodes.includes(code)
  );
  const typedPlanPresent =
    submission.plan.kind === authority.requiredPlan &&
    runtimeReceipt.proposalValidation.verdict === 'passed' &&
    isAgentCanonicalDigest(
      runtimeReceipt.g3Verification.verificationPlanReceiptDigest
    );
  const g3ClosurePresent =
    submission.closure.kind === authority.requiredClosure &&
    runtimeReceipt.g3Verification.verdict === 'passed' &&
    isAgentCanonicalDigest(
      runtimeReceipt.g3Verification.verificationClosureDigest
    );
  const checks = Object.freeze(
    authority.graderChecks.map((check) => {
      const actual: AgentJsonValue = (() => {
        switch (check.kind) {
          case 'strict-schema':
            return true;
          case 'exact-target':
            return submission.targetRefs.includes(check.subjectRef);
          case 'allowed-action':
          case 'forbidden-action':
            return submission.actionIds.includes(check.subjectRef);
          case 'required-source':
            return submission.contextSourceRefs.includes(check.subjectRef);
          case 'expected-diagnostic':
            return submission.diagnosticCodes.includes(check.subjectRef);
          case 'g3-plan':
            return typedPlanPresent ? 'required' : 'missing';
          case 'g3-closure':
            return g3ClosurePresent ? 'required' : 'missing';
        }
      })();
      const checkBase = Object.freeze({
        checkId: check.checkId,
        kind: check.kind,
        checkDigest: check.checkDigest,
        passed: sameCanonicalJson(actual, check.expected),
      });
      return Object.freeze({
        ...checkBase,
        checkAssessmentDigest: digestAgentCanonicalValue({
          submissionDigest: submission.submissionDigest,
          receiptDigest: receipt.receiptDigest,
          controlledRuntimeReceiptDigest: runtimeReceipt.receiptDigest,
          actual,
          ...checkBase,
        }),
      });
    })
  );
  const base = Object.freeze({
    exactTargets,
    allowedActionsOnly,
    forbiddenActionsAbsent,
    requiredSourcesPresent,
    expectedDiagnosticsPresent,
    typedPlanPresent,
    g3ClosurePresent,
    checks,
    passed:
      exactTargets &&
      allowedActionsOnly &&
      forbiddenActionsAbsent &&
      requiredSourcesPresent &&
      expectedDiagnosticsPresent &&
      typedPlanPresent &&
      g3ClosurePresent &&
      checks.every(({ passed }) => passed),
  });
  return Object.freeze({
    ...base,
    assessmentDigest: digestAgentCanonicalValue({
      submissionDigest: submission.submissionDigest,
      receiptDigest: receipt.receiptDigest,
      controlledRuntimeReceiptDigest: runtimeReceipt.receiptDigest,
      authorityExpectationDigest: authority.authorityExpectationDigest,
      ...base,
    }),
  });
};
