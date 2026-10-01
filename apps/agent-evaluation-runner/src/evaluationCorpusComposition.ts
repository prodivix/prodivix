import {
  createAgentMinimumEvaluationCorpus,
  G4_V8_MINIMUM_EVALUATION_CORPUS,
} from '@prodivix/ai';
import { createPirNodeSymbolId } from '@prodivix/authoring';

/** Resolves the public corpus through its real semantic owner before freezing runner input. */
export const AGENT_EVALUATION_OWNER_CORPUS = createAgentMinimumEvaluationCorpus(
  ({ workspaceId, documentId, nodeId }) => ({
    id: createPirNodeSymbolId(workspaceId, documentId, nodeId),
    workspaceId,
    documentId,
    nodeId,
  })
);

if (
  AGENT_EVALUATION_OWNER_CORPUS.publicCorpusDigest !==
  G4_V8_MINIMUM_EVALUATION_CORPUS.publicCorpusDigest
) {
  throw new TypeError(
    'Public evaluation fixture references no longer bind the current semantic owner.'
  );
}
