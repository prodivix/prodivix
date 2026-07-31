import {
  decodeVerificationRunEvent,
  decodeVerificationRunSnapshot,
  encodeVerificationRunEvent,
  encodeVerificationRunSnapshot,
  type VerificationRunEvent,
  type VerificationRunSnapshot,
} from '@prodivix/verification';
import { apiRequest } from '@/infra/api';
import { exactKeys, fail, recordAt } from './verificationEvidenceCodec.shared';

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const VERIFICATION_INTENT_HEADER = 'X-Prodivix-Verification-Intent';

type ApiRequestPort = typeof apiRequest;

export type VerificationRunRecord = Readonly<{
  snapshot: VerificationRunSnapshot;
  events: readonly VerificationRunEvent[];
}>;

export type VerificationRunClient = Readonly<{
  createRun(input: {
    snapshot: VerificationRunSnapshot;
    signal?: AbortSignal;
  }): Promise<VerificationRunSnapshot>;
  appendEvent(input: {
    workspaceId: string;
    runId: string;
    event: VerificationRunEvent;
    signal?: AbortSignal;
  }): Promise<VerificationRunSnapshot>;
  getRun(input: {
    workspaceId: string;
    runId: string;
    afterCursor?: number;
    signal?: AbortSignal;
  }): Promise<VerificationRunRecord>;
  listRuns(input: {
    workspaceId: string;
    workspaceRevision?: number;
    planDigest?: string;
    limit?: number;
    signal?: AbortSignal;
  }): Promise<readonly VerificationRunSnapshot[]>;
}>;

export type CreateVerificationRunClientOptions = Readonly<{
  accessToken: string;
  request?: ApiRequestPort;
}>;

const identifier = (value: string, name: string): string => {
  if (value !== value.trim() || !IDENTIFIER_PATTERN.test(value)) {
    throw new TypeError(`${name} must be a bounded Verification identifier.`);
  }
  return value;
};

