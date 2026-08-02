import { describe, expect, it } from 'vitest';
import {
  admitFinalAgentRealtimeTurn,
  createAgentRealtimeMediaSession,
  createAgentRealtimeTurn,
  digestAgentCanonicalValue,
  reconnectAgentRealtimeMediaSession,
} from '../index';

const createSession = () =>
  createAgentRealtimeMediaSession({
    sessionId: 'realtime-session.g4-v2',
    taskId: 'task.g4-v2',
    runId: 'run.g4-v2',
    generation: 2,
    transportGeneration: 1,
    capabilityQualificationDigest: digestAgentCanonicalValue(
      'qualification.realtime'
    ),
    mediaPolicyDigest: digestAgentCanonicalValue('media-policy.realtime'),
    deviceGrantDigest: digestAgentCanonicalValue('visible-device-grant'),
    deviceKinds: Object.freeze(['microphone']),
    authorizationRef: 'ephemeral-auth.realtime-1',
    startedAt: '2026-08-01T01:59:30.000Z',
    authorizationExpiresAt: '2026-08-01T12:00:00.000Z',
    maxDurationMs: 60_000,
    maxCost: Object.freeze({ currency: 'USD', maximum: '2' }),
    state: 'active',
  });

describe('G4 V2 realtime media fencing', () => {
  it('keeps partial/interrupted turns ephemeral and admits only an exact final turn', () => {
    const session = createSession();
    for (const state of ['partial', 'interrupted'] as const) {
      const turn = createAgentRealtimeTurn({
        turnId: `turn.${state}`,
        sessionId: session.sessionId,
        transportGeneration: session.transportGeneration,
        state,
        contentDigest: digestAgentCanonicalValue(state),
        instructionBoundary: 'data-only',
        proposalAuthority: 'none',
      });
      expect(
        admitFinalAgentRealtimeTurn(session, turn, '2026-08-01T02:00:00.000Z')
      ).toEqual({ admitted: false, reason: 'partial' });
    }
    const final = createAgentRealtimeTurn({
      turnId: 'turn.final',
      sessionId: session.sessionId,
      transportGeneration: session.transportGeneration,
      state: 'final',
      contentDigest: digestAgentCanonicalValue('final transcript'),
      instructionBoundary: 'data-only',
      proposalAuthority: 'none',
    });
    expect(
      admitFinalAgentRealtimeTurn(session, final, '2026-08-01T02:00:00.000Z')
    ).toEqual({ admitted: true });
    expect(
      admitFinalAgentRealtimeTurn(session, final, '2026-08-01T02:00:31.000Z')
    ).toEqual({ admitted: false, reason: 'expired' });
  });

  it('fences the old transport generation on reconnect', () => {
    const session = createSession();
    const rotated = reconnectAgentRealtimeMediaSession(session, {
      authorizationRef: 'ephemeral-auth.realtime-2',
      authorizationExpiresAt: '2026-08-01T13:00:00.000Z',
    });
    expect(rotated.previous.state).toBe('fenced');
    expect(rotated.next.transportGeneration).toBe(2);
    const late = createAgentRealtimeTurn({
      turnId: 'turn.old-transport',
      sessionId: session.sessionId,
      transportGeneration: 1,
      state: 'final',
      contentDigest: digestAgentCanonicalValue('late final'),
      instructionBoundary: 'data-only',
      proposalAuthority: 'none',
    });
    expect(
      admitFinalAgentRealtimeTurn(
        rotated.next,
        late,
        '2026-08-01T02:00:00.000Z'
      )
    ).toEqual({ admitted: false, reason: 'fenced' });
  });
});
