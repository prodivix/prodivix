import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import { digestVerificationValue } from './verificationCanonical';
import type {
  PreparedVerificationInvocation,
  VerificationAdapterEventCandidate,
  VerificationAdapterEventEnvelope,
  VerificationAdapterEventReceipt,
  VerificationEventSink,
} from './verificationAdapterRuntime.types';

const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;

type EventSinkViolation =
  'budget-exceeded' | 'duplicate-drift' | 'malformed' | 'terminal';

export type VerificationEventSinkController = Readonly<{
  sink: VerificationEventSink;
  close(): void;
  snapshot(): readonly VerificationAdapterEventEnvelope[];
  violation(): EventSinkViolation | undefined;
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

const token = (value: unknown): value is string =>
  typeof value === 'string' &&
  value === value.normalize('NFC') &&
  TOKEN_PATTERN.test(value);

const digest = (value: unknown): value is string =>
  typeof value === 'string' && DIGEST_PATTERN.test(value);

const safeInteger = (value: unknown, minimum = 0): value is number =>
  Number.isSafeInteger(value) &&
  !Object.is(value, -0) &&
  (value as number) >= minimum;

const normalizeEvent = (
  value: VerificationAdapterEventCandidate
): VerificationAdapterEventCandidate | undefined => {
  if (!isPlainObject(value) || !token(value.kind)) return undefined;
  if (value.kind === 'progress') {
    const event = exactRecord(value, [
      'kind',
      'eventId',
      'messageKey',
      'completed',
      'total',
    ]);
    if (
      !event ||
      !token(event.eventId) ||
      !token(event.messageKey) ||
      !safeInteger(event.completed) ||
      !safeInteger(event.total, 1) ||
      event.completed > event.total
    ) {
      return undefined;
    }
    return Object.freeze({
      kind: 'progress',
      eventId: event.eventId,
      messageKey: event.messageKey,
      completed: event.completed,
      total: event.total,
    });
  }
  if (value.kind === 'diagnostic') {
    const event = exactRecord(
      value,
      ['kind', 'eventId', 'code'],
      ['sourceTraceDigest']
    );
    if (
      !event ||
      !token(event.eventId) ||
      !token(event.code) ||
      (event.sourceTraceDigest !== undefined &&
        !digest(event.sourceTraceDigest))
    ) {
      return undefined;
    }
    return Object.freeze({
      kind: 'diagnostic',
      eventId: event.eventId,
      code: event.code,
      ...(event.sourceTraceDigest === undefined
        ? {}
        : { sourceTraceDigest: event.sourceTraceDigest }),
    });
  }
  if (value.kind === 'artifact') {
    const event = exactRecord(value, [
      'kind',
      'eventId',
      'artifactId',
      'digest',
    ]);
    if (
      !event ||
      !token(event.eventId) ||
      !token(event.artifactId) ||
      !digest(event.digest)
    ) {
      return undefined;
    }
    return Object.freeze({
      kind: 'artifact',
      eventId: event.eventId,
      artifactId: event.artifactId,
      digest: event.digest,
    });
  }
  return undefined;
};

/**
 * Owns sequence allocation and attempt fencing. Adapters can only propose an
 * event payload; Core binds it to the prepared invocation coordinates.
 */
export const createVerificationEventSinkController = (
  invocation: PreparedVerificationInvocation,
  maximumEvents: number
): VerificationEventSinkController => {
  if (!safeInteger(maximumEvents, 1)) {
    throw new TypeError('Verification event budget must be positive.');
  }
  const events: VerificationAdapterEventEnvelope[] = [];
  const receipts = new Map<
    string,
    Readonly<{ eventDigest: string; sequence: number }>
  >();
  let terminal = false;
  let rejected: EventSinkViolation | undefined;

  const reject = (
    reason: EventSinkViolation
  ): VerificationAdapterEventReceipt => {
    rejected ??= reason;
    return Object.freeze({ status: 'rejected', reason });
  };

  const sink: VerificationEventSink = Object.freeze({
    emit(
      candidate: VerificationAdapterEventCandidate
    ): VerificationAdapterEventReceipt {
      if (terminal) return reject('terminal');
      const event = normalizeEvent(candidate);
      if (!event) return reject('malformed');
      const eventDigest = digestVerificationValue(event);
      const previous = receipts.get(event.eventId);
      if (previous) {
        return previous.eventDigest === eventDigest
          ? Object.freeze({
              status: 'accepted' as const,
              sequence: previous.sequence,
            })
          : reject('duplicate-drift');
      }
      if (events.length >= maximumEvents) {
        return reject('budget-exceeded');
      }
      const sequence = invocation.confirmedCursor + events.length + 1;
      receipts.set(event.eventId, { eventDigest, sequence });
      events.push(
        Object.freeze({
          sequence,
          planDigest: invocation.planDigest,
          cellId: invocation.cellId,
          attemptId: invocation.attemptId,
          generation: invocation.generation,
          event,
          eventDigest,
        })
      );
      return Object.freeze({ status: 'accepted' as const, sequence });
    },
  });

  return Object.freeze({
    sink,
    close(): void {
      terminal = true;
    },
    snapshot(): readonly VerificationAdapterEventEnvelope[] {
      return Object.freeze(
        [...events].sort(
          (left, right) =>
            left.sequence - right.sequence ||
            compareUnicodeCodePoints(left.event.eventId, right.event.eventId)
        )
      );
    },
    violation(): EventSinkViolation | undefined {
      return rejected;
    },
  });
};
