import { isAgentCanonicalDigest } from '@prodivix/ai';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import { createEnvironmentAgentEvaluationOwnerStateQueryClient } from './ownerStateQueryClient';
import { createEnvironmentAgentEvaluationOwnerStateIngressClient } from './ownerStateIngressClient';
import { createEnvironmentProductionAgentEvaluationControlledWorkspaceOwnerReadAuthority } from './productionControlledWorkspaceOwnerRead';
import {
  createEnvironmentProductionControlledWorkspaceDirectAuthority,
  type ProductionControlledWorkspaceOrphanRetirementAuthority,
} from './productionControlledWorkspaceDirectAuthority';
import {
  createProductionControlledWorkspaceSessionEngine,
  type ProductionControlledWorkspaceTransactionSessionAuthority,
} from './productionControlledWorkspaceSessionEngine';
import {
  createAgentEvaluationOwnerAuthorityResourceRetirementReceipt,
  type AgentEvaluationProductionFullAttemptOwnerAuthorityPorts,
  type AgentEvaluationProductionOwnerAuthorityPorts,
  type AgentEvaluationProductionPreplanOwnerAuthorityPorts,
} from './productionOwnerAuthoritySidecar';
import type {
  AgentEvaluationProductionOwnerAuthorityPortFactory,
  AgentEvaluationProductionOwnerAuthorityPortFactoryInput,
  AgentEvaluationProductionPurposeBoundOwnerAuthorityPortFactoryInput,
} from './productionOwnerAuthoritySidecarEnvironment';
import { createEnvironmentAgentEvaluationVerificationEvidenceOwnerEngine } from './productionVerificationEvidenceDirectAuthority';
import { createEnvironmentProductionControlledWorkspaceTransactionG3Authority } from './productionControlledWorkspaceG3EnvironmentAuthority';
import { createProductionControlledWorkspaceTransactionSessionAuthority } from './productionControlledWorkspaceTransactionSessionAuthority';
import { createProductionControlledWorkspaceOrphanRetirementAuthority } from './productionControlledWorkspaceOrphanRetirement';
import { createProductionAgentEvaluationAttemptOwnerAuthorityPortsFromEnvironment as createConcreteProductionAttemptOwnerAuthorityPortsFromEnvironment } from './productionAttemptOwnerAuthorityPorts';
import { createProductionAgentEvaluationWorkspaceVerificationOwnerAuthorityPorts } from './productionWorkspaceVerificationOwnerAuthorityPorts';

export type AgentEvaluationProductionWorkspaceVerificationOwnerAuthorityPorts =
  Pick<
    AgentEvaluationProductionFullAttemptOwnerAuthorityPorts,
    'controlledWorkspace' | 'verificationEvidence'
  > &
    Readonly<{
      close(): Promise<
        Readonly<{
          status: 'clean';
          residualResourceIds: Readonly<{
            controlledWorkspace: readonly [];
            verificationEvidence: readonly [];
          }>;
          residualCanaryIds: readonly [];
        }>
      >;
    }>;

export type AgentEvaluationProductionFullAttemptAuthorityPorts = Pick<
  AgentEvaluationProductionFullAttemptOwnerAuthorityPorts,
  'providerCapability' | 'attemptGrading'
> &
  Readonly<{
    purpose: 'full-attempt';
    close(): Promise<
      Readonly<{
        status: 'clean';
        residualResourceIds: Readonly<{
          providerCapability: readonly [];
          attemptGrading: readonly [];
        }>;
        residualCanaryIds: readonly [];
      }>
    >;
  }>;

export type AgentEvaluationProductionPreplanAuthorityPorts = Pick<
  AgentEvaluationProductionPreplanOwnerAuthorityPorts,
  | 'capabilityProbe'
  | 'capabilityProbeProviderResource'
  | 'capabilityProbeProviderResourceCleanup'
  | 'runtimeFactSourceRegistration'
