import type { AgentActionRegistrySnapshot } from '../proposal/agentProposal.types';
import { decodeAgentControlFact } from '../control/agentControlCodec';
import type {
  AgentAuditExport,
  AgentControlEvent,
  AgentRunSnapshot,
  AgentTaskRecord,
} from '../control/agentControl.types';
import { decodeAgentProposalFact } from '../proposal/agentProposalCodec';
import type {
  AgentProposalPlanningReceipt,
  AgentWorkspaceMutationReceipt,
} from '../proposal/agentProposal.types';
import type {
  AgentActionProposal,
  AgentApprovalDecision,
  AgentProposalPreview,
} from '../domain/agent.types';
import { decodeAgentVerificationFact } from '../verification/agentVerificationCodec';
import type {
  AgentCommittedVerificationPlanBinding,
  AgentRepairRoundReceipt,
  AgentVerificationClosureReceipt,
} from '../verification/agentVerification.types';
import { decodeAgentProductFact } from './agentProductCodec';
import type {
  AgentProductFact,
  AgentProductLedger,
  AgentProductView,
} from './agentProduct.types';
import { createAgentProductView } from './agentProduct';

export type AgentProductLedgerBundleDecodeResult =
  | Readonly<{ ok: true; value: AgentProductView }>
  | Readonly<{ ok: false; message: string }>;

const requiredKeys = Object.freeze([
  'task',
  'run',
  'events',
  'mutations',
  'verificationBindings',
  'verificationClosures',
  'repairRounds',
  'commands',
  'currentRevision',
  'actorAuthorized',
]);
const optionalKeys = new Set([
  'proposal',
  'planning',
  'preview',
  'approval',
  'supplement',
  'audit',
]);

const isExactLedgerObject = (
  value: unknown
): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return (
    requiredKeys.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => requiredKeys.includes(key) || optionalKeys.has(key))
  );
};

const failure = (message: string): AgentProductLedgerBundleDecodeResult =>
  Object.freeze({ ok: false, message });

type ControlValueByType = {
  'task-record': AgentTaskRecord;
  'run-snapshot': AgentRunSnapshot;
  'run-event': AgentControlEvent;
  'audit-export': AgentAuditExport;
};

type ProposalValueByType = {
  proposal: AgentActionProposal;
  planning: AgentProposalPlanningReceipt;
  preview: AgentProposalPreview;
  approval: AgentApprovalDecision;
  'workspace-mutation-receipt': AgentWorkspaceMutationReceipt;
};

type VerificationValueByType = {
  'committed-plan-binding': AgentCommittedVerificationPlanBinding;
  'verification-closure-receipt': AgentVerificationClosureReceipt;
  'repair-round-receipt': AgentRepairRoundReceipt;
};

type ProductValueByType = {
  'product-supplement': Extract<
    AgentProductFact,
    { factType: 'product-supplement' }
  >['value'];
  'run-user-command': Extract<
    AgentProductFact,
    { factType: 'run-user-command' }
  >['value'];
};

const controlValue = <TType extends keyof ControlValueByType>(
  input: unknown,
  expectedType: TType
): ControlValueByType[TType] => {
  const decoded = decodeAgentControlFact(input);
  if (!decoded.ok || decoded.value.factType !== expectedType) {
    throw new TypeError(`Expected Agent control fact ${expectedType}.`);
  }
  return decoded.value.value as unknown as ControlValueByType[TType];
};

const proposalValue = <TType extends keyof ProposalValueByType>(
  registry: AgentActionRegistrySnapshot,
  input: unknown,
  expectedType: TType
): ProposalValueByType[TType] => {
  const decoded = decodeAgentProposalFact(registry, input);
  if (!decoded.ok || decoded.value.factType !== expectedType) {
    throw new TypeError(`Expected Agent proposal fact ${expectedType}.`);
  }
  return decoded.value.value as unknown as ProposalValueByType[TType];
};

