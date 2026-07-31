import type { AgentPolicy } from './agent.types';

/**
 * Creates a valid, canonical, fail-closed project policy. Empty allowlists deny
 * provider/model/tool use until an authored policy explicitly admits it.
 */
export const createDefaultAgentPolicy = (
  id: string,
  name = 'Default Agent policy'
): AgentPolicy =>
  Object.freeze({
    id,
    name,
    providerRules: Object.freeze([]),
    modelRules: Object.freeze([]),
    contextRules: Object.freeze({
      allowedAuthorities: Object.freeze(['canonical', 'derived'] as const),
      allowedItemKinds: Object.freeze([
        'code-reference',
        'semantic-symbol',
        'source-trace',
        'workspace-document',
      ]),
      maximumSensitivity: 'internal',
      maxItems: 256,
      maxBytes: 262_144,
      requireSourceTrace: true,
      externalInstructionBoundary: 'data-only',
    }),
    capabilityRules: Object.freeze([]),
    approvalRules: Object.freeze([
      Object.freeze({
        id: 'approval.explicit-human',
        riskLevels: Object.freeze([
          'critical',
          'high',
          'low',
          'medium',
        ] as const),
        capabilities: Object.freeze(['commit', 'rollback'] as const),
        decisionAuthority: 'explicit-human',
        rollbackAuthorization: 'none',
      }),
    ]),
    networkRules: Object.freeze([]),
    secretRules: Object.freeze([]),
    budgetCeiling: Object.freeze({
      usageLimits: Object.freeze([]),
      costLimits: Object.freeze([]),
      maxModelInvocations: 1,
      maxToolCalls: 0,
      maxRepairRounds: 0,
      maxTransactions: 0,
      maxArtifactBytes: 0,
      maxElapsedMs: 60_000,
    }),
    verificationRules: Object.freeze({
      requiredModes: Object.freeze(['apply'] as const),
      requiredClosure: 'satisfied',
      requiredCheckKinds: Object.freeze([]),
      repair: 'forbidden',
      rollback: 'forbidden',
    }),
    retentionRules: Object.freeze({
      auditDays: 30,
      sanitizedTraceDays: 7,
      rawPrivateArtifactDays: 0,
      providerStateDays: 0,
      requireDeletionReceipt: true,
    }),
    privacy: Object.freeze({
      maximumSensitivity: 'internal',
      allowedRegions: Object.freeze([]),
      providerTraining: 'deny',
      providerTelemetry: 'deny',
      rawArtifactCapture: 'deny',
    }),
  } as const);
