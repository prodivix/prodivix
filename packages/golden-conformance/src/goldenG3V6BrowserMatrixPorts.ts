import { sameCanonicalJson } from '@prodivix/shared/canonical';
import type { VerificationAbortSignal } from '@prodivix/verification';
import type {
  BrowserSecurityObservationAuthorityPort,
  BrowserVerificationTargetLease,
  BrowserVerificationTargetLeasePort,
} from '@prodivix/verification-browser';
import type {
  GoldenG3V6ProductionSecurityAuthority,
  GoldenG3V6ProductionSecurityResolutionAuditSnapshot,
} from './goldenG3V6ProductionSecurityAuthority';

export const GOLDEN_G3_V6_INACTIVE_SIGNAL: VerificationAbortSignal =
  Object.freeze({
    aborted: false,
    subscribe: () => () => undefined,
  });

type MutableLease = {
  lease: BrowserVerificationTargetLease;
  acquired: boolean;
  released: boolean;
  acquireFailureReasons?: readonly string[];
};

export type GoldenG3V6TargetLeaseRegistry = Readonly<{
  port: BrowserVerificationTargetLeasePort;
  register(lease: BrowserVerificationTargetLease): void;
  assertReleased(attemptId: string): void;
  forceDelete(attemptId: string): void;
  snapshot(): Readonly<{
    registered: number;
    acquired: number;
    released: number;
  }>;
}>;

export const createGoldenG3V6TargetLeaseRegistry =
  (): GoldenG3V6TargetLeaseRegistry => {
    const leases = new Map<string, MutableLease>();
    return Object.freeze({
      register(lease) {
        if (leases.has(lease.binding.attemptId)) {
          throw new Error(
            `Golden V6 target lease "${lease.binding.attemptId}" is already registered.`
          );
        }
        leases.set(lease.binding.attemptId, {
          lease,
          acquired: false,
          released: false,
        });
      },
      assertReleased(attemptId) {
        const state = leases.get(attemptId);
        if (!state || !state.acquired || !state.released) {
          const detail = state?.acquireFailureReasons?.join(',') ?? 'none';
          throw new Error(
            `Golden V6 target lease "${attemptId}" was not cleanly acquired and released (acquireFailureReasons=${detail}).`
          );
        }
      },
      forceDelete(attemptId) {
        leases.delete(attemptId);
      },
      port: Object.freeze({
        acquire: async (
          input: Parameters<BrowserVerificationTargetLeasePort['acquire']>[0],
          signal: Parameters<BrowserVerificationTargetLeasePort['acquire']>[1]
        ) => {
          const state = leases.get(input.attemptId);
          const failureReasons = Object.freeze([
            ...(signal.aborted ? ['aborted'] : []),
            ...(!state ? ['unregistered'] : []),
            ...(state?.acquired ? ['already-acquired'] : []),
            ...(state?.released ? ['already-released'] : []),
            ...(state && state.lease.binding.generation !== input.generation
              ? ['generation-drift']
              : []),
            ...(state &&
            state.lease.binding.executableSnapshotDigest !==
              input.executableSnapshotDigest
              ? ['snapshot-drift']
              : []),
            ...(state &&
            state.lease.bindingDigest !== input.expectedBindingDigest
              ? ['binding-digest-drift']
              : []),
            ...(state && state.lease.binding.targetId !== input.cell.targetId
              ? ['target-drift']
              : []),
          ]);
          if (failureReasons.length > 0) {
            if (state) state.acquireFailureReasons = failureReasons;
            throw new Error(
              `Golden V6 target lease "${input.attemptId}" is unavailable or drifted (${failureReasons.join(',')}).`
            );
          }
          if (!state) {
            throw new Error(
              `Golden V6 target lease "${input.attemptId}" was not registered.`
            );
          }
          state.acquired = true;
          return state.lease;
        },
        release: async (
          lease: Parameters<BrowserVerificationTargetLeasePort['release']>[0],
          signal: Parameters<BrowserVerificationTargetLeasePort['release']>[1]
        ) => {
          const state = leases.get(lease.binding.attemptId);
          if (
            signal.aborted ||
            !state ||
            !state.acquired ||
            state.released ||
            !sameCanonicalJson(state.lease, lease)
          ) {
            return Object.freeze({
              status: 'failed' as const,
              residualCanaryIds: Object.freeze([
                `canary:lease:${lease.binding.attemptId}`,
              ]),
              diagnosticCodes: Object.freeze(['GOLDEN_TARGET_LEASE_DRIFT']),
            });
          }
          state.released = true;
          return Object.freeze({
            status: 'clean' as const,
            residualCanaryIds: Object.freeze([]),
            diagnosticCodes: Object.freeze([]),
          });
        },
      }),
      snapshot: () => {
        const values = [...leases.values()];
        return Object.freeze({
          registered: values.length,
          acquired: values.filter(({ acquired }) => acquired).length,
          released: values.filter(({ released }) => released).length,
        });
      },
    });
  };

export type GoldenG3V6SecurityAuthorityRegistry = Readonly<{
  port: BrowserSecurityObservationAuthorityPort;
  register(
    attemptId: string,
    authority: GoldenG3V6ProductionSecurityAuthority
  ): void;
  assertExact(
    attemptId: string
  ): GoldenG3V6ProductionSecurityResolutionAuditSnapshot;
  forceDelete(attemptId: string): void;
  size(): number;
}>;

export const createGoldenG3V6SecurityAuthorityRegistry =
  (): GoldenG3V6SecurityAuthorityRegistry => {
    const authorities = new Map<
      string,
      GoldenG3V6ProductionSecurityAuthority
    >();
    return Object.freeze({
      register(attemptId, authority) {
        if (authorities.has(attemptId)) {
          throw new Error(
            `Golden V6 security authority "${attemptId}" is already registered.`
          );
        }
        authorities.set(attemptId, authority);
      },
      assertExact(attemptId) {
        const authority = authorities.get(attemptId);
        if (!authority) {
          throw new Error(
            `Golden V6 security authority "${attemptId}" is not registered.`
          );
        }
        return authority.resolutionAudit.assertExact();
      },
      forceDelete(attemptId) {
        authorities.delete(attemptId);
      },
      size: () => authorities.size,
      port: Object.freeze({
        resolve: async (
          request: Parameters<
            BrowserSecurityObservationAuthorityPort['resolve']
          >[0],
          signal: Parameters<
            BrowserSecurityObservationAuthorityPort['resolve']
          >[1]
        ) => {
          const authority = authorities.get(request.binding.attemptId);
          return authority?.authority.resolve(request, signal);
        },
      }),
    });
  };
