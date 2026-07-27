import {
  createSemanticId,
  createWorkspaceDocumentScopeId,
  type SemanticContribution,
  type SemanticContributionProvider,
  type SemanticDocumentRevision,
  type SemanticSnapshotIdentity,
  type WorkspaceDependencyContribution,
  type WorkspaceReferenceFact,
  type WorkspaceScopeContribution,
  type WorkspaceSymbolContribution,
} from '@prodivix/authoring';
import type {
  BehaviorScenario,
  BehaviorSemanticTargetRef,
  BehaviorStep,
} from '@prodivix/behavior';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';

export type WorkspaceBehaviorSemanticDocumentInput = Readonly<{
  documentId: string;
  revision: SemanticDocumentRevision;
  scenario: BehaviorScenario;
}>;

export type CreateWorkspaceBehaviorSemanticContributionProviderInput =
  Readonly<{
    workspaceId: string;
    documents: readonly WorkspaceBehaviorSemanticDocumentInput[];
  }>;

export const WORKSPACE_BEHAVIOR_SEMANTIC_PROVIDER_DESCRIPTOR = Object.freeze({
  id: 'core.workspace.behavior-scenario',
  semanticVersion: '1.0.0',
});

const targetReference = (
  target: BehaviorSemanticTargetRef
): WorkspaceReferenceFact['target'] =>
  target.kind === 'semantic-symbol'
    ? Object.freeze({ kind: 'symbol-id', symbolId: target.id })
    : Object.freeze({ kind: 'name', name: target.id });

const collectTargetReference = (
  input: Readonly<{
    workspaceId: string;
    documentId: string;
    scenarioScopeId: string;
    stepId: string;
    sourceSymbolId: string;
    target: BehaviorSemanticTargetRef;
    role: 'action' | 'barrier-observation' | 'entry' | 'observation';
  }>
): WorkspaceReferenceFact =>
  Object.freeze({
    id: createSemanticId(
      'behavior-target-reference',
      input.workspaceId,
      input.documentId,
      input.stepId,
      input.role
    ),
    kind: 'behavior-target',
    sourceRef:
      input.role === 'entry'
        ? {
            kind: 'behavior-scenario' as const,
            documentId: input.documentId,
          }
        : {
            kind: 'behavior-step' as const,
            documentId: input.documentId,
            stepId: input.stepId,
          },
    sourceSymbolId: input.sourceSymbolId,
    scopeId: input.scenarioScopeId,
    target: targetReference(input.target),
    resolutionMode: 'addressable',
    requiredCapabilityIds: Object.freeze([input.target.capability]),
    requiresDurableTarget: true,
  });

const collectSteps = (
  input: Readonly<{
    workspaceId: string;
    documentId: string;
    scenarioScopeId: string;
    scenarioSymbolId: string;
    steps: readonly BehaviorStep[];
    symbols: WorkspaceSymbolContribution[];
    references: WorkspaceReferenceFact[];
    dependencies: WorkspaceDependencyContribution[];
  }>
): void => {
  input.steps.forEach((step) => {
    const stepSymbolId = createSemanticId(
      'behavior-step-symbol',
      input.workspaceId,
      input.documentId,
      step.id
    );
    input.symbols.push({
      id: stepSymbolId,
      stability: 'durable',
      kind: 'behavior-step',
      name: step.id,
      displayName: step.label?.trim() || step.id,
      qualifiedName: `${input.documentId}#${step.id}`,
      scopeId: input.scenarioScopeId,
      ownerRef: {
        kind: 'behavior-step',
        documentId: input.documentId,
        stepId: step.id,
      },
      typeRef: `behavior-step:${step.kind}`,
      capabilityIds: Object.freeze([`behavior-step:${step.kind}`]),
    });
    input.dependencies.push({
      id: createSemanticId(
        'behavior-step-scenario-dependency',
        input.workspaceId,
        input.documentId,
        step.id
      ),
      kind: 'behavior',
      sourceSymbolId: stepSymbolId,
      targetSymbolId: input.scenarioSymbolId,
    });

    if (step.kind === 'action') {
      input.references.push(
        collectTargetReference({
          ...input,
          stepId: step.id,
          sourceSymbolId: stepSymbolId,
          target: step.action.target,
          role: 'action',
        })
      );
    } else if (step.kind === 'observation') {
      input.references.push(
        collectTargetReference({
          ...input,
          stepId: step.id,
          sourceSymbolId: stepSymbolId,
          target: step.observation.target,
          role: 'observation',
        })
      );
      step.assertions.forEach((assertion) => {
        input.symbols.push({
          id: createSemanticId(
            'behavior-assertion-symbol',
            input.workspaceId,
            input.documentId,
            step.id,
            assertion.id
          ),
          stability: 'durable',
          kind: 'behavior-assertion',
          name: assertion.id,
          displayName: assertion.id,
          qualifiedName: `${input.documentId}#${step.id}.${assertion.id}`,
          scopeId: input.scenarioScopeId,
          ownerRef: {
            kind: 'behavior-step',
            documentId: input.documentId,
            stepId: step.id,
            assertionId: assertion.id,
          },
          typeRef: `behavior-assertion:${assertion.operator}`,
          capabilityIds: Object.freeze(['behavior:assertion']),
        });
      });
    } else if (step.kind === 'parallel') {
      collectSteps({ ...input, steps: step.steps });
    } else if (step.observation) {
      input.references.push(
        collectTargetReference({
          ...input,
          stepId: step.id,
          sourceSymbolId: stepSymbolId,
          target: step.observation.target,
          role: 'barrier-observation',
        })
      );
    }
  });
};