const revision = (value: number, name: string): number => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer.`);
  }
  return value;
};

const digest = (value: string): string => {
  if (!DIGEST_PATTERN.test(value)) {
    throw new TypeError('planDigest must be a canonical SHA-256 digest.');
  }
  return value;
};

const workspacePath = (workspaceId: string): string =>
  `/workspaces/${encodeURIComponent(identifier(workspaceId, 'workspaceId'))}/verification/runs`;

const requestOptions = (
  token: string,
  signal?: AbortSignal
): RequestInit & { token: string } => ({
  token,
  ...(signal ? { signal } : {}),
});

const mutationOptions = (
  token: string,
  intent: 'create-run' | 'append-run-event',
  body: unknown,
  signal?: AbortSignal
): RequestInit & { token: string } => ({
  method: 'POST',
  token,
  headers: {
    'Content-Type': 'application/json',
    [VERIFICATION_INTENT_HEADER]: intent,
  },
  body: JSON.stringify(body),
  ...(signal ? { signal } : {}),
});

const decodeRun = (value: unknown, path: string): VerificationRunSnapshot => {
  const decoded = decodeVerificationRunSnapshot(value);
  if (decoded.ok) return decoded.value;
  const issue = decoded.issues[0];
  return fail(
    `${path}${issue?.path === '/' ? '' : (issue?.path ?? '')}`,
    issue?.message ?? 'expected a versioned Verification run snapshot'
  );
};

const decodeEvent = (value: unknown, path: string): VerificationRunEvent => {
  const decoded = decodeVerificationRunEvent(value);
  if (decoded.ok) return decoded.value;
  const issue = decoded.issues[0];
  return fail(
    `${path}${issue?.path === '/' ? '' : (issue?.path ?? '')}`,
    issue?.message ?? 'expected a versioned Verification run event'
  );
};

const decodeRunEnvelope = (value: unknown): VerificationRunSnapshot => {
  const envelope = recordAt(value, '/');
  exactKeys(envelope, '/', ['run']);
  return decodeRun(envelope.run, '/run');
};

const decodeRunRecord = (value: unknown): VerificationRunRecord => {
  const record = recordAt(value, '/');
  exactKeys(record, '/', ['snapshot', 'events']);
  if (!Array.isArray(record.events) || record.events.length > 100_000) {
    return fail('/events', 'expected a bounded Verification event array');
  }
  const snapshot = decodeRun(record.snapshot, '/snapshot');
  const events = Object.freeze(
    record.events.map((event, index) =>
      decodeEvent(event, `/events/${String(index)}`)
    )
  );
  let cursor = events[0]?.cursor ? events[0].cursor - 1 : snapshot.cursor;
  for (const event of events) {
    if (event.runId !== snapshot.runId || event.cursor !== cursor + 1) {
      return fail(
        '/events',
        'Verification event replay is not contiguous for the run'
      );
    }
    cursor = event.cursor;
  }
  if (events.length > 0 && cursor > snapshot.cursor) {
    return fail('/events', 'Verification event cursor exceeds the snapshot');
  }
  return Object.freeze({ snapshot, events });
};

/**
 * Authenticated adapter for the durable run registry. Runtime state remains a
 * disposable projection; only immutable cursor events and their latest
 * revision-bound snapshot cross this boundary.
 */
export const createVerificationRunClient = (
  options: CreateVerificationRunClientOptions
): VerificationRunClient => {
  const token = options.accessToken.trim();
  if (!token) {
    throw new TypeError('Verification runs require an authenticated session.');
  }
  const request = options.request ?? apiRequest;

  return Object.freeze({
    async createRun(input) {
      const snapshot = input.snapshot;
      const response = await request<unknown>(
        workspacePath(snapshot.workspaceId),
        mutationOptions(
          token,
          'create-run',
          encodeVerificationRunSnapshot(snapshot),
          input.signal
        )
      );
      const created = decodeRunEnvelope(response);
      if (
        created.runId !== snapshot.runId ||
        created.snapshotDigest !== snapshot.snapshotDigest
      ) {
        throw new TypeError(
          'Verification run creation response drifted from the requested identity.'
        );
      }
      return created;
    },

    async appendEvent(input) {
      const runId = identifier(input.runId, 'runId');
      const response = await request<unknown>(
        `${workspacePath(input.workspaceId)}/${encodeURIComponent(runId)}/events`,
        mutationOptions(
          token,
          'append-run-event',
          encodeVerificationRunEvent(input.event),
          input.signal
        )
      );
      const snapshot = decodeRunEnvelope(response);
      if (
        snapshot.runId !== runId ||
        snapshot.workspaceId !== input.workspaceId ||
        snapshot.cursor < input.event.cursor
      ) {
        throw new TypeError(
          'Verification run event response drifted from the requested cursor.'
        );
      }
      return snapshot;
    },

    async getRun(input) {
      const query = new URLSearchParams();
      if (input.afterCursor !== undefined) {
        query.set(
          'afterCursor',
          String(revision(input.afterCursor, 'afterCursor'))
        );
      }
      const suffix = query.size ? `?${query.toString()}` : '';
      const response = await request<unknown>(
        `${workspacePath(input.workspaceId)}/${encodeURIComponent(identifier(input.runId, 'runId'))}${suffix}`,
        requestOptions(token, input.signal)
      );
      const record = decodeRunRecord(response);
      if (
        record.snapshot.workspaceId !== input.workspaceId ||
        record.snapshot.runId !== input.runId
      ) {
        throw new TypeError(
          'Verification run recovery response drifted from the route identity.'
        );
      }
      const afterCursor = input.afterCursor ?? 0;
      const firstCursor = record.events[0]?.cursor;
      const lastCursor = record.events.at(-1)?.cursor;
      if (
        afterCursor > record.snapshot.cursor ||
        (record.events.length === 0
          ? afterCursor !== record.snapshot.cursor
          : firstCursor !== afterCursor + 1 ||
            lastCursor !== record.snapshot.cursor)
      ) {
        throw new TypeError(
          'Verification run recovery response is not an exact cursor continuation.'
        );
      }
      return record;
    },

    async listRuns(input) {
      const query = new URLSearchParams();
      if (input.workspaceRevision !== undefined) {
        query.set(
          'workspaceRevision',
          String(revision(input.workspaceRevision, 'workspaceRevision'))
        );
      }
      if (input.planDigest) query.set('planDigest', digest(input.planDigest));
      const limit = input.limit ?? 20;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new TypeError('Verification run list limit must be 1 to 100.');
      }
      query.set('limit', String(limit));
      const response = await request<unknown>(
        `${workspacePath(input.workspaceId)}?${query.toString()}`,
        requestOptions(token, input.signal)
      );
      const envelope = recordAt(response, '/');
      exactKeys(envelope, '/', ['runs']);
      if (!Array.isArray(envelope.runs) || envelope.runs.length > limit) {
        return fail('/runs', 'expected a bounded Verification run array');
      }
      const runs = Object.freeze(
        envelope.runs.map((run, index) =>
          decodeRun(run, `/runs/${String(index)}`)
        )
      );
      if (
        runs.some(
          (run) =>
            run.workspaceId !== input.workspaceId ||
            (input.workspaceRevision !== undefined &&
              run.workspaceRevision !== input.workspaceRevision) ||
            (input.planDigest !== undefined &&
              run.planDigest !== input.planDigest)
        )
      ) {
        throw new TypeError(
          'Verification run list crossed its exact revision or Plan boundary.'
        );
      }
      return runs;
    },
  });
};
