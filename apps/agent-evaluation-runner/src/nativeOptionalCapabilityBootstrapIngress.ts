import {
  digestAgentCanonicalValue,
  hasExactAgentControlKeys,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentNativeProviderOptionalCapabilitySourceReceipt,
  isAgentCapabilityProbeProgram,
  type AgentCapabilityProbeProgram,
  type AgentEvaluationProviderResultSpoolAad,
  type AgentEvaluationProviderResultSpoolEnvelope,
  type AgentEvaluationTransportReceipt,
  type AgentModelEvaluationAttemptDescriptor,
  type AgentNativeProviderOptionalCapabilitySourceReceipt,
  type AgentNativeProviderTransportRequest,
  type CanonicalDigest,
} from '@prodivix/ai';
import { sameCanonicalJson } from '@prodivix/shared/canonical';

export const AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_CLOSE_INGRESS_FORMAT =
  'prodivix.agent-evaluation-native-optional-capability-bootstrap-close-ingress' as const;
export const AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_CLOSE_INGRESS_VERSION =
  1 as const;

export type AgentEvaluationNativeOptionalCapabilityBootstrapOutcome =
  'failed' | 'observed' | 'unavailable';

export type AgentEvaluationNativeOptionalCapabilityBootstrapCloseIngress =
  Readonly<{
    format: typeof AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_CLOSE_INGRESS_FORMAT;
    version: typeof AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_CLOSE_INGRESS_VERSION;
    attemptId: string;
    descriptorDigest: CanonicalDigest;
    turnIndex: 0;
    invocationId: string;
    providerRequestDigest: CanonicalDigest;
    providerResponseDigest: CanonicalDigest;
    dispatchIntentDigest: CanonicalDigest;
    transportReceiptDigest: CanonicalDigest;
    resultSpoolAADigest: CanonicalDigest;
    resultSpoolEnvelopeDigest: CanonicalDigest;
    normalizedEventSetDigest: CanonicalDigest;
    outcome: AgentEvaluationNativeOptionalCapabilityBootstrapOutcome;
    nativeSourceReceipt: AgentNativeProviderOptionalCapabilitySourceReceipt | null;
    ingressDigest: CanonicalDigest;
  }>;

export type AgentEvaluationNativeOptionalCapabilityBootstrapResolution =
  Readonly<{
    program: AgentCapabilityProbeProgram;
    outcome: AgentEvaluationNativeOptionalCapabilityBootstrapOutcome;
    nativeSourceReceipt: AgentNativeProviderOptionalCapabilitySourceReceipt | null;
  }>;

export type CreateAgentEvaluationNativeOptionalCapabilityBootstrapCloseIngressInput =
  Readonly<{
    descriptor: AgentModelEvaluationAttemptDescriptor;
    turnIndex: number;
    request: AgentNativeProviderTransportRequest;
    transportReceipt: AgentEvaluationTransportReceipt;
    responseDigest: CanonicalDigest;
    resultSpoolAad: AgentEvaluationProviderResultSpoolAad;
    encryptedResultSpool: AgentEvaluationProviderResultSpoolEnvelope;
    resolution: AgentEvaluationNativeOptionalCapabilityBootstrapResolution;
  }>;

const ingressKeys = Object.freeze([
  'format',
  'version',
  'attemptId',
  'descriptorDigest',
  'turnIndex',
  'invocationId',
  'providerRequestDigest',
  'providerResponseDigest',
  'dispatchIntentDigest',
  'transportReceiptDigest',
  'resultSpoolAADigest',
  'resultSpoolEnvelopeDigest',
  'normalizedEventSetDigest',
  'outcome',
  'nativeSourceReceipt',
  'ingressDigest',
] as const);

const ingressBase = (
  value: Omit<
    AgentEvaluationNativeOptionalCapabilityBootstrapCloseIngress,
    'ingressDigest'
  >
) => Object.freeze({ ...value });