> &
  Readonly<{
    purpose: 'preplan';
    close(): Promise<
      Readonly<{
        status: 'clean';
        residualResourceIds: Readonly<{
          capabilityProbe: readonly [];
          capabilityProbeProviderResource: readonly [];
          capabilityProbeProviderResourceCleanup: readonly [];
          runtimeFactSourceRegistration: readonly [];
        }>;
        residualCanaryIds: readonly [];
      }>
    >;
  }>;

export type AgentEvaluationProductionAttemptOwnerAuthorityPorts =
  | AgentEvaluationProductionPreplanAuthorityPorts
  | AgentEvaluationProductionFullAttemptAuthorityPorts;

export type AgentEvaluationProductionWorkspaceVerificationOwnerAuthorityPortFactory =
  (
    input: AgentEvaluationProductionOwnerAuthorityPortFactoryInput
  ) => Promise<AgentEvaluationProductionWorkspaceVerificationOwnerAuthorityPorts>;

export type AgentEvaluationProductionAttemptOwnerAuthorityPortFactory = (
  input: AgentEvaluationProductionPurposeBoundOwnerAuthorityPortFactoryInput
) => Promise<AgentEvaluationProductionAttemptOwnerAuthorityPorts>;

export type ComposeProductionAgentEvaluationOwnerAuthorityPortsInput =
  Readonly<{
    createWorkspaceVerificationAuthorities: AgentEvaluationProductionWorkspaceVerificationOwnerAuthorityPortFactory;
    createAttemptAuthorities: AgentEvaluationProductionAttemptOwnerAuthorityPortFactory;
  }>;

/**
 * Build-time owned dependencies for the stateful Workspace session. The
 * factory takes ownership of both resources as soon as it is called.
 */
export type ProductionAgentEvaluationWorkspaceVerificationEnvironmentAuthorities =
  Readonly<{
    controlledWorkspaceSessions: ProductionControlledWorkspaceTransactionSessionAuthority;
    orphanRetirement: ProductionControlledWorkspaceOrphanRetirementAuthority;
    fetch?: typeof fetch;
  }>;

const unavailable = (owner: string): never => {
  throw new TypeError(
    `G4_OWNER_AUTHORITY_CONCRETE_PORTS_UNAVAILABLE: ${owner} production owner is unavailable.`
  );
};

const closeAfterCompositionFailure = async (
  caught: unknown,
  message: string,
  closers: readonly (() => Promise<unknown>)[]
): Promise<never> => {
  const results = await Promise.allSettled(closers.map((close) => close()));
  const cleanupFailures = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : []
  );
  if (cleanupFailures.length > 0) {
    throw new AggregateError([caught, ...cleanupFailures], message);
  }
  throw caught;
};

const exactWorkspaceVerificationRetirement = Object.freeze({
  status: 'clean' as const,
  residualResourceIds: Object.freeze({
    controlledWorkspace: Object.freeze([]) as readonly [],
    verificationEvidence: Object.freeze([]) as readonly [],
  }),
  residualCanaryIds: Object.freeze([]) as readonly [],
});

const exactAttemptRetirement = Object.freeze({
  status: 'clean' as const,
  residualResourceIds: Object.freeze({
    providerCapability: Object.freeze([]) as readonly [],
    attemptGrading: Object.freeze([]) as readonly [],
  }),
  residualCanaryIds: Object.freeze([]) as readonly [],
});

/**
 * Joins the Workspace/Verification lifecycle with independently owned provider
 * capability and grading ports. The join owns shutdown ordering and emits the
 * single four-family retirement receipt required by the loopback sidecar.
 */
