import { describe, expect, it } from 'vitest';
import {
  createAgentMinimumEvaluationCorpus,
  G4_V8_MINIMUM_EVALUATION_CORPUS,
} from './agentEvaluationCorpus';
import { AGENT_EVALUATION_SEMANTIC_FIXTURE_REFERENCES } from './agentEvaluationSemanticFixtureReferences';

describe('evaluation corpus semantic owner input', () => {
  it('binds every public fixture to the exact application-resolved scope', () => {
    let resolved = 0;
    const corpus = createAgentMinimumEvaluationCorpus((request) => {
      resolved += 1;
      return {
        ...request,
        id: AGENT_EVALUATION_SEMANTIC_FIXTURE_REFERENCES[request.caseId]!,
      };
    });
    expect(resolved).toBe(96);
    expect(corpus.publicCorpusDigest).toBe(
      G4_V8_MINIMUM_EVALUATION_CORPUS.publicCorpusDigest
    );
  });
  it('rejects missing IDs and a resolver returning another document scope', () => {
    expect(() =>
      createAgentMinimumEvaluationCorpus((request) => ({ ...request, id: '' }))
    ).toThrow(/scope/u);
    expect(() =>
      createAgentMinimumEvaluationCorpus((request) => ({
        ...request,
        id: 'opaque.owner.reference',
        documentId: 'other',
      }))
    ).toThrow(/scope/u);
  });
});
