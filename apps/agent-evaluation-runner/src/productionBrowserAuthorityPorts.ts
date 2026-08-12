import { createRemoteDeterministicReplayProvider } from '@prodivix/runtime-remote';
import { digestVerificationValue } from '@prodivix/verification';
import {
  createProductionBrowserCanaryScanner,
  createProductionBrowserLoopbackPreviewHost,
  type ProductionBrowserCanaryScannerPort,
  type ProductionBrowserLoopbackPreviewHost,
  type ProductionBrowserLoopbackPreviewReservationInput,
  type ProductionBrowserPreviewHostPort,
  type ProductionBrowserPreviewHostReleaseResult,
  type ProductionBrowserRemoteExecutionEvidence,
  type ProductionBrowserRemoteRuntimeProviderPort,
} from '@prodivix/verification-browser';
import type { VerificationAbortSignal } from '@prodivix/verification';
import type { AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource } from './controlledWorkspaceG3CellAdapter';

const passiveAbortSignal = Object.freeze({
  aborted: false,
  subscribe: () => () => undefined,
});

export type ProductionAgentEvaluationBrowserPreviewAuthority = Readonly<{
  originFor(requestId: string): string | undefined;
  reserve(
    identity: ProductionBrowserLoopbackPreviewReservationInput,
    signal?: VerificationAbortSignal
  ): Promise<ProductionBrowserRemoteExecutionEvidence>;
  port: ProductionBrowserPreviewHostPort;
  drainAndDispose(): Promise<ProductionBrowserPreviewHostReleaseResult>;
}>;

/**
 * Thin runner composition over Verification Browser's loopback host owner. The
 * runner remembers only public request-to-origin identity for diagnostics; all
 * sockets, resource bytes, route validation, and bounded retirement remain in
 * the package-owned host.
 */
export const createProductionAgentEvaluationBrowserPreviewAuthority =
  (): ProductionAgentEvaluationBrowserPreviewAuthority => {
    const host: ProductionBrowserLoopbackPreviewHost =
      createProductionBrowserLoopbackPreviewHost();
    const origins = new Map<string, string>();
    return Object.freeze({
      originFor: (requestId: string) => origins.get(requestId),
      async reserve(identity, signal = passiveAbortSignal) {
        const evidence = await host.reserve(identity, signal);
        origins.set(identity.requestId, evidence.materializedOrigin);
        return evidence;
      },
      port: host,
      async drainAndDispose() {
        const result = await host.drainAndDispose();
        origins.clear();
        return result;
      },
    });
  };

export const PRODUCTION_AGENT_EVALUATION_BROWSER_SECRET_AUTHORITY_DIGEST =
  digestVerificationValue({
    format: 'prodivix.agent-evaluation-browser-secret-authority',
    version: 1,
    owner: '@prodivix/agent-evaluation-runner/server-only-canary-source',
    lifecycle: 'callback-bound',
    persistence: 'commitments-only',
  });

/** Callback-bound adapter over Verification Browser's canonical scanner. */
export const createProductionAgentEvaluationBrowserCanaryScanner = (
  forbiddenCanaries: AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource,
  secretAuthorityDigest = PRODUCTION_AGENT_EVALUATION_BROWSER_SECRET_AUTHORITY_DIGEST
): ProductionBrowserCanaryScannerPort =>
  createProductionBrowserCanaryScanner({
    secretAuthorityDigest,
    forbiddenCanaries,
  });

export const PRODUCTION_AGENT_EVALUATION_REMOTE_RUNTIME_PROVIDER_IMPLEMENTATION_DIGEST =
  digestVerificationValue({
    format: 'prodivix.agent-evaluation-production-remote-runtime-provider',
    version: 1,
    owner: '@prodivix/runtime-remote',
    providerId: 'prodivix.g4.remote.deterministic-replay',
    providerVersion: '1',
    controls: 'runtime-core-default-complete-set',
    maximumResetAttempts: 2,
    transport: 'browser-authority-required-hooks',
  });

export const createProductionAgentEvaluationRemoteRuntimeProvider =
  (): ProductionBrowserRemoteRuntimeProviderPort => {
    const providerId = 'prodivix.g4.remote.deterministic-replay';
    const providerVersion = '1';
    const implementationDigest =
      PRODUCTION_AGENT_EVALUATION_REMOTE_RUNTIME_PROVIDER_IMPLEMENTATION_DIGEST;
    return Object.freeze({
      providerId,
      providerVersion,
      implementationDigest,
      create: (hooks) =>
        createRemoteDeterministicReplayProvider({
          id: providerId,
          version: providerVersion,
          implementationDigest,
          maximumResetAttempts: 2,
          transport: Object.freeze({
            reset: hooks.reset,
            probe: hooks.probe,
            cleanup: hooks.cleanup,
            apply: async (request) => {
              const applied = await hooks.apply(request);
              return Object.freeze({
                appliedControlDigest: applied.appliedControlDigest,
                fontReady: applied.fontReady === true,
              });
            },
          }),
        }),
    });
  };