export const composeProductionAgentEvaluationOwnerAuthorityPorts = async (
  input: AgentEvaluationProductionPurposeBoundOwnerAuthorityPortFactoryInput,
  factories: ComposeProductionAgentEvaluationOwnerAuthorityPortsInput
): Promise<AgentEvaluationProductionOwnerAuthorityPorts> => {
  if (input.purpose === 'preplan') {
    const attempts = await factories.createAttemptAuthorities(input);
    if (attempts.purpose !== 'preplan') {
      await attempts.close();
      return unavailable('preplan purpose-bound owner authority composition');
    }
    const authorityPorts = Object.freeze({
      purpose: 'preplan' as const,
      capabilityProbe: attempts.capabilityProbe,
      capabilityProbeProviderResource: attempts.capabilityProbeProviderResource,
      capabilityProbeProviderResourceCleanup:
        attempts.capabilityProbeProviderResourceCleanup,
      runtimeFactSourceRegistration: attempts.runtimeFactSourceRegistration,
    });
    let closePromise:
      | Promise<
          Awaited<
            ReturnType<AgentEvaluationProductionOwnerAuthorityPorts['close']>
          >
        >
      | undefined;
    return Object.freeze({
      ...authorityPorts,
      close() {
        closePromise ??= (async () => {
          const retirement = await attempts.close();
          const expected = Object.freeze({
            status: 'clean' as const,
            residualResourceIds: Object.freeze({
              capabilityProbe: Object.freeze([]) as readonly [],
              capabilityProbeProviderResource: Object.freeze([]) as readonly [],
              capabilityProbeProviderResourceCleanup: Object.freeze(
                []
              ) as readonly [],
              runtimeFactSourceRegistration: Object.freeze([]) as readonly [],
            }),
            residualCanaryIds: Object.freeze([]) as readonly [],
          });
          if (!sameCanonicalJson(retirement, expected)) {
            throw new TypeError(
              'G4_OWNER_AUTHORITY_RESOURCE_RETIREMENT_INVALID'
            );
          }
          return createAgentEvaluationOwnerAuthorityResourceRetirementReceipt(
            Object.freeze({
              ...authorityPorts,
              close: () => closePromise!,
            })
          );
        })();
        return closePromise;
      },
    });
  }
  const workspaceVerification =
    await factories.createWorkspaceVerificationAuthorities(input);
  let attempts: AgentEvaluationProductionAttemptOwnerAuthorityPorts;
  try {
    attempts = await factories.createAttemptAuthorities(input);
    if (attempts.purpose !== 'full-attempt') {
      await attempts.close();
      return closeAfterCompositionFailure(
        new TypeError('G4_OWNER_AUTHORITY_PURPOSE_MISMATCH'),
        'Full-attempt authority purpose and Workspace cleanup both failed.',
        [() => workspaceVerification.close()]
      );
    }
  } catch (caught) {
    try {
      await workspaceVerification.close();
    } catch (cleanup) {
      throw new AggregateError(
        [caught, cleanup],
        'Attempt authority composition and Workspace cleanup both failed.'
      );
    }
    throw caught;
  }

  let closePromise:
    | Promise<
        Awaited<
          ReturnType<AgentEvaluationProductionOwnerAuthorityPorts['close']>
        >
      >
    | undefined;
  const authorityPorts = Object.freeze({
    purpose: 'full-attempt' as const,
    controlledWorkspace: workspaceVerification.controlledWorkspace,
    verificationEvidence: workspaceVerification.verificationEvidence,
    providerCapability: attempts.providerCapability,
    attemptGrading: attempts.attemptGrading,
  });
  const ports = Object.freeze({
    ...authorityPorts,
    close() {
      closePromise ??= (async () => {
        const [workspaceRetirement, attemptRetirement] = await Promise.all([
          workspaceVerification.close(),
          attempts.close(),
        ]);
        if (
          !sameCanonicalJson(
            workspaceRetirement,
            exactWorkspaceVerificationRetirement
          ) ||
          !sameCanonicalJson(attemptRetirement, exactAttemptRetirement)
        ) {
          throw new TypeError('G4_OWNER_AUTHORITY_RESOURCE_RETIREMENT_INVALID');
        }
        return createAgentEvaluationOwnerAuthorityResourceRetirementReceipt(
          Object.freeze({
            ...authorityPorts,
            close: () => closePromise!,
          })
        );
      })();
      return closePromise;
    },
  }) satisfies AgentEvaluationProductionOwnerAuthorityPorts;
  return ports;
};

