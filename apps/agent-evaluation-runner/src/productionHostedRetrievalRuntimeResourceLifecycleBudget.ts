import {
  createAgentCapabilityProbeProgram,
  createAgentHostedRetrievalRuntimeResourceBudgetReservationAuthority,
  createAgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection,
  createAgentHostedRetrievalRuntimeResourceLifecycleBudgetDemand,
  digestAgentHostedRetrievalRuntimeResourceLifecycleBudgetDemand,
  isAgentBudgetLedgerState,
  isAgentControlInstant,
  reserveAgentBudget,
  resolveAgentCapabilityProbePublicResource,
  settleAgentBudget,
  type AgentBudgetDemand,
  type AgentBudgetLedgerState,
  type AgentHostedRetrievalRuntimeResourceBudgetReservationAuthority,
  type AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection,
  type AgentHostedRetrievalRuntimeResourceRegistrationIntent,
  type AgentModelEvaluationPlan,
  type Instant,
} from '@prodivix/ai';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import {
  createEnvironmentAgentEvaluationLedgerClient,
  type CreateEnvironmentAgentEvaluationLedgerClientInput,
} from './ledgerClient';
import type { AgentEvaluationHostedRetrievalRuntimeResourceBudgetAuthoritySource } from './productionHostedRetrievalRuntimeResourceLifecycleOwner';

export type AgentEvaluationHostedRetrievalRuntimeResourceLifecycleBudgetClosureSource =
  Readonly<{
    settle(
      input: Readonly<{
        authority: AgentHostedRetrievalRuntimeResourceBudgetReservationAuthority;
        demand: AgentBudgetDemand;
        settledAt: Instant;
      }>
    ): Promise<AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection>;
    readClosure(
      input: Readonly<{
        authority: AgentHostedRetrievalRuntimeResourceBudgetReservationAuthority;
        demand: AgentBudgetDemand;
      }>
    ): Promise<AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection>;
  }>;

const invalid = (): never => {
  throw new TypeError('Hosted lifecycle budget authority is invalid.');
};

const demandFor = (
  intent: AgentHostedRetrievalRuntimeResourceRegistrationIntent
): AgentBudgetDemand => {
  const program = createAgentCapabilityProbeProgram({
    capabilityProfileId: intent.capabilityProfileId,
    capabilityProfileDigest: intent.capabilityProfileDigest,
  });
  const material = resolveAgentCapabilityProbePublicResource(program);
  if (
    material === null ||
    program.programDigest !== intent.probeProgramDigest ||
    material.descriptor.descriptorDigest !==
      intent.publicResourceDescriptorDigest
  ) {
    return invalid();
  }
  return createAgentHostedRetrievalRuntimeResourceLifecycleBudgetDemand(
    intent,
    material
  );
};

const exactState = (value: unknown): AgentBudgetLedgerState =>
  isAgentBudgetLedgerState(value as AgentBudgetLedgerState)
    ? (value as AgentBudgetLedgerState)
    : invalid();

