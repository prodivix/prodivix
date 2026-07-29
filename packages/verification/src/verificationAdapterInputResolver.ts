import { sameCanonicalJson } from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import { computeVerificationArtifactContentDigest } from './verificationArtifactDescriptor';
import type {
  VerificationAbortSignal,
  VerificationAdapterInputRef,
  VerificationAdapterInputResolver,
} from './verificationAdapterRuntime.types';

type InputResolverViolation =
  | 'budget-exceeded'
  | 'content-drift'
  | 'forged-reference'
  | 'terminal'
  | 'transport-failed';

export type VerificationInputResolverController = Readonly<{
  resolver: VerificationAdapterInputResolver;
  close(): void;
  closeAndDrain(): Promise<void>;
  violation(): InputResolverViolation | undefined;
}>;

const exactRecord = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): Record<string, unknown> | undefined => {
  if (!isPlainObject(value)) return undefined;
  const keys = Object.keys(value);
  return required.every((key) => keys.includes(key)) &&
    keys.every(
      (key) =>
        !isUnsafeObjectKey(key) &&
        (required.includes(key) || optional.includes(key))
    )
    ? value
    : undefined;
};

export const createVerificationInputResolverController = (
  input: Readonly<{
    refs: readonly VerificationAdapterInputRef[];
    maximumBytes: number;
    resolver: VerificationAdapterInputResolver;
    signal: VerificationAbortSignal;
  }>
): VerificationInputResolverController => {
  const declared = new Map(input.refs.map((ref) => [ref.id, ref]));
  const cache = new Map<string, Uint8Array>();
  const inFlight = new Map<string, Promise<Uint8Array>>();
  const pending = new Set<Promise<Uint8Array>>();
  const requested = new Set<string>();
  let requestedBytes = 0;
  let terminal = false;
  let rejectedReason: InputResolverViolation | undefined;

  const violate = (reason: InputResolverViolation): void => {
    rejectedReason ??= reason;
  };

  const resolver: VerificationAdapterInputResolver = Object.freeze({
    read(
      candidate: VerificationAdapterInputRef,
      _adapterSignal: VerificationAbortSignal
    ): Promise<Uint8Array> {
      if (terminal) {
        violate('terminal');
        return Promise.reject(
          new TypeError('Verification input resolver is closed.')
        );
      }
      const data = exactRecord(
        candidate,
        ['id', 'kind', 'digest', 'size'],
        ['mediaType']
      );
      const expected =
        data && typeof data.id === 'string' ? declared.get(data.id) : undefined;
      if (!expected || !sameCanonicalJson(candidate, expected)) {
        violate('forged-reference');
        return Promise.reject(
          new TypeError(
            'Verification input reference is undeclared or drifted.'
          )
        );
      }
      if (input.signal.aborted) {
        return Promise.reject(
          new TypeError('Verification input read was cancelled.')
        );
      }
      const cached = cache.get(expected.id);
      if (cached) return Promise.resolve(new Uint8Array(cached));
      const running = inFlight.get(expected.id);
      if (running) return running.then((bytes) => new Uint8Array(bytes));
      if (!requested.has(expected.id)) {
        requested.add(expected.id);
        requestedBytes += expected.size;
      }
      if (
        !Number.isSafeInteger(requestedBytes) ||
        requestedBytes > input.maximumBytes
      ) {
        violate('budget-exceeded');
        return Promise.reject(
          new TypeError('Verification input reads exceed their Core budget.')
        );
      }
      const task = (async (): Promise<Uint8Array> => {
        try {
          const value = await input.resolver.read(expected, input.signal);
          if (!(value instanceof Uint8Array)) {
            violate('content-drift');
            throw new TypeError(
              'Verification input bytes drifted from their content address.'
            );
          }
          const bytes = new Uint8Array(value);
          if (
            bytes.byteLength !== expected.size ||
            computeVerificationArtifactContentDigest(bytes) !== expected.digest
          ) {
            violate('content-drift');
            throw new TypeError(
              'Verification input bytes drifted from their content address.'
            );
          }
          cache.set(expected.id, new Uint8Array(bytes));
          return new Uint8Array(bytes);
        } catch (error) {
          if (!input.signal.aborted && rejectedReason !== 'content-drift') {
            violate('transport-failed');
          }
          throw error;
        } finally {
          inFlight.delete(expected.id);
        }
      })();
      inFlight.set(expected.id, task);
      pending.add(task);
      void task.then(
        () => pending.delete(task),
        () => pending.delete(task)
      );
      void task.catch(() => undefined);
      return task.then((bytes) => new Uint8Array(bytes));
    },
  });

  return Object.freeze({
    resolver,
    close(): void {
      terminal = true;
    },
    async closeAndDrain(): Promise<void> {
      terminal = true;
      await Promise.allSettled([...pending]);
    },
    violation(): InputResolverViolation | undefined {
      return rejectedReason;
    },
  });
};