/**
 * Wires the repo-owned 8790 stateless ledger, owner-state/CAS reads and the
 * independent Backend Verification owner around one build-time frozen
 * Workspace transaction/session authority. No request returns through 8791.
 */
export const createProductionAgentEvaluationWorkspaceVerificationOwnerAuthorityPortsFromEnvironmentAuthorities =
  async (
    input: AgentEvaluationProductionOwnerAuthorityPortFactoryInput,
    authorities: ProductionAgentEvaluationWorkspaceVerificationEnvironmentAuthorities
  ): Promise<AgentEvaluationProductionWorkspaceVerificationOwnerAuthorityPorts> => {
    let stateless: Awaited<
      ReturnType<
        typeof createEnvironmentProductionControlledWorkspaceDirectAuthority
      >
    >;
    try {
      stateless =
        await createEnvironmentProductionControlledWorkspaceDirectAuthority({
          environment: input.environment,
          forbiddenCanaries: input.forbiddenCanaries,
          orphanRetirement: authorities.orphanRetirement,
          ...(authorities.fetch ? { fetch: authorities.fetch } : {}),
        });
    } catch (caught) {
      return closeAfterCompositionFailure(
        caught,
        'Controlled Workspace ledger probe and session retirement both failed.',
        [() => authorities.controlledWorkspaceSessions.close()]
      );
    }

    let controlledWorkspace: ReturnType<
      typeof createProductionControlledWorkspaceSessionEngine
    >;
    try {
      controlledWorkspace = createProductionControlledWorkspaceSessionEngine({
        orphanRead:
          createEnvironmentProductionAgentEvaluationControlledWorkspaceOwnerReadAuthority(
            {
              environment: input.environment,
              forbiddenCanaries: input.forbiddenCanaries,
              ...(authorities.fetch ? { fetch: authorities.fetch } : {}),
            }
          ),
        ownerStateQueryFor(request) {
          if (!isAgentCanonicalDigest(request.planDigest)) {
            return unavailable('controlled Workspace owner-state query scope');
          }
          return createEnvironmentAgentEvaluationOwnerStateQueryClient({
            namespaceId: request.namespaceId,
            planDigest: request.planDigest,
            repositoryCommit: request.repositoryCommit,
            forbiddenCanaries: input.forbiddenCanaries,
            environment: input.environment,
            ...(authorities.fetch ? { fetch: authorities.fetch } : {}),
          });
        },
        sessions: authorities.controlledWorkspaceSessions,
        stateless,
        forbiddenCanaries: input.forbiddenCanaries,
      });
    } catch (caught) {
      return closeAfterCompositionFailure(
        caught,
        'Controlled Workspace composition and resource retirement both failed.',
        [
          () => authorities.controlledWorkspaceSessions.close(),
          () => stateless.close(),
        ]
      );
    }

    let verificationEvidence: Awaited<
      ReturnType<
        typeof createEnvironmentAgentEvaluationVerificationEvidenceOwnerEngine
      >
    >;
    try {
      verificationEvidence =
        await createEnvironmentAgentEvaluationVerificationEvidenceOwnerEngine({
          environment: input.environment,
          forbiddenCanaries: input.forbiddenCanaries,
          ...(authorities.fetch ? { fetch: authorities.fetch } : {}),
        });
    } catch (caught) {
      return closeAfterCompositionFailure(
        caught,
        'Verification Evidence composition and Workspace retirement both failed.',
        [() => controlledWorkspace.close()]
      );
    }

    try {
      return createProductionAgentEvaluationWorkspaceVerificationOwnerAuthorityPorts(
        {
          ...input,
          controlledWorkspace,
          verificationEvidence,
        }
      );
    } catch (caught) {
      return closeAfterCompositionFailure(
        caught,
        'Workspace/Verification port composition and retirement both failed.',
        [() => controlledWorkspace.close(), () => verificationEvidence.close()]
      );
    }
  };