const resolutionMatchesTransport = (
  input: CreateAgentEvaluationNativeOptionalCapabilityBootstrapCloseIngressInput
): boolean => {
  const { nativeSourceReceipt, outcome, program } = input.resolution;
  const observed = outcome === 'observed';
  return (
    isAgentCapabilityProbeProgram(program) &&
    program.profileProjection.capabilityProfileDigest ===
      input.request.invocation.capabilityProfileDigest &&
    observed === (nativeSourceReceipt !== null) &&
    (nativeSourceReceipt === null ||
      (isAgentNativeProviderOptionalCapabilitySourceReceipt(
        nativeSourceReceipt,
        program
      ) &&
        nativeSourceReceipt.protocolFamily === input.request.protocolFamily &&
        nativeSourceReceipt.capabilityProfileDigest ===
          input.request.invocation.capabilityProfileDigest &&
        nativeSourceReceipt.invocationId ===
          input.request.invocation.invocationId &&
        nativeSourceReceipt.requestDigest ===
          input.request.invocation.requestDigest &&
        nativeSourceReceipt.responseDigest === input.responseDigest &&
        nativeSourceReceipt.providerConfigurationId ===
          input.request.invocation.providerConfigurationId &&
        nativeSourceReceipt.modelLineageDigest ===
          input.request.invocation.modelLineageDigest))
  );
};

const transportBindingIsValid = (
  input: CreateAgentEvaluationNativeOptionalCapabilityBootstrapCloseIngressInput
): boolean => {
  const {
    descriptor,
    request,
    transportReceipt,
    resultSpoolAad,
    encryptedResultSpool,
  } = input;
  return (
    input.turnIndex === 0 &&
    ['anthropic-messages', 'gemini-interactions', 'openai-responses'].includes(
      request.protocolFamily
    ) &&
    transportReceipt.outcome === 'completed' &&
    transportReceipt.dispatchState === 'dispatched' &&
    descriptor.attemptId === resultSpoolAad.attemptId &&
    descriptor.descriptorDigest === resultSpoolAad.descriptorDigest &&
    resultSpoolAad.turnIndex === input.turnIndex &&
    request.invocation.invocationId === resultSpoolAad.invocationId &&
    request.invocation.requestDigest === transportReceipt.requestDigest &&
    request.invocation.providerConfigurationId ===
      transportReceipt.providerConfigurationId &&
    transportReceipt.invocationId === request.invocation.invocationId &&
    transportReceipt.dispatchIntentDigest ===
      resultSpoolAad.dispatchIntentDigest &&
    transportReceipt.receiptDigest === resultSpoolAad.transportReceiptDigest &&
    transportReceipt.responseBodyDigest === resultSpoolAad.responseBodyDigest &&
    encryptedResultSpool.aadDigest ===
      digestAgentCanonicalValue(resultSpoolAad) &&
    isAgentCanonicalDigest(input.responseDigest) &&
    resolutionMatchesTransport(input)
  );
};

export const createAgentEvaluationNativeOptionalCapabilityBootstrapCloseIngress =
  (
    input: CreateAgentEvaluationNativeOptionalCapabilityBootstrapCloseIngressInput
  ): AgentEvaluationNativeOptionalCapabilityBootstrapCloseIngress => {
    if (!transportBindingIsValid(input)) {
      throw new TypeError(
        'Native optional capability bootstrap close binding is invalid.'
      );
    }
    const base = ingressBase({
      format:
        AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_CLOSE_INGRESS_FORMAT,
      version:
        AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_CLOSE_INGRESS_VERSION,
      attemptId: input.descriptor.attemptId,
      descriptorDigest: input.descriptor.descriptorDigest,
      turnIndex: 0,
      invocationId: input.request.invocation.invocationId,
      providerRequestDigest: input.request.invocation.requestDigest,
      providerResponseDigest: input.responseDigest,
      dispatchIntentDigest: input.transportReceipt.dispatchIntentDigest,
      transportReceiptDigest: input.transportReceipt.receiptDigest,
      resultSpoolAADigest: input.encryptedResultSpool.aadDigest,
      resultSpoolEnvelopeDigest: input.encryptedResultSpool.envelopeDigest,
      normalizedEventSetDigest: input.resultSpoolAad.normalizedEventSetDigest,
      outcome: input.resolution.outcome,
      nativeSourceReceipt: input.resolution.nativeSourceReceipt,
    });
    return Object.freeze({
      ...base,
      ingressDigest: digestAgentCanonicalValue(base),
    });
  };

