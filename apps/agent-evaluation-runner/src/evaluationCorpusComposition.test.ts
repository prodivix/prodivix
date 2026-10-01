import { describe, expect, it } from 'vitest';
import { G4_V8_MINIMUM_EVALUATION_CORPUS } from '@prodivix/ai';
import { AGENT_EVALUATION_OWNER_CORPUS } from './evaluationCorpusComposition';

describe('evaluation corpus application composition', () => {
  it('resolves all 96 public fixture semantic references through the current Authoring owner', () => {
    expect(AGENT_EVALUATION_OWNER_CORPUS.publicFixtures).toHaveLength(96);
    expect(AGENT_EVALUATION_OWNER_CORPUS.publicCorpusDigest).toBe(
      G4_V8_MINIMUM_EVALUATION_CORPUS.publicCorpusDigest
    );
    expect(AGENT_EVALUATION_OWNER_CORPUS.cases).toEqual(
      G4_V8_MINIMUM_EVALUATION_CORPUS.cases
    );
  });
});