/** Canonical full-attempt Workspace/Verification production composition. */
export const createProductionAgentEvaluationWorkspaceVerificationOwnerAuthorityPortsFromEnvironment: AgentEvaluationProductionWorkspaceVerificationOwnerAuthorityPortFactory =
  async (input) => {
    const g3 =
      await createEnvironmentProductionControlledWorkspaceTransactionG3Authority(
        {
          environment: input.environment,
          forbiddenCanaries: input.forbiddenCanaries,
        }
      );
    let sessions: ProductionControlledWorkspaceTransactionSessionAuthority;
    try {
      sessions = createProductionControlledWorkspaceTransactionSessionAuthority(
        {
          g3,
          forbiddenCanaries: input.forbiddenCanaries,
        }
      );
    } catch (caught) {
      return closeAfterCompositionFailure(
        caught,
        'Controlled Workspace session construction and G3 retirement both failed.',
        [() => g3.close()]
      );
    }
    let orphanRetirement: ProductionControlledWorkspaceOrphanRetirementAuthority;
    try {
      orphanRetirement =
        createProductionControlledWorkspaceOrphanRetirementAuthority({
          sessions,
          ownerStateQueryFor(request) {
            if (!isAgentCanonicalDigest(request.planDigest)) {
              return unavailable('controlled Workspace orphan query scope');
            }
            return createEnvironmentAgentEvaluationOwnerStateQueryClient({
              namespaceId: request.namespaceId,
              planDigest: request.planDigest,
              repositoryCommit: request.repositoryCommit,
              forbiddenCanaries: input.forbiddenCanaries,
              environment: input.environment,
            });
          },
          createIngressClient(request) {
            if (!isAgentCanonicalDigest(request.planDigest)) {
              return unavailable('controlled Workspace orphan ingress scope');
            }
            return createEnvironmentAgentEvaluationOwnerStateIngressClient({
              namespaceId: request.namespaceId,
              planDigest: request.planDigest,
              repositoryCommit: request.repositoryCommit,
              forbiddenCanaries: input.forbiddenCanaries,
              environment: input.environment,
            });
          },
          forbiddenCanaries: input.forbiddenCanaries,
        });
    } catch (caught) {
      return closeAfterCompositionFailure(
        caught,
        'Controlled Workspace orphan authority construction and session retirement both failed.',
        [() => sessions.close()]
      );
    }
    return createProductionAgentEvaluationWorkspaceVerificationOwnerAuthorityPortsFromEnvironmentAuthorities(
      input,
      { controlledWorkspaceSessions: sessions, orphanRetirement }
    );
  };

/** Provider and grading owners remain a separate package boundary. */
export const createProductionAgentEvaluationAttemptOwnerAuthorityPortsFromEnvironment: AgentEvaluationProductionAttemptOwnerAuthorityPortFactory =
  createConcreteProductionAttemptOwnerAuthorityPortsFromEnvironment;

/** Fixed repo-owned composition used by the production executable. */
export const createProductionAgentEvaluationOwnerAuthorityPortsFromEnvironment: AgentEvaluationProductionOwnerAuthorityPortFactory =
  (input) =>
    composeProductionAgentEvaluationOwnerAuthorityPorts(input, {
      createWorkspaceVerificationAuthorities:
        createProductionAgentEvaluationWorkspaceVerificationOwnerAuthorityPortsFromEnvironment,
      createAttemptAuthorities:
        createProductionAgentEvaluationAttemptOwnerAuthorityPortsFromEnvironment,
    });
