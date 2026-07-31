import { describe, expect, it, vi } from 'vitest';
import {
  applyVerificationRunEvent,
  createVerificationRunEvent,
  createVerificationRunSnapshot,
  encodeVerificationRunEvent,
  encodeVerificationRunSnapshot,
} from '@prodivix/verification';
import { createPlanFixture } from './__tests__/verificationEvidence.fixture';
import { createVerificationRunClient } from './verificationRunClient';

const runFixture = () => {
  const plan = createPlanFixture();
  const queued = createVerificationRunSnapshot({
    runId: 'run-client',
    plan,
    surface: 'ci',
    scope: 'all',
    providerId: 'provider-client',
    origin: 'web',
    selectedCellIds: ['cell-a'],
    attemptIdByCellId: { 'cell-a': 'attempt-client' },
    createdAt: '2026-07-31T08:00:00.000Z',
  });
  const event = createVerificationRunEvent({
    eventId: 'event-client-start',
    runId: queued.runId,
    cursor: 1,
    occurredAt: '2026-07-31T08:00:00.001Z',
    kind: 'run-started',
  });
  const applied = applyVerificationRunEvent(queued, event);
  if (applied.status !== 'applied') {
    throw new Error(applied.message);
  }
  return { plan, queued, event, running: applied.snapshot };
};

describe('Verification run client', () => {
  it('binds create, cursor recovery, append, and exact list filters to the durable routes', async () => {
    const fixture = runFixture();
    const request = vi.fn(
      async (path: string, options: RequestInit & { token: string }) => {
        if (path.endsWith('/events')) {
          return { run: encodeVerificationRunSnapshot(fixture.running) };
        }
        if (path.includes('/run-client?')) {
          return {
            snapshot: encodeVerificationRunSnapshot(fixture.running),
            events: [encodeVerificationRunEvent(fixture.event)],
          };
        }
        if (options.method === 'POST') {
          return { run: encodeVerificationRunSnapshot(fixture.queued) };
        }
        return {
          runs: [encodeVerificationRunSnapshot(fixture.running)],
        };
      }
    );
    const client = createVerificationRunClient({
      accessToken: 'token-client',
      request: request as never,
    });

    await client.createRun({ snapshot: fixture.queued });
    await client.appendEvent({
      workspaceId: fixture.queued.workspaceId,
      runId: fixture.queued.runId,
      event: fixture.event,
    });
    const recovered = await client.getRun({
      workspaceId: fixture.queued.workspaceId,
      runId: fixture.queued.runId,
      afterCursor: 0,
    });
    const listed = await client.listRuns({
      workspaceId: fixture.queued.workspaceId,
      workspaceRevision: fixture.plan.targetRevision,
      planDigest: fixture.plan.planDigest,
      limit: 1,
    });

    expect(recovered.events).toHaveLength(1);
    expect(listed).toHaveLength(1);
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Prodivix-Verification-Intent': 'create-run',
      },
    });
    expect(request.mock.calls[1]?.[0]).toContain('/run-client/events');
    expect(request.mock.calls[2]?.[0]).toContain('/run-client?afterCursor=0');
    expect(request.mock.calls[3]?.[0]).toContain('workspaceRevision=7');
    expect(request.mock.calls[3]?.[0]).toContain(
      `planDigest=${encodeURIComponent(fixture.plan.planDigest)}`
    );
  });

  it('fails closed when a list response crosses the requested revision', async () => {
    const fixture = runFixture();
    const request = vi.fn(async () => ({
      runs: [encodeVerificationRunSnapshot(fixture.running)],
    }));
    const client = createVerificationRunClient({
      accessToken: 'token-client',
      request: request as never,
    });

    await expect(
      client.listRuns({
        workspaceId: fixture.queued.workspaceId,
        workspaceRevision: fixture.plan.targetRevision + 1,
      })
    ).rejects.toThrow('exact revision or Plan boundary');
  });

  it('fails closed when recovery omits any event after the requested cursor', async () => {
    const fixture = runFixture();
    const request = vi.fn(async () => ({
      snapshot: encodeVerificationRunSnapshot(fixture.running),
      events: [],
    }));
    const client = createVerificationRunClient({
      accessToken: 'token-client',
      request: request as never,
    });

    await expect(
      client.getRun({
        workspaceId: fixture.queued.workspaceId,
        runId: fixture.queued.runId,
        afterCursor: 0,
      })
    ).rejects.toThrow('exact cursor continuation');
  });
});
