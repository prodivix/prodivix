import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import {
  decodeAgentPolicy,
  digestAgentPolicy,
  encodeAgentPolicy,
  validateAgentPolicy,
} from './agentPolicyCodec';
import { createDefaultAgentPolicy } from './agentPolicyDefaults';

const policyNameArbitrary = fc
  .array(fc.constantFrom('A', 'b', '雪', '😀', '<', '&', '9', ' '), {
    minLength: 1,
    maxLength: 48,
  })
  .map((parts) => parts.join('').trim())
  .filter((value) => value.length > 0);

describe('AgentPolicy codec properties', () => {
  it('keeps current/wire/digest stable across object insertion order', () => {
    fc.assert(
      fc.property(policyNameArbitrary, (name) => {
        const policy = createDefaultAgentPolicy('agent.policy.property', name);
        const reversed = Object.fromEntries(
          Object.entries(policy).reverse()
        ) as unknown;
        const validation = validateAgentPolicy(reversed);
        expect(validation.ok).toBe(true);
        if (!validation.ok) return;
        expect(encodeAgentPolicy(validation.value)).toEqual(
          encodeAgentPolicy(policy)
        );
        expect(decodeAgentPolicy(encodeAgentPolicy(policy))).toEqual({
          ok: true,
          value: policy,
        });
        expect(digestAgentPolicy(validation.value)).toBe(
          digestAgentPolicy(policy)
        );
        expect(canonicalJsonText(validation.value)).toBe(
          canonicalJsonText(policy)
        );
      }),
      { numRuns: 100 }
    );
  });

  it('rejects every non-trivial permutation of a set-like policy field', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.constantFrom('canonical', 'derived', 'user-provided'),
          {
            minLength: 2,
            maxLength: 3,
          }
        ),
        (authorities) => {
          const canonical = [...authorities].sort();
          const nonCanonical = [...canonical].reverse();
          const policy = createDefaultAgentPolicy('agent.policy.order');
          expect(
            validateAgentPolicy({
              ...policy,
              contextRules: {
                ...policy.contextRules,
                allowedAuthorities: nonCanonical,
              },
            }).ok
          ).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });
});
