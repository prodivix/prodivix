import { describe, expect, it } from 'vitest';
import {
  V4_TIME,
  V4_PRODUCER,
  createV4Task,
  v4Command,
  v4Digest,
} from '../__tests__/agentV4Fixtures';
import {
  createAgentAuditExport,
  verifyAgentControlEventChain,
} from './agentAudit';
import { sanitizeAgentAuditPayload } from './agentAuditSanitizer';
import {
  claimAgentRunLease,
  createAgentClaimLease,
  isAgentClaimLeaseCurrent,
} from './agentClaimLease';
import {
  decodeAgentControlFact,
  encodeAgentControlFact,
} from './agentControlCodec';
import {
  createAgentRunControl,
  finalizeAgentRun,
  startAgentRun,
  transitionAgentRunPhase,
} from './agentControlPlane';

describe('Agent control audit, lease, and wire contracts', () => {
  it('exports a bounded verified hash chain and round-trips every fact kind', () => {
    const task = createV4Task('explain', 'audit');
    const created = createAgentRunControl(task, {
      runId: 'run.g4-v4.audit',
      command: v4Command(
        'event.audit.created',
        'idempotency.audit.created',
        V4_TIME.run
      ),
    });
    expect(created.accepted).toBe(true);
    if (!created.accepted) return;
    const started = startAgentRun(task, created.state, {
      ...v4Command(
        'event.audit.started',
        'idempotency.audit.started',
        V4_TIME.start
      ),
      attemptId: 'attempt.audit.1',
    });
    expect(started.accepted).toBe(true);
    if (!started.accepted) return;
    const running = transitionAgentRunPhase(task, started.state, {
      ...v4Command(
        'event.audit.running',
        'idempotency.audit.running',
        V4_TIME.running
      ),
      phase: 'running',
    });
    expect(running.accepted).toBe(true);
    if (!running.accepted) return;
    const terminal = finalizeAgentRun(task, running.state, {
      ...v4Command(
        'event.audit.terminal',
        'idempotency.audit.terminal',
        V4_TIME.terminal
      ),
      outcome: 'succeeded',
      successProof: {
        mode: 'explain',
        answerDigest: v4Digest('answer'),
        groundingDigests: [v4Digest('source-trace')],
      },
    });
    expect(terminal.accepted).toBe(true);
    if (!terminal.accepted) return;
    const events = [
      created.event,
      started.event,
      running.event,
      terminal.event,
    ];
    expect(verifyAgentControlEventChain(events)).toBe(true);
    const audit = createAgentAuditExport(events, V4_TIME.export);
    expect(audit.eventCount).toBe(4);

    for (const fact of [
      { factType: 'task-record' as const, value: task },
      { factType: 'run-snapshot' as const, value: terminal.state },
      { factType: 'run-event' as const, value: terminal.event },
      { factType: 'audit-export' as const, value: audit },
    ]) {
      const wire = encodeAgentControlFact(fact);
      expect(decodeAgentControlFact(wire)).toEqual({ ok: true, value: fact });
    }
  });

  it('fails closed for chain tampering, unknown fields, and future wire versions', () => {
    const task = createV4Task('plan', 'codec-negative');
    const created = createAgentRunControl(task, {
      runId: 'run.g4-v4.codec-negative',
      command: v4Command(
        'event.codec.created',
        'idempotency.codec.created',
        V4_TIME.run
      ),
    });
    expect(created.accepted).toBe(true);
    if (!created.accepted) return;
    expect(
      verifyAgentControlEventChain([
        { ...created.event, eventDigest: v4Digest('tampered') },
      ])
    ).toBe(false);
    expect(
      decodeAgentControlFact({
        ...encodeAgentControlFact({ factType: 'task-record', value: task }),
        unknown: true,
      }).ok
    ).toBe(false);
    expect(
      decodeAgentControlFact({
        ...encodeAgentControlFact({ factType: 'task-record', value: task }),
        wireVersion: 2,
      }).ok
    ).toBe(false);
  });

  it('never exports raw private fields or Secret canaries', () => {
    expect(
      sanitizeAgentAuditPayload({
        authorization: 'Bearer private-value',
        rawPrompt: 'private prompt',
        safe: 'digest-only',
      })
    ).toEqual({
      authorization: '[redacted]',
      rawPrompt: '[redacted]',
      safe: 'digest-only',
    });
    expect(() =>
      sanitizeAgentAuditPayload({ note: 'contains secret-audit-canary here' }, [
        'secret-audit-canary',
      ])
    ).toThrow(/Secret/u);
  });

  it('binds worker leases to the exact active Run generation and expiry', () => {
    const task = createV4Task('explain', 'lease');
    const created = createAgentRunControl(task, {
      runId: 'run.g4-v4.lease',
      command: v4Command(
        'event.lease.created',
        'idempotency.lease.created',
        V4_TIME.run
      ),
    });
    expect(created.accepted).toBe(true);
    if (!created.accepted) return;
    const started = startAgentRun(task, created.state, {
      ...v4Command(
        'event.lease.started',
        'idempotency.lease.started',
        V4_TIME.start
      ),
      attemptId: 'attempt.lease.1',
    });
    expect(started.accepted).toBe(true);
    if (!started.accepted) return;
    const claimed = claimAgentRunLease(undefined, started.state, {
      leaseId: 'lease.run.1',
      holderId: 'worker.test.1',
      acquiredAt: V4_TIME.start,
      expiresAt: V4_TIME.cancel,
    });
    expect(claimed.claimed).toBe(true);
    if (!claimed.claimed) return;
    expect(
      isAgentClaimLeaseCurrent(claimed.lease, started.state, {
        holderId: 'worker.test.1',
        leaseId: 'lease.run.1',
        checkedAt: V4_TIME.operation,
      })
    ).toBe(true);
    expect(
      isAgentClaimLeaseCurrent(claimed.lease, started.state, {
        holderId: 'worker.test.1',
        leaseId: 'lease.run.1',
        checkedAt: V4_TIME.terminal,
      })
    ).toBe(false);

    const conflicting = createAgentClaimLease({
      leaseId: 'lease.run.2',
      holderId: V4_PRODUCER.principalId,
      runId: started.state.run.runId,
      generation: started.state.run.generation,
      acquiredAt: V4_TIME.operation,
      expiresAt: V4_TIME.terminal,
    });
    expect(
      claimAgentRunLease(claimed.lease, started.state, {
        leaseId: conflicting.leaseId,
        holderId: conflicting.holderId,
        acquiredAt: conflicting.acquiredAt,
        expiresAt: conflicting.expiresAt,
      }).claimed
    ).toBe(false);
  });
});
