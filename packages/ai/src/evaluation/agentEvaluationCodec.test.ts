import { describe, expect, it } from 'vitest';
import {
  createV8CodecAttemptFixture,
  createV8EvaluationPlan,
} from '../__tests__/agentV8Fixtures';
import type { AgentModelEvaluationAttempt } from './agentEvaluation.types';
import {
  decodeAgentEvaluationFact,
  encodeAgentEvaluationFact,
  serializeAgentEvaluationFact,
} from './agentEvaluationCodec';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';

describe('G4 V8 evaluation wire codec', () => {
  it('round-trips frozen plan and attempt facts canonically', () => {
    const plan = createV8EvaluationPlan();
    const attempt = createV8CodecAttemptFixture(plan);
    for (const fact of [
      { factType: 'evaluation-plan' as const, value: plan },
      { factType: 'evaluation-attempt' as const, value: attempt },
    ]) {
      const wire = encodeAgentEvaluationFact(fact);
      expect(decodeAgentEvaluationFact(wire)).toEqual({
        ok: true,
        value: fact,
      });
      expect(JSON.parse(serializeAgentEvaluationFact(fact))).toEqual(wire);
    }
  }, 30_000);

  it('rejects unknown members and recomputed-looking digest drift', () => {
    const plan = createV8EvaluationPlan();
    expect(
      decodeAgentEvaluationFact({
        ...encodeAgentEvaluationFact({
          factType: 'evaluation-plan',
          value: plan,
        }),
        credential: 'must-not-enter-wire',
      })
    ).toMatchObject({ ok: false });
    expect(
      decodeAgentEvaluationFact({
        wireVersion: 1,
        factType: 'evaluation-plan',
        value: { ...plan, plannedJourneyCount: 1 },
      })
    ).toMatchObject({ ok: false });

    const attempt = createV8CodecAttemptFixture(plan);
    const wire = encodeAgentEvaluationFact({
      factType: 'evaluation-attempt',
      value: attempt,
    });
    const poisonedValue = {
      ...(wire.value as AgentModelEvaluationAttempt),
      credentialRef: 'must-not-enter-current-fact',
    };
    const { attemptDigest: _attemptDigest, ...poisonedBase } = poisonedValue;
    expect(
      decodeAgentEvaluationFact({
        ...wire,
        value: {
          ...poisonedBase,
          attemptDigest: digestAgentCanonicalValue(poisonedBase),
        },
      })
    ).toMatchObject({ ok: false });
  });
});