const contribute = (
  input: CreateWorkspaceBehaviorSemanticContributionProviderInput
): SemanticContribution => {
  const scopes: WorkspaceScopeContribution[] = [];
  const symbols: WorkspaceSymbolContribution[] = [];
  const references: WorkspaceReferenceFact[] = [];
  const dependencies: WorkspaceDependencyContribution[] = [];
  [...input.documents]
    .sort((left, right) =>
      compareUnicodeCodePoints(left.documentId, right.documentId)
    )
    .forEach(({ documentId, scenario }) => {
      const scenarioScopeId = createSemanticId(
        'behavior-scenario-scope',
        input.workspaceId,
        documentId
      );
      const scenarioSymbolId = createSemanticId(
        'behavior-scenario-symbol',
        input.workspaceId,
        documentId
      );
      scopes.push({
        id: scenarioScopeId,
        kind: 'behavior-scenario',
        ownerRef: { kind: 'behavior-scenario', documentId },
        parentId: createWorkspaceDocumentScopeId(input.workspaceId, documentId),
      });
      symbols.push({
        id: scenarioSymbolId,
        stability: 'durable',
        kind: 'behavior-scenario',
        name: scenario.id,
        displayName: scenario.name,
        qualifiedName: documentId,
        scopeId: createWorkspaceDocumentScopeId(input.workspaceId, documentId),
        ownerRef: { kind: 'behavior-scenario', documentId },
        typeRef: 'behavior-scenario',
        capabilityIds: Object.freeze(['behavior:scenario']),
      });
      if (scenario.entry.target) {
        references.push(
          collectTargetReference({
            workspaceId: input.workspaceId,
            documentId,
            scenarioScopeId,
            stepId: scenario.entry.id,
            sourceSymbolId: scenarioSymbolId,
            target: scenario.entry.target,
            role: 'entry',
          })
        );
      }
      collectSteps({
        workspaceId: input.workspaceId,
        documentId,
        scenarioScopeId,
        scenarioSymbolId,
        steps: scenario.steps,
        symbols,
        references,
        dependencies,
      });
    });
  return Object.freeze({
    scopes: Object.freeze(scopes),
    symbols: Object.freeze(symbols),
    references: Object.freeze(references),
    dependencies: Object.freeze(dependencies),
  });
};

const assertSnapshotIdentity = (
  input: CreateWorkspaceBehaviorSemanticContributionProviderInput,
  identity: SemanticSnapshotIdentity
): void => {
  if (identity.workspaceRevisions.workspaceId !== input.workspaceId) {
    throw new Error('Behavior semantic provider workspace identity mismatch.');
  }
  for (const document of input.documents) {
    const actual =
      identity.workspaceRevisions.documentRevs[document.documentId];
    if (
      !actual ||
      actual.contentRev !== document.revision.contentRev ||
      actual.metaRev !== document.revision.metaRev
    ) {
      throw new Error(
        `Behavior semantic provider snapshot mismatch for document "${document.documentId}".`
      );
    }
  }
};

export const createWorkspaceBehaviorSemanticContributionProvider = (
  input: CreateWorkspaceBehaviorSemanticContributionProviderInput
): SemanticContributionProvider =>
  Object.freeze({
    descriptor: WORKSPACE_BEHAVIOR_SEMANTIC_PROVIDER_DESCRIPTOR,
    contribute: (identity) => {
      assertSnapshotIdentity(input, identity);
      return contribute(input);
    },
  });
