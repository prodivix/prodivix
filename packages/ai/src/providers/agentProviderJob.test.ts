import { describe, expect, it } from 'vitest';
import { testDigest } from '../__tests__/agentV1Fixtures';
import {
  createAgentProviderJob,
  createAgentProviderJobEvent,
  reduceAgentProviderJob,
} from './agentProviderJob';

const createJob = () =>
  createAgentProviderJob({
    providerJobId: 'provider-job.1',
    taskId: 'task.1',
    runId: 'run.1',
    generation: 3,
    invocationId: 'invocation.1',
    requestDigest: testDigest('request'),
  });

const event = (
  type: 'accepted' | 'running' | 'cancel-requested' | 'completed' | 'cancelled'
) =>
  createAgentProviderJobEvent({
    eventId: `event.${type}`,
    providerJobId: 'provider-job.1',
    taskId: 'task.1',
    runId: 'run.1',
    generation: 3,
    invocationId: 'invocation.1',
    type,
    source: type === 'completed' ? 'webhook' : 'coordinator',
    ...(type === 'completed'
      ? { signatureVerified: true, replayWindowValid: true }
      : {}),
    payloadDigest: testDigest(type),
    occurredAt: '2026-08-01T00:00:00.000Z',
  });

describe('G4 V1 provider background job fencing', () => {
  it('normalizes subordinate job lifecycle without treating it as AgentRun success', () => {
    const accepted = reduceAgentProviderJob(createJob(), event('accepted'), 3);
    expect(accepted).toMatchObject({
      accepted: true,
      state: { phase: 'accepted' },
    });
    if (accepted.accepted) expect(accepted.state).not.toHaveProperty('outcome');
    if (!accepted.accepted) return;
    const running = reduceAgentProviderJob(accepted.state, event('running'), 3);
    if (!running.accepted) return;
    const completed = reduceAgentProviderJob(
      running.state,
      event('completed'),
      3
    );
    expect(completed).toMatchObject({
      accepted: true,
      state: {
        phase: 'terminal',
        outcome: 'completed',
        callbackAuthority: 'revoked',
      },
      receipt: { phase: 'terminal', outcome: 'completed' },
    });
  });

  it('revokes callback authority before cancellation and audits late completion only', () => {
    const accepted = reduceAgentProviderJob(createJob(), event('accepted'), 3);
    if (!accepted.accepted) return;
    const cancelling = reduceAgentProviderJob(
      accepted.state,
      event('cancel-requested'),
      3
    );
    expect(cancelling).toMatchObject({
      accepted: true,
      state: { phase: 'cancelling', callbackAuthority: 'revoked' },
    });
    if (!cancelling.accepted) return;
    const late = reduceAgentProviderJob(
      cancelling.state,
      event('completed'),
      3
    );
    expect(late).toMatchObject({
      accepted: false,
      auditOnly: true,
      issues: [{ code: 'AI-6012' }],
    });
    if (!late.accepted) expect(late.state).toBe(cancelling.state);
  });

  it('rejects old generation and spoofed webhook callbacks', () => {
    const oldGeneration = reduceAgentProviderJob(
      createJob(),
      event('accepted'),
      4
    );
    expect(oldGeneration).toMatchObject({
      accepted: false,
      auditOnly: true,
      issues: [{ path: '/generation' }],
    });

    const { eventDigest: _eventDigest, ...completedEvent } = event('completed');
    const spoofed = createAgentProviderJobEvent({
      ...completedEvent,
      source: 'webhook',
      signatureVerified: false,
      replayWindowValid: true,
    });
    expect(reduceAgentProviderJob(createJob(), spoofed, 3)).toMatchObject({
      accepted: false,
      auditOnly: true,
      issues: [{ path: '/webhook' }],
    });
  });

  it('treats duplicate provider job events as audit-only replay', () => {
    const acceptedEvent = event('accepted');
    const accepted = reduceAgentProviderJob(createJob(), acceptedEvent, 3);
    expect(accepted).toMatchObject({ accepted: true });
    if (!accepted.accepted) return;
    expect(
      reduceAgentProviderJob(accepted.state, acceptedEvent, 3)
    ).toMatchObject({
      accepted: false,
      auditOnly: true,
      issues: [expect.objectContaining({ path: '/eventDigest' })],
    });
  });
});
