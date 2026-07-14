import {
  type SemanticContribution,
  type SemanticContributionProvider,
  type SemanticDocumentRevision,
  type SemanticSnapshotIdentity,
} from '@prodivix/authoring';
import type { PIRComponentContract, PIRDocument } from '../pir.types';
import { validatePirDocument } from '../pirValidator';
import {
  addPirComponentContractFacts,
  type MutablePIRSemanticContribution,
} from './pirSemanticContractFacts';
import {
  addPirDocumentGraphFacts,
  type PIRGraphDocumentType,
} from './pirSemanticGraphFacts';

export const PIR_SEMANTIC_PROVIDER_DESCRIPTOR = Object.freeze({
  id: 'core.pir',
  semanticVersion: '1.0.0',
});

export type PIRSemanticDocumentType = PIRGraphDocumentType;

export type PIRSemanticDocumentInput = Readonly<{
  documentId: string;
  documentType: PIRSemanticDocumentType;
  revision: SemanticDocumentRevision;
  document: PIRDocument;
}>;

export type CreatePIRSemanticContributionProviderInput = Readonly<{
  workspaceId: string;
  documents: readonly PIRSemanticDocumentInput[];
}>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const assertDocumentRevision = (
  identity: SemanticSnapshotIdentity,
  workspaceId: string,
  input: PIRSemanticDocumentInput
): void => {
  const actual = identity.workspaceRevisions.documentRevs[input.documentId];
  if (
    identity.workspaceRevisions.workspaceId !== workspaceId ||
    !actual ||
    actual.contentRev !== input.revision.contentRev ||
    actual.metaRev !== input.revision.metaRev
  ) {
    throw new Error(
      `PIR semantic provider snapshot mismatch for document "${input.documentId}".`
    );
  }
};

const assertCanonicalDocument = (
  input: PIRSemanticDocumentInput,
  componentContractsByDocumentId: ReadonlyMap<string, PIRComponentContract>
): void => {
  const validation = validatePirDocument(input.document, {
    resolveComponentContract: (documentId) =>
      componentContractsByDocumentId.get(documentId),
  });
  if (!validation.valid) {
    throw new Error(
      `PIR semantic provider received invalid document "${input.documentId}".`
    );
  }
  const isComponent = input.documentType === 'pir-component';
  if (isComponent !== Boolean(input.document.componentContract)) {
    throw new Error(
      `PIR document "${input.documentId}" has a component contract that does not match its document type.`
    );
  }
};

const freezeFacts = <T>(facts: T[]): readonly T[] =>
  Object.freeze(facts.map((fact) => Object.freeze(fact)));

const createContribution = (
  input: CreatePIRSemanticContributionProviderInput,
  identity: SemanticSnapshotIdentity
): SemanticContribution => {
  const contribution: MutablePIRSemanticContribution = {
    scopes: [],
    symbols: [],
    references: [],
    dependencies: [],
  };
  const componentContractsByDocumentId = new Map<string, PIRComponentContract>(
    input.documents.flatMap((documentInput) =>
      documentInput.documentType === 'pir-component' &&
      documentInput.document.componentContract
        ? [
            [
              documentInput.documentId,
              documentInput.document.componentContract,
            ] as const,
          ]
        : []
    )
  );
  const documentIds = new Set<string>();
  for (const documentInput of [...input.documents].sort((left, right) =>
    compareText(left.documentId, right.documentId)
  )) {
    if (documentIds.has(documentInput.documentId)) {
      throw new Error(
        `PIR semantic provider received duplicate document "${documentInput.documentId}".`
      );
    }
    documentIds.add(documentInput.documentId);
    assertDocumentRevision(identity, input.workspaceId, documentInput);
    assertCanonicalDocument(documentInput, componentContractsByDocumentId);
    if (documentInput.documentType === 'pir-component') {
      addPirComponentContractFacts(
        contribution,
        input.workspaceId,
        documentInput.documentId,
        documentInput.document.componentContract!
      );
    }
    addPirDocumentGraphFacts(contribution, {
      workspaceId: input.workspaceId,
      documentId: documentInput.documentId,
      documentType: documentInput.documentType,
      document: documentInput.document,
    });
  }
  return Object.freeze({
    scopes: freezeFacts(contribution.scopes),
    symbols: freezeFacts(contribution.symbols),
    references: freezeFacts(contribution.references),
    dependencies: freezeFacts(contribution.dependencies),
  });
};

/**
 * Projects decoded PIR documents into revision-bound domain facts while
 * retaining Workspace ownership of document and Component definition identity.
 */
export const createPirSemanticContributionProvider = (
  input: CreatePIRSemanticContributionProviderInput
): SemanticContributionProvider => ({
  descriptor: PIR_SEMANTIC_PROVIDER_DESCRIPTOR,
  contribute(identity) {
    if (identity.workspaceRevisions.workspaceId !== input.workspaceId) {
      throw new Error('PIR semantic provider workspace identity mismatch.');
    }
    return createContribution(input, identity);
  },
});