const verificationValue = <TType extends keyof VerificationValueByType>(
  input: unknown,
  expectedType: TType
): VerificationValueByType[TType] => {
  const decoded = decodeAgentVerificationFact(input);
  if (!decoded.ok || decoded.value.factType !== expectedType) {
    throw new TypeError(`Expected Agent verification fact ${expectedType}.`);
  }
  return decoded.value.value as unknown as VerificationValueByType[TType];
};

const productValue = <TType extends keyof ProductValueByType>(
  input: unknown,
  expectedType: TType
): ProductValueByType[TType] => {
  const decoded = decodeAgentProductFact(input);
  if (!decoded.ok || decoded.value.factType !== expectedType) {
    throw new TypeError(`Expected Agent product fact ${expectedType}.`);
  }
  return decoded.value.value as unknown as ProductValueByType[TType];
};

/** Decodes the authenticated backend ledger into the one Web/CLI projection. */
export const decodeAgentProductLedgerBundle = (
  registry: AgentActionRegistrySnapshot,
  input: unknown
): AgentProductLedgerBundleDecodeResult => {
  try {
    const envelope = input as Record<string, unknown>;
    if (
      typeof envelope !== 'object' ||
      envelope === null ||
      Array.isArray(envelope) ||
      Object.keys(envelope).length !== 1 ||
      !Object.hasOwn(envelope, 'ledger') ||
      !isExactLedgerObject(envelope.ledger)
    ) {
      return failure('Agent product ledger response is malformed.');
    }
    const wire = envelope.ledger;
    if (
      !Array.isArray(wire.events) ||
      !Array.isArray(wire.mutations) ||
      !Array.isArray(wire.verificationBindings) ||
      !Array.isArray(wire.verificationClosures) ||
      !Array.isArray(wire.repairRounds) ||
      !Array.isArray(wire.commands) ||
      typeof wire.actorAuthorized !== 'boolean'
    ) {
      return failure('Agent product ledger collections are malformed.');
    }
    const task = controlValue(wire.task, 'task-record');
    const run = controlValue(wire.run, 'run-snapshot');
    const ledger: AgentProductLedger = Object.freeze({
      task,
      run,
      events: Object.freeze(
        wire.events.map((fact) => controlValue(fact, 'run-event'))
      ),
      ...(wire.proposal
        ? {
            proposal: proposalValue(registry, wire.proposal, 'proposal'),
          }
        : {}),
      ...(wire.planning
        ? {
            planning: proposalValue(registry, wire.planning, 'planning'),
          }
        : {}),
      ...(wire.preview
        ? {
            preview: proposalValue(registry, wire.preview, 'preview'),
          }
        : {}),
      ...(wire.approval
        ? {
            approval: proposalValue(registry, wire.approval, 'approval'),
          }
        : {}),
      mutations: Object.freeze(
        wire.mutations.map((fact) =>
          proposalValue(registry, fact, 'workspace-mutation-receipt')
        )
      ),
      verificationBindings: Object.freeze(
        wire.verificationBindings.map((fact) =>
          verificationValue(fact, 'committed-plan-binding')
        )
      ),
      verificationClosures: Object.freeze(
        wire.verificationClosures.map((fact) =>
          verificationValue(fact, 'verification-closure-receipt')
        )
      ),
      repairRounds: Object.freeze(
        wire.repairRounds.map((fact) =>
          verificationValue(fact, 'repair-round-receipt')
        )
      ),
      ...(wire.supplement
        ? {
            supplement: productValue(wire.supplement, 'product-supplement'),
          }
        : {}),
      commands: Object.freeze(
        wire.commands.map((fact) => productValue(fact, 'run-user-command'))
      ),
      ...(wire.audit
        ? { audit: controlValue(wire.audit, 'audit-export') }
        : {}),
      currentRevision:
        wire.currentRevision as AgentProductLedger['currentRevision'],
      actorAuthorized: wire.actorAuthorized,
    });
    return Object.freeze({ ok: true, value: createAgentProductView(ledger) });
  } catch (error) {
    return failure(
      error instanceof Error
        ? error.message
        : 'Agent product ledger failed strict validation.'
    );
  }
};