export const isAgentEvaluationNativeOptionalCapabilityBootstrapCloseIngress = (
  value: unknown
): value is AgentEvaluationNativeOptionalCapabilityBootstrapCloseIngress => {
  if (!hasExactAgentControlKeys(value, ingressKeys)) return false;
  const ingress =
    value as AgentEvaluationNativeOptionalCapabilityBootstrapCloseIngress;
  if (
    ingress.format !==
      AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_CLOSE_INGRESS_FORMAT ||
    ingress.version !==
      AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_CLOSE_INGRESS_VERSION ||
    !isAgentControlIdentity(ingress.attemptId) ||
    !isAgentControlIdentity(ingress.invocationId) ||
    ingress.turnIndex !== 0 ||
    ![
      ingress.descriptorDigest,
      ingress.providerRequestDigest,
      ingress.providerResponseDigest,
      ingress.dispatchIntentDigest,
      ingress.transportReceiptDigest,
      ingress.resultSpoolAADigest,
      ingress.resultSpoolEnvelopeDigest,
      ingress.normalizedEventSetDigest,
      ingress.ingressDigest,
    ].every(isAgentCanonicalDigest) ||
    !['failed', 'observed', 'unavailable'].includes(ingress.outcome) ||
    (ingress.outcome === 'observed') !== (ingress.nativeSourceReceipt !== null)
  ) {
    return false;
  }
  const { ingressDigest: _ingressDigest, ...base } = ingress;
  return ingress.ingressDigest === digestAgentCanonicalValue(base);
};

export const nativeOptionalCapabilityBootstrapIngressMatchesTransport = (
  ingress: AgentEvaluationNativeOptionalCapabilityBootstrapCloseIngress,
  input: Readonly<{
    turnIndex: number;
    transportReceipt: AgentEvaluationTransportReceipt;
    responseDigest: CanonicalDigest;
    resultSpoolAad: AgentEvaluationProviderResultSpoolAad;
    encryptedResultSpool: AgentEvaluationProviderResultSpoolEnvelope;
  }>
): boolean =>
  isAgentEvaluationNativeOptionalCapabilityBootstrapCloseIngress(ingress) &&
  sameCanonicalJson(
    Object.freeze({
      attemptId: ingress.attemptId,
      descriptorDigest: ingress.descriptorDigest,
      turnIndex: ingress.turnIndex,
      invocationId: ingress.invocationId,
      providerRequestDigest: ingress.providerRequestDigest,
      providerResponseDigest: ingress.providerResponseDigest,
      dispatchIntentDigest: ingress.dispatchIntentDigest,
      transportReceiptDigest: ingress.transportReceiptDigest,
      resultSpoolAADigest: ingress.resultSpoolAADigest,
      resultSpoolEnvelopeDigest: ingress.resultSpoolEnvelopeDigest,
      normalizedEventSetDigest: ingress.normalizedEventSetDigest,
    }),
    Object.freeze({
      attemptId: input.resultSpoolAad.attemptId,
      descriptorDigest: input.resultSpoolAad.descriptorDigest,
      turnIndex: input.turnIndex,
      invocationId: input.transportReceipt.invocationId,
      providerRequestDigest: input.transportReceipt.requestDigest,
      providerResponseDigest: input.responseDigest,
      dispatchIntentDigest: input.transportReceipt.dispatchIntentDigest,
      transportReceiptDigest: input.transportReceipt.receiptDigest,
      resultSpoolAADigest: input.encryptedResultSpool.aadDigest,
      resultSpoolEnvelopeDigest: input.encryptedResultSpool.envelopeDigest,
      normalizedEventSetDigest: input.resultSpoolAad.normalizedEventSetDigest,
    })
  );
