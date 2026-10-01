import {
  digestAgentCanonicalValue,
  hasExactAgentControlKeys,
  type AgentContextMaterial,
  type AgentContextPack,
  type AgentVerificationClosureReceipt,
} from '@prodivix/ai';
import {
  encodeVerificationClosure,
  type VerificationClosure,
  type VerificationEvidence,
} from '@prodivix/verification';

/** Content hashes bind serialized bytes; Closure and manifest hashes remain inside those bytes. */
export const workspaceAgentContextContainsRepairFailure = (
  pack: AgentContextPack,
  materials: readonly AgentContextMaterial[],
  receipt: AgentVerificationClosureReceipt,
  failure: Readonly<{
    closure: VerificationClosure;
    evidence: readonly VerificationEvidence[];
  }>
): boolean => {
  const grounded = materials.filter(
    ({ item, content }) =>
      pack.items.some(
        (entry) =>
          digestAgentCanonicalValue(entry) === digestAgentCanonicalValue(item)
      ) &&
      digestAgentCanonicalValue(content) === item.contentDigest &&
      item.source.kind === 'verification' &&
      item.instructionBoundary === 'data-only'
  );
  const contains = (kind: string, digest: string, summary: unknown) =>
    grounded.some(({ item, content }) => {
      if (item.kind !== kind) return false;
      try {
        const value: unknown = JSON.parse(content);
        return (
          hasExactAgentControlKeys(value, ['digest', 'ref', 'summary']) &&
          value.digest === digest &&
          value.ref === item.source.id &&
          digestAgentCanonicalValue(value.summary) ===
            digestAgentCanonicalValue(summary)
        );
      } catch {
        return false;
      }
    });
  return (
    contains(
      'verification-closure',
      receipt.closureDigest,
      encodeVerificationClosure(failure.closure)
    ) &&
    receipt.evidenceRefs
      .filter(({ outcome }) => outcome !== 'passed')
      .every(({ evidenceId, manifestDigest }) => {
        const evidence = failure.evidence.find(({ id }) => id === evidenceId);
        return (
          evidence !== undefined &&
          evidence.manifestDigest === manifestDigest &&
          contains('verification-evidence', manifestDigest, evidence)
        );
      })
  );
};
