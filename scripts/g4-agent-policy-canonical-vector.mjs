import { canonicalJsonText } from '../packages/shared/src/canonical/index.ts';
import { createDefaultAgentPolicy } from '../packages/ai/src/domain/agentPolicyDefaults.ts';
import {
  digestAgentPolicy,
  encodeAgentPolicy,
  serializeAgentPolicy,
  validateAgentPolicy,
} from '../packages/ai/src/domain/agentPolicyCodec.ts';

/**
 * One secret-free policy vector shared by the TypeScript current/wire owner,
 * the Go admission boundary, and PostgreSQL JSONB round-trip coverage.
 */
export const createG4AgentPolicyCanonicalVector = () => {
  const policy = Object.freeze({
    ...createDefaultAgentPolicy(
      'agent.policy.default',
      'Canonical policy <&> — 雪 😀'
    ),
    providerRules: Object.freeze([
      Object.freeze({
        id: 'provider.release-evaluated',
        effect: 'allow',
        providerConfigurationIds: Object.freeze(['provider.primary']),
        protocolFamilies: Object.freeze([
          'anthropic-messages',
          'openai-responses',
        ]),
        endpointClasses: Object.freeze([
          'first-party-hosted',
          'self-hosted',
        ]),
        regions: Object.freeze(['cn', 'us']),
        minimumSupportTier: 'release-evaluated',
        maximumSensitivity: 'internal',
      }),
    ]),
    modelRules: Object.freeze([
      Object.freeze({
        id: 'model.release-evaluated',
        effect: 'allow',
        modelIds: Object.freeze(['model.primary']),
        modelFamilyIds: Object.freeze(['family.primary']),
        capabilityProfileIds: Object.freeze(['profile.text-plan']),
        minimumSupportTier: 'release-evaluated',
      }),
    ]),
    capabilityRules: Object.freeze([
      Object.freeze({
        id: 'capability.plan-only',
        effect: 'allow',
        capabilities: Object.freeze(['propose', 'read']),
        targetScope: Object.freeze({
          targets: Object.freeze([
            Object.freeze({ kind: 'document', id: 'page.catalog' }),
            Object.freeze({ kind: 'workspace', id: 'workspace.vector' }),
          ]),
        }),
        toolIds: Object.freeze(['tool.context.read']),
        runtimeZones: Object.freeze(['browser', 'server']),
        maximumRisk: 'medium',
      }),
    ]),
    networkRules: Object.freeze([
      Object.freeze({
        id: 'network.provider',
        effect: 'allow',
        hosts: Object.freeze(['api.example.test']),
        methods: Object.freeze(['GET', 'HEAD', 'POST']),
        maxRequestBytes: 262_144,
        maxResponseBytes: 1_048_576,
        redirectPolicy: 'same-origin',
        tls: 'required',
      }),
    ]),
    secretRules: Object.freeze([
      Object.freeze({
        id: 'secret.provider-credential',
        effect: 'allow',
        referenceKinds: Object.freeze(['provider-credential']),
        purposes: Object.freeze(['model-invocation']),
        runtimeZones: Object.freeze(['server']),
      }),
    ]),
    budgetCeiling: Object.freeze({
      usageLimits: Object.freeze([
        Object.freeze({ unit: 'image', maximum: '2' }),
        Object.freeze({ unit: 'text-token-input', maximum: '12000' }),
      ]),
      costLimits: Object.freeze([
        Object.freeze({ currency: 'CNY', maximum: '12.50' }),
        Object.freeze({ currency: 'USD', maximum: '2' }),
      ]),
      maxModelInvocations: 4,
      maxToolCalls: 8,
      maxRepairRounds: 0,
      maxTransactions: 0,
      maxArtifactBytes: 1_048_576,
      maxElapsedMs: 60_000,
    }),
    privacy: Object.freeze({
      maximumSensitivity: 'internal',
      allowedRegions: Object.freeze(['cn', 'us']),
      providerTraining: 'deny',
      providerTelemetry: 'deny',
      rawArtifactCapture: 'deny',
    }),
  });
  const validation = validateAgentPolicy(policy);
  if (!validation.ok) {
    throw new Error(
      `G4 canonical AgentPolicy is invalid: ${JSON.stringify(validation.issues)}`
    );
  }
  const current = validation.value;
  const wire = encodeAgentPolicy(current);
  const { privacy: _privacy, ...legacyCurrent } = current;
  return Object.freeze({
    format: 'prodivix.agent-policy-canonical-vector',
    version: 1,
    documentId: current.id,
    current,
    wire,
    legacyWire: Object.freeze({ ...legacyCurrent, wireVersion: 0 }),
    canonicalCurrentJson: canonicalJsonText(current),
    canonicalWireJson: serializeAgentPolicy(current),
    expectedDigest: digestAgentPolicy(current),
  });
};
