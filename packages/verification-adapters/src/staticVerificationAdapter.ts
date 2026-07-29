import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  digestVerificationValue,
  normalizeVerificationAdapterDescriptor,
  type VerificationAdapter,
  type VerificationAdapterFactory,
  type VerificationAdapterPreparedInvocationCandidate,
  type VerificationCheckReportCandidate,
} from '@prodivix/verification';
import { digestVerificationAdapterBytes } from './verificationAdapterInputs';
import {
  assertDigest,
  assertNotAborted,
  assertToken,
  contractError,
  emitExact,
  eventId,
  identityForDescriptor,
  infrastructureError,
  invocationCoordinatesMatch,
  preparedInvocationMatches,
  preflightCell,
  providerSupportsSurface,
  validateInputRefs,
  validateProjection,
  type InvocationState,
  type StaticVerificationAdapterSpec,
} from './staticVerificationAdapterSupport';

export {
  VerificationAdapterContractError,
  type StaticVerificationProjection,
} from './staticVerificationAdapterSupport';

export const createStaticVerificationAdapterFactory = (
  spec: StaticVerificationAdapterSpec
): VerificationAdapterFactory => {
  const expectedDescriptor = normalizeVerificationAdapterDescriptor(
    spec.descriptor
  );
  const expectedIdentity = identityForDescriptor(expectedDescriptor);
  return (factoryContext): VerificationAdapter => {
    const suppliedDescriptor = normalizeVerificationAdapterDescriptor(
      factoryContext.descriptor
    );
    assertDigest(
      factoryContext.registrySnapshotDigest,
      'Registry snapshot digest'
    );
    if (
      !sameCanonicalJson(suppliedDescriptor, expectedDescriptor) ||
      !sameCanonicalJson(factoryContext.identity, expectedIdentity) ||
      !sameCanonicalJson(factoryContext.tool, spec.tool) ||
      factoryContext.runtimeZone !== 'node'
    ) {
      throw contractError(
        `Factory identity, tool, runtime zone, or descriptor does not match ${expectedDescriptor.id}.`
      );
    }
    const verifiedFactoryContext = Object.freeze({
      registrySnapshotDigest: factoryContext.registrySnapshotDigest,
      adapter: factoryContext.identity,
      runtimeZone: factoryContext.runtimeZone,
    });

    const states = new Map<string, InvocationState>();

    return Object.freeze({
      preflight: async (cell, context) =>
        preflightCell(
          { ...spec, descriptor: expectedDescriptor },
          verifiedFactoryContext,
          cell,
          context
        ),

      prepare: async (input) => {
        assertDigest(input.planDigest, 'Plan digest');
        assertToken(input.attemptId, 'Attempt id');
        if (!Number.isSafeInteger(input.generation) || input.generation < 1) {
          throw contractError('Attempt generation must be a positive integer.');
        }
        if (!providerSupportsSurface(input.providerKind, input.cell.surface)) {
          throw contractError(
            'Attempt provider kind does not match the Plan surface.'
          );
        }
        if (
          input.controlCapabilitySnapshotDigest !==
            input.context.controlCapabilitySnapshotDigest ||
          input.appliedControlDigest !== input.context.appliedControlDigest
        ) {
          throw contractError(
            'Prepare controls do not match the adapter runtime context.'
          );
        }
        assertDigest(
          input.controlCapabilitySnapshotDigest,
          'Control capability snapshot digest'
        );
        assertDigest(input.appliedControlDigest, 'Applied control digest');
        assertDigest(
          input.context.resolvedInputSetDigest,
          'Resolved input set digest'
        );
        const preflight = preflightCell(
          { ...spec, descriptor: expectedDescriptor },
          verifiedFactoryContext,
          input.cell,
          input.context
        );
        if (preflight.status !== 'supported') {
          throw contractError(preflight.message);
        }
        assertNotAborted(input.context.abortSignal);
        const refs = validateInputRefs(input.context, spec.expectedInputs);
        const invocationId = `invocation:${digestVerificationValue({
          planDigest: input.planDigest,
          cellId: input.cell.id,
          attemptId: input.attemptId,
          generation: input.generation,
          providerKind: input.providerKind,
          registrySnapshotDigest: input.context.registrySnapshotDigest,
          adapter: input.context.adapter,
          controlCapabilitySnapshotDigest:
            input.controlCapabilitySnapshotDigest,
          appliedControlDigest: input.appliedControlDigest,
          resolvedInputSetDigest: input.context.resolvedInputSetDigest,
          inputRefs: [...refs.values()]
            .map(({ id, kind, digest, size, mediaType }) => ({
              id,
              kind,
              digest,
              size,
              ...(mediaType ? { mediaType } : {}),
            }))
            .sort((left, right) => compareUnicodeCodePoints(left.id, right.id)),
        })}`;
        if (states.has(invocationId)) {
          throw contractError(
            `Invocation ${invocationId} is already preparing or active.`
          );
        }
        const state: InvocationState = {
          phase: 'preparing',
          canaryId: `canary:${invocationId.slice('invocation:'.length)}`,
          input,
        };
        states.set(invocationId, state);
        const cache = new Map<string, Uint8Array>();
        const readInput = async (id: string): Promise<Uint8Array> => {
          const cached = cache.get(id);
          if (cached) return new Uint8Array(cached);
          const ref = refs.get(id);
          if (!ref) {
            throw contractError(`Input reference ${id} was not declared.`);
          }
          assertNotAborted(input.context.abortSignal);
          let resolved: Uint8Array;
          try {
            resolved = await input.context.inputResolver.read(
              ref,
              input.context.abortSignal
            );
          } catch {
            throw infrastructureError(
              `Input reference ${id} could not be read.`
            );
          }
          assertNotAborted(input.context.abortSignal);
          if (
            !(resolved instanceof Uint8Array) ||
            resolved.byteLength !== ref.size ||
            digestVerificationAdapterBytes(resolved) !== ref.digest
          ) {
            throw contractError(
              `Input reference ${id} bytes do not match its content address.`
            );
          }
          const copy = new Uint8Array(resolved);
          cache.set(id, copy);
          return new Uint8Array(copy);
        };
        try {
          const projection = validateProjection(
            await spec.prepareProjection({ input, readInput }),
            input.cell,
            expectedDescriptor
          );
          if (
            states.get(invocationId) !== state ||
            state.phase !== 'preparing'
          ) {
            throw infrastructureError(
              `Invocation ${invocationId} was cleaned while preparing.`
            );
          }
          const invocation: VerificationAdapterPreparedInvocationCandidate =
            Object.freeze({
              invocationId,
              planDigest: input.planDigest,
              cellId: input.cell.id,
              adapterId: factoryContext.identity.adapterId,
              attemptId: input.attemptId,
              generation: input.generation,
              providerKind: input.providerKind,
              inputDigest: input.context.inputDigest,
              controlCapabilitySnapshotDigest:
                input.controlCapabilitySnapshotDigest,
              appliedControlDigest: input.appliedControlDigest,
              confirmedCursor: 0,
              state: 'running',
            });
          state.prepared = invocation;
          state.projection = projection;
          state.phase = 'ready';
          return invocation;
        } catch (error) {
          states.delete(invocationId);
          throw error;
        }
      },

      execute: async (invocation, sink) => {
        const state = states.get(invocation.invocationId);
        if (
          !state ||
          state.phase !== 'ready' ||
          !state.projection ||
          !preparedInvocationMatches(state, invocation)
        ) {
          throw contractError(
            'Prepared invocation is unknown, stale, already executing, or drifted.'
          );
        }
        state.invocation = invocation;
        state.phase = 'executing';
        try {
          assertNotAborted(state.input.context.abortSignal);
          emitExact(sink, {
            kind: 'progress',
            eventId: eventId(invocation, 'started'),
            messageKey: 'verification.adapter.started',
            completed: 0,
            total: 1,
          });

          const stagedArtifacts: VerificationCheckReportCandidate['artifacts'][number][] =
            [];
          for (const artifact of state.projection.artifacts) {
            assertNotAborted(state.input.context.abortSignal);
            const staged = await state.input.context.artifactStaging.stage(
              {
                id: artifact.id,
                kind: artifact.kind,
                mediaType: artifact.mediaType,
                bytes: new Uint8Array(artifact.bytes),
              },
              state.input.context.abortSignal
            );
            assertNotAborted(state.input.context.abortSignal);
            if (staged.status !== 'staged') {
              throw infrastructureError(
                `Artifact ${artifact.id} staging was rejected: ${staged.reasonCode}.`
              );
            }
            if (
              staged.digest !== artifact.digest ||
              staged.size !== artifact.size ||
              staged.mediaType !== artifact.mediaType
            ) {
              throw contractError(
                `Artifact ${artifact.id} staging identity drifted.`
              );
            }
            stagedArtifacts.push(
              Object.freeze({
                id: artifact.id,
                kind: artifact.kind,
                digest: artifact.digest,
                size: artifact.size,
                mediaType: artifact.mediaType,
              })
            );
            emitExact(sink, {
              kind: 'artifact',
              eventId: eventId(invocation, `artifact:${artifact.id}`),
              artifactId: artifact.id,
              digest: artifact.digest,
            });
          }

          for (const code of state.projection.diagnosticCodes) {
            emitExact(sink, {
              kind: 'diagnostic',
              eventId: eventId(invocation, `diagnostic:${code}`),
              code,
            });
          }
          emitExact(sink, {
            kind: 'progress',
            eventId: eventId(invocation, 'completed'),
            messageKey: 'verification.adapter.completed',
            completed: 1,
            total: 1,
          });
          state.phase = 'collecting';
          return Object.freeze({
            format: 'prodivix.verification-check-report-candidate',
            version: 1,
            cellId: invocation.cellId,
            attemptId: invocation.attemptId,
            checkKind: state.input.cell.checkKind,
            inputDigest: invocation.inputDigest,
            adapter: state.input.context.adapter,
            tool: factoryContext.tool,
            terminal: state.projection.terminal,
            payload: state.projection.payload,
            artifacts: Object.freeze(
              stagedArtifacts.sort((left, right) =>
                compareUnicodeCodePoints(left.id, right.id)
              )
            ),
            diagnosticCodes: state.projection.diagnosticCodes,
          });
        } catch (error) {
          state.phase = 'collecting';
          throw error;
        }
      },

      cleanup: async (input) => {
        try {
          assertDigest(input.planDigest, 'Cleanup Plan digest');
          assertToken(input.cellId, 'Cleanup cell id');
          assertToken(input.attemptId, 'Cleanup attempt id');
          if (!Number.isSafeInteger(input.generation) || input.generation < 1) {
            throw contractError(
              'Cleanup generation must be a positive integer.'
            );
          }
          const matchingStates = [...states.entries()].filter(([, state]) =>
            invocationCoordinatesMatch(state, input)
          );
          if (input.invocation) {
            const state = states.get(input.invocation.invocationId);
            if (
              state &&
              (!invocationCoordinatesMatch(state, input) ||
                !preparedInvocationMatches(state, input.invocation) ||
                (state.invocation !== undefined &&
                  !sameCanonicalJson(state.invocation, input.invocation)))
            ) {
              return Object.freeze({
                status: 'residual' as const,
                residualCanaryIds: Object.freeze([state.canaryId]),
                diagnosticCodes: Object.freeze(['VER-4002']),
              });
            }
            if (state) {
              state.phase = 'cleaned';
              states.delete(input.invocation.invocationId);
            }
          } else {
            for (const [invocationId, state] of matchingStates) {
              state.phase = 'cleaned';
              states.delete(invocationId);
            }
          }
          const residual = [...states.values()]
            .filter((state) => invocationCoordinatesMatch(state, input))
            .map(({ canaryId }) => canaryId)
            .sort(compareUnicodeCodePoints);
          return Object.freeze({
            status:
              residual.length === 0
                ? ('clean' as const)
                : ('residual' as const),
            residualCanaryIds: Object.freeze(residual),
            diagnosticCodes: Object.freeze(
              residual.length === 0 ? [] : ['VER-4002']
            ),
          });
        } catch {
          return Object.freeze({
            status: 'failed' as const,
            residualCanaryIds: Object.freeze([]),
            diagnosticCodes: Object.freeze(['VER-4002']),
          });
        }
      },
    });
  };
};