export const createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceLifecycleBudgetAuthority =
  (input: {
    namespaceId: string;
    plan: AgentModelEvaluationPlan;
    environment?: CreateEnvironmentAgentEvaluationLedgerClientInput['environment'];
    fetch?: typeof fetch;
    clock?: () => Date;
  }): AgentEvaluationHostedRetrievalRuntimeResourceBudgetAuthoritySource &
    AgentEvaluationHostedRetrievalRuntimeResourceLifecycleBudgetClosureSource => {
    const client = createEnvironmentAgentEvaluationLedgerClient({
      environment: input.environment ?? process.env,
      ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
      planDigest: input.plan.planDigest,
    });
    if (
      client.scope.namespace !== input.namespaceId ||
      client.scope.repositoryCommit !== input.plan.repositoryCommit
    )
      return invalid();
    const clock = input.clock ?? (() => new Date());

    const load = async (): Promise<AgentBudgetLedgerState> =>
      exactState(await client.getBudget());

    return Object.freeze({
      async reserve({ plan, registrationIntent, reservationId }) {
        if (!sameCanonicalJson(plan, input.plan)) return invalid();
        const demand = demandFor(registrationIntent);
        const demandDigest =
          digestAgentHostedRetrievalRuntimeResourceLifecycleBudgetDemand(
            demand
          );
        let state = await load();
        let reservation = state.reservations.find(
          (candidate) => candidate.reservationId === reservationId
        );
        if (reservation === undefined) {
          const observed = clock();
          if (!Number.isFinite(observed.getTime())) return invalid();
          const reservedAt = observed.toISOString() as Instant;
          const expected = reserveAgentBudget(state, {
            reservationId,
            expectedRevision: state.revision,
            demand,
            reservedAt,
          });
          if (!expected.ok) return invalid();
          try {
            await client.reserveBudget(
              reservationId,
              state.revision,
              reservedAt,
              demand
            );
          } catch {
            // The exact read below distinguishes an ACK loss from no commit.
          }
          state = await load();
          reservation = state.reservations.find(
            (candidate) => candidate.reservationId === reservationId
          );
          if (reservation === undefined) {
            await client.reserveBudget(
              reservationId,
              expected.state.revision - 1,
              reservedAt,
              demand
            );
            state = await load();
            reservation = state.reservations.find(
              (candidate) => candidate.reservationId === reservationId
            );
          }
        }
        if (
          reservation === undefined ||
          !sameCanonicalJson(reservation.demand, demand) ||
          reservation.demandDigest !== demandDigest ||
          !isAgentControlInstant(reservation.reservedAt)
        )
          return invalid();
        return createAgentHostedRetrievalRuntimeResourceBudgetReservationAuthority(
          {
            namespaceId: input.namespaceId,
            planDigest: input.plan.planDigest,
            reservePolicyDigest: input.plan.budget.reservePolicyDigest,
            budgetDigest: input.plan.budget.budgetDigest,
            reservationId,
            ledgerRevision: state.revision,
            demandDigest,
            demandBytesDigest: demandDigest,
            reservedAt: reservation.reservedAt,
          }
        );
      },
      async settle({ authority, demand, settledAt }) {
        if (
          authority.namespaceId !== input.namespaceId ||
          authority.planDigest !== input.plan.planDigest ||
          !isAgentControlInstant(settledAt)
        )
          return invalid();
        let state = await load();
        let reservation = state.reservations.find(
          ({ reservationId }) => reservationId === authority.reservationId
        );
        if (reservation === undefined) return invalid();
        if (reservation.status !== 'settled') {
          const expected = settleAgentBudget(state, {
            reservationId: authority.reservationId,
            expectedRevision: state.revision,
            actual: demand,
            settledAt,
          });
          if (!expected.ok || expected.reservation.settlement === undefined) {
            return invalid();
          }
          try {
            await client.settleBudget(
              authority.reservationId,
              state.revision,
              expected.reservation.settlement
            );
          } catch {
            // Readback below owns ACK-loss recovery.
          }
          state = await load();
          reservation = state.reservations.find(
            ({ reservationId }) => reservationId === authority.reservationId
          );
        }
        if (
          reservation?.status !== 'settled' ||
          reservation.settlement === undefined ||
          !sameCanonicalJson(reservation.demand, demand) ||
          reservation.settlement.settledAt !== settledAt
        )
          return invalid();
        return createAgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection(
          authority,
          demand,
          reservation.settlement
        );
      },
      async readClosure({ authority, demand }) {
        if (
          authority.namespaceId !== input.namespaceId ||
          authority.planDigest !== input.plan.planDigest
        )
          return invalid();
        const state = await load();
        const reservation = state.reservations.find(
          ({ reservationId }) => reservationId === authority.reservationId
        );
        if (
          reservation?.status !== 'settled' ||
          reservation.settlement === undefined ||
          !sameCanonicalJson(reservation.demand, demand)
        )
          return invalid();
        return createAgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection(
          authority,
          demand,
          reservation.settlement
        );
      },
    });
  };
