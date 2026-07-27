import type {
  BehaviorAction,
  BehaviorObservation,
  BehaviorScenario,
  BehaviorSemanticTargetRef,
  BehaviorTrigger,
} from '@prodivix/behavior';
import type { DiagnosticTargetRef } from '@prodivix/diagnostics';
import {
  createWorkspaceSemanticIndexFromSnapshot,
  decodeWorkspaceBehaviorVerificationDocument,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';

export type BehaviorScenarioResourceDocument =
  | Readonly<{
      status: 'ready';
      documentId: string;
      path: string;
      scenario: BehaviorScenario;
    }>
  | Readonly<{
      status: 'invalid';
      documentId: string;
      path: string;
      issueCount: number;
    }>;

export type BehaviorScenarioTargetCandidate = Readonly<{
  id: string;
  label: string;
  capability: string;
  target: BehaviorSemanticTargetRef;
  trigger?: Pick<BehaviorTrigger, 'domain' | 'event'>;
  action?: Readonly<{
    kind: BehaviorAction['kind'];
    capabilityId: string;
    runtimeZone: BehaviorAction['runtimeZone'];
    effect: BehaviorAction['effect'];
    cancellation: BehaviorAction['cancellation'];
  }>;
  observation?: BehaviorObservation['kind'];
}>;

export type BehaviorScenarioResourceModel = Readonly<{
  documents: readonly BehaviorScenarioResourceDocument[];
  targets: readonly BehaviorScenarioTargetCandidate[];
  semanticStatus: 'ready' | 'blocked';
}>;

const ownerDocumentId = (
  ownerRef: DiagnosticTargetRef,
  workspaceId: string
): string => {
  switch (ownerRef.kind) {
    case 'document':
    case 'pir-node':
    case 'inspector-field':
    case 'nodegraph-node':
    case 'nodegraph-port':
    case 'animation-timeline':
    case 'animation-track':
    case 'data-source':
    case 'data-operation':
    case 'behavior-scenario':
    case 'behavior-step':
    case 'verification-policy':
    case 'component-slot':
      return ownerRef.documentId;
    case 'code-artifact':
      return ownerRef.artifactId;
    default:
      return workspaceId;
  }
};

const behaviorTargetDescriptor = (
  capability: string
): Pick<
  BehaviorScenarioTargetCandidate,
  'action' | 'observation' | 'trigger'
> | null => {
  switch (capability) {
    case 'behavior:pir:click':
      return {
        action: {
          kind: 'semantic-click',
          capabilityId: 'pir.click',
          runtimeZone: 'client',
          effect: 'none',
          cancellation: 'none',
        },
      };
    case 'behavior:pir:input':
      return {
        action: {
          kind: 'semantic-input',
          capabilityId: 'pir.input',
          runtimeZone: 'client',
          effect: 'write',
          cancellation: 'none',
        },
      };
    case 'behavior:route:navigate':
      return {
        action: {
          kind: 'navigate',
          capabilityId: 'route.navigate',
          runtimeZone: 'client',
          effect: 'write',
          cancellation: 'cooperative',
        },
      };
    case 'behavior:route:lifecycle':
      return { trigger: { domain: 'route', event: 'entered' } };
    case 'behavior:data:dispatch':
      return {
        action: {
          kind: 'dispatch-data-operation',
          capabilityId: 'data.dispatch',
          runtimeZone: 'client',
          effect: 'write',
          cancellation: 'cooperative',
        },
      };
    case 'behavior:pir:visible':
      return { observation: 'visible' };
    case 'behavior:pir:value':
      return { observation: 'value' };
    case 'behavior:route:location':
      return { observation: 'route' };
    case 'behavior:data:lifecycle':
      return {
        trigger: { domain: 'data', event: 'lifecycle' },
        observation: 'data-lifecycle',
      };
    case 'behavior:pir:lifecycle':
      return { trigger: { domain: 'pir', event: 'mounted' } };
    case 'behavior:pir:event':
      return { trigger: { domain: 'pir', event: 'event' } };
    default:
      return null;
  }
};

export const buildBehaviorScenarioResourceModel = (
  workspace: WorkspaceSnapshot | null | undefined
): BehaviorScenarioResourceModel => {
  if (!workspace) {
    return Object.freeze({
      documents: Object.freeze([]),
      targets: Object.freeze([]),
      semanticStatus: 'blocked',
    });
  }
  const documents = Object.values(workspace.docsById)
    .filter(({ type }) => type === 'behavior-scenario')
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((document): BehaviorScenarioResourceDocument => {
      const read = decodeWorkspaceBehaviorVerificationDocument(
        document,
        'behavior-scenario'
      );
      return read.status === 'valid'
        ? Object.freeze({
            status: 'ready',
            documentId: document.id,
            path: document.path,
            scenario: read.decodedContent,
          })
        : Object.freeze({
            status: 'invalid',
            documentId: document.id,
            path: document.path,
            issueCount: read.status === 'invalid' ? read.issues.length : 1,
          });
    });
  const semantic = createWorkspaceSemanticIndexFromSnapshot(workspace);
  if (semantic.status !== 'ready') {
    return Object.freeze({
      documents: Object.freeze(documents),
      targets: Object.freeze([]),
      semanticStatus: 'blocked',
    });
  }
  const targets = semantic.index
    .getSymbols()
    .flatMap((symbol) =>
      (symbol.capabilityIds ?? []).flatMap(
        (capability): BehaviorScenarioTargetCandidate[] => {
          const descriptor = behaviorTargetDescriptor(capability);
          if (!descriptor) return [];
          return [
            Object.freeze({
              id: `${symbol.id}:${capability}`,
              label:
                symbol.displayName?.trim() ||
                symbol.qualifiedName?.trim() ||
                symbol.name,
              capability,
              target: Object.freeze({
                kind: 'semantic-symbol',
                id: symbol.id,
                workspaceDocumentId: ownerDocumentId(
                  symbol.ownerRef,
                  workspace.id
                ),
                capability,
              }),
              ...descriptor,
            }),
          ];
        }
      )
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  return Object.freeze({
    documents: Object.freeze(documents),
    targets: Object.freeze(targets),
    semanticStatus: 'ready',
  });
};
