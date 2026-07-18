import {
  findRouteNodeById,
  type WorkspaceRouteCodeReference,
  type WorkspaceRouteNode,
} from '@prodivix/router';
import type { CodeArtifactLanguage } from '@prodivix/authoring';
import {
  decodeServerRuntimeProfile,
  resolveServerFunctionDefinition,
  writeServerRuntimeProfile,
  type ServerRuntimeAuthConfiguration,
  type ServerFunctionDefinition,
  type ServerFunctionReference,
  type ServerRuntimeProfile,
} from '@prodivix/server-runtime';
import {
  applyWorkspaceCommand,
  type WorkspaceTransactionEnvelope,
} from './workspaceCommand';
import { createWorkspaceDocumentAtPathCommand } from './workspaceDocumentFactory';
import {
  createWorkspaceRouteIntentPlan,
  type WorkspaceRouteIntentPlan,
} from './workspaceRouteIntent';
import { readWorkspaceServerRuntimeAuthConfiguration } from './workspaceServerRuntimeAuthConfiguration';
import type { WorkspaceDocument, WorkspaceSnapshot } from './types';

export type WorkspaceServerRuntimeRouteSlot = 'loader' | 'action' | 'guard';

export type WorkspaceServerRuntimeAuthoringCandidate = Readonly<{
  key: string;
  slot: WorkspaceServerRuntimeRouteSlot;
  reference: ServerFunctionReference;
  documentPath: string;
  definition: ServerFunctionDefinition;
}>;

export type WorkspaceServerRuntimeAuthoringIssueCode =
  | 'WKS-EXPORT-SERVER-PROFILE-INVALID'
  | 'WKS-EXPORT-SERVER-EXPORT-REQUIRED'
  | 'WKS-EXPORT-SERVER-DEFINITION-MISSING'
  | 'WKS-EXPORT-SERVER-SLOT-MISMATCH'
  | 'WKS-EXPORT-SERVER-AUTH-CONFIG-INVALID'
  | 'WKS-EXPORT-SERVER-AUTH-CONFIG-REQUIRED'
  | 'WKS-EXPORT-SERVER-PERMISSION-UNDECLARED';

export type WorkspaceServerRuntimeAuthoringIssue = Readonly<{
  code: WorkspaceServerRuntimeAuthoringIssueCode;
  message: string;
  path: string;
  routeNodeId: string;
  slot: WorkspaceServerRuntimeRouteSlot;
  artifactId: string;
  exportName?: string;
}>;

export type WorkspaceServerRuntimeRouteBinding = Readonly<{
  routeNodeId: string;
  slot: WorkspaceServerRuntimeRouteSlot;
  reference: ServerFunctionReference;
  candidateKey: string;
}>;

export type WorkspaceServerRuntimeAuthoringProjection = Readonly<{
  authConfiguration: ServerRuntimeAuthConfiguration | null;
  candidates: readonly WorkspaceServerRuntimeAuthoringCandidate[];
  bindings: readonly WorkspaceServerRuntimeRouteBinding[];
  issues: readonly WorkspaceServerRuntimeAuthoringIssue[];
}>;

export type WorkspaceServerRuntimeBindingPlanResult =
  | Readonly<{
      status: 'ready';
      plan: WorkspaceRouteIntentPlan;
      candidate?: WorkspaceServerRuntimeAuthoringCandidate;
    }>
  | Readonly<{ status: 'unchanged' }>
  | Readonly<{
      status: 'rejected';
      code:
        | 'WKS_SERVER_RUNTIME_ROUTE_MISSING'
        | 'WKS_SERVER_RUNTIME_CANDIDATE_MISSING'
        | 'WKS_SERVER_RUNTIME_SLOT_MISMATCH'
        | 'WKS_SERVER_RUNTIME_BINDING_INVALID';
      message: string;
    }>;

export type WorkspaceOwnerGuardTarget = 'remote-live' | 'isolated-production';

export type WorkspaceOwnerGuardTransactionPlanResult =
  | Readonly<{
      status: 'ready';
      plan: Readonly<{
        transaction: WorkspaceTransactionEnvelope;
        functionRef: ServerFunctionReference;
        documentId: string;
      }>;
    }>
  | Readonly<{
      status: 'rejected';
      code:
        | 'WKS_SERVER_RUNTIME_ROUTE_MISSING'
        | 'WKS_SERVER_RUNTIME_PRESET_INVALID'
        | 'WKS_SERVER_RUNTIME_ARTIFACT_UNSUPPORTED'
        | 'WKS_SERVER_RUNTIME_BINDING_INVALID';
      message: string;
    }>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const CODE_ARTIFACT_LANGUAGES = new Set<CodeArtifactLanguage>([
  'ts',
  'js',
  'css',
  'scss',
  'glsl',
  'wgsl',
  'expr',
]);

const slotForDefinition = (
  definition: ServerFunctionDefinition
): WorkspaceServerRuntimeRouteSlot | undefined =>
  definition.kind === 'route-loader'
    ? 'loader'
    : definition.kind === 'route-action'
      ? 'action'
      : definition.kind === 'route-guard'
        ? 'guard'
        : undefined;

export const createWorkspaceServerRuntimeCandidateKey = (
  reference: ServerFunctionReference
): string => `${reference.artifactId}#${reference.exportName}`;

const collectRouteNodes = (
  root: WorkspaceRouteNode
): readonly WorkspaceRouteNode[] => [
  root,
  ...(root.children ?? []).flatMap(collectRouteNodes),
];

const runtimeReferences = (
  node: WorkspaceRouteNode
): readonly Readonly<{
  slot: WorkspaceServerRuntimeRouteSlot;
  reference: WorkspaceRouteCodeReference | undefined;
}>[] => [
  Object.freeze({ slot: 'loader', reference: node.runtime?.loaderRef }),
  Object.freeze({ slot: 'action', reference: node.runtime?.actionRef }),
  Object.freeze({ slot: 'guard', reference: node.runtime?.guardRef }),
];

const readProfile = (document: WorkspaceDocument | undefined) => {
  if (
    !document ||
    document.type !== 'code' ||
    !document.content ||
    typeof document.content !== 'object' ||
    Array.isArray(document.content)
  ) {
    return undefined;
  }
  const content = document.content as Readonly<Record<string, unknown>>;
  const language = content.language;
  if (
    typeof language !== 'string' ||
    !CODE_ARTIFACT_LANGUAGES.has(language as CodeArtifactLanguage) ||
    typeof content.source !== 'string'
  ) {
    return undefined;
  }
  const metadata =
    content.metadata &&
    typeof content.metadata === 'object' &&
    !Array.isArray(content.metadata)
      ? (content.metadata as Readonly<Record<string, unknown>>)
      : undefined;
  return decodeServerRuntimeProfile(metadata, language as CodeArtifactLanguage);
};

/** Projects route-bindable canonical Server Functions and exact binding issues. */
export const projectWorkspaceServerRuntimeAuthoring = (
  workspace: WorkspaceSnapshot
): WorkspaceServerRuntimeAuthoringProjection => {
  const authConfigurationRead =
    readWorkspaceServerRuntimeAuthConfiguration(workspace);
  const profileByArtifactId = new Map<
    string,
    NonNullable<ReturnType<typeof readProfile>>
  >();
  const candidates: WorkspaceServerRuntimeAuthoringCandidate[] = [];
  Object.values(workspace.docsById)
    .sort(
      (left, right) =>
        compareText(left.path, right.path) || compareText(left.id, right.id)
    )
    .forEach((document) => {
      const decoded = readProfile(document);
      if (!decoded || decoded.status === 'absent') return;
      profileByArtifactId.set(document.id, decoded);
      if (decoded.status !== 'valid') return;
      Object.keys(decoded.profile.functionsByExport)
        .sort(compareText)
        .forEach((exportName) => {
          const definition = resolveServerFunctionDefinition(
            decoded.profile,
            document.id,
            exportName
          );
          if (!definition) return;
          const slot = slotForDefinition(definition);
          if (!slot) return;
          const reference = definition.reference;
          candidates.push(
            Object.freeze({
              key: createWorkspaceServerRuntimeCandidateKey(reference),
              slot,
              reference,
              documentPath: document.path,
              definition,
            })
          );
        });
    });
  candidates.sort(
    (left, right) =>
      compareText(left.documentPath, right.documentPath) ||
      compareText(left.reference.exportName, right.reference.exportName)
  );

  const candidateByKey = new Map(
    candidates.map((candidate) => [candidate.key, candidate])
  );
  const bindings: WorkspaceServerRuntimeRouteBinding[] = [];
  const issues: WorkspaceServerRuntimeAuthoringIssue[] = [];
  collectRouteNodes(workspace.routeManifest.root).forEach((node) => {
    runtimeReferences(node).forEach(({ slot, reference }) => {
      const artifactId = reference?.artifactId?.trim();
      if (!artifactId) return;
      const issueBase = {
        routeNodeId: node.id,
        slot,
        artifactId,
        path: `/routeManifest/runtime/${node.id}/${slot}`,
      } as const;
      const exportName = reference?.exportName?.trim();
      if (!exportName) {
        issues.push(
          Object.freeze({
            ...issueBase,
            code: 'WKS-EXPORT-SERVER-EXPORT-REQUIRED',
            message: `Route ${node.id} ${slot} must name a Server Function export.`,
          })
        );
        return;
      }
      const decoded = profileByArtifactId.get(artifactId);
      if (!decoded || decoded.status === 'absent') {
        issues.push(
          Object.freeze({
            ...issueBase,
            exportName,
            code: 'WKS-EXPORT-SERVER-DEFINITION-MISSING',
            message: `Route ${node.id} ${slot} does not resolve to a declared Server Function export.`,
          })
        );
        return;
      }
      if (decoded.status === 'invalid') {
        issues.push(
          Object.freeze({
            ...issueBase,
            exportName,
            code: 'WKS-EXPORT-SERVER-PROFILE-INVALID',
            message: `Route ${node.id} ${slot} references an invalid Server runtime profile.`,
          })
        );
        return;
      }
      const definition = resolveServerFunctionDefinition(
        decoded.profile,
        artifactId,
        exportName
      );
      if (!definition) {
        issues.push(
          Object.freeze({
            ...issueBase,
            exportName,
            code: 'WKS-EXPORT-SERVER-DEFINITION-MISSING',
            message: `Route ${node.id} ${slot} references an undeclared Server Function export.`,
          })
        );
        return;
      }
      if (slotForDefinition(definition) !== slot) {
        issues.push(
          Object.freeze({
            ...issueBase,
            exportName,
            code: 'WKS-EXPORT-SERVER-SLOT-MISMATCH',
            message: `Route ${node.id} ${slot} does not match ${definition.kind}.`,
          })
        );
        return;
      }
      const candidateKey = createWorkspaceServerRuntimeCandidateKey(
        definition.reference
      );
      if (!candidateByKey.has(candidateKey)) return;
      bindings.push(
        Object.freeze({
          routeNodeId: node.id,
          slot,
          reference: definition.reference,
          candidateKey,
        })
      );
      if (definition.auth.kind !== 'public') {
        if (authConfigurationRead.status === 'invalid') {
          issues.push(
            Object.freeze({
              ...issueBase,
              exportName,
              code: 'WKS-EXPORT-SERVER-AUTH-CONFIG-INVALID',
              message:
                'Protected Server Functions require a valid /config/auth.json declaration.',
            })
          );
          return;
        }
        if (!authConfigurationRead.configuration) {
          issues.push(
            Object.freeze({
              ...issueBase,
              exportName,
              code: 'WKS-EXPORT-SERVER-AUTH-CONFIG-REQUIRED',
              message: 'Protected Server Functions require /config/auth.json.',
            })
          );
          return;
        }
        if (
          definition.auth.kind === 'permission' &&
          !authConfigurationRead.configuration.permissionIds.includes(
            definition.auth.permissionId
          )
        ) {
          issues.push(
            Object.freeze({
              ...issueBase,
              exportName,
              code: 'WKS-EXPORT-SERVER-PERMISSION-UNDECLARED',
              message: `Server Function permission is not declared by /config/auth.json: ${definition.auth.permissionId}.`,
            })
          );
          return;
        }
      }
    });
  });
  return Object.freeze({
    authConfiguration:
      authConfigurationRead.status === 'ready'
        ? authConfigurationRead.configuration
        : null,
    candidates: Object.freeze(candidates),
    bindings: Object.freeze(bindings),
    issues: Object.freeze(issues),
  });
};

const routeRuntimeReference = (
  node: WorkspaceRouteNode,
  slot: WorkspaceServerRuntimeRouteSlot
): WorkspaceRouteCodeReference | undefined =>
  slot === 'loader'
    ? node.runtime?.loaderRef
    : slot === 'action'
      ? node.runtime?.actionRef
      : node.runtime?.guardRef;

const sameReference = (
  left: WorkspaceRouteCodeReference | undefined,
  right: ServerFunctionReference | undefined
): boolean =>
  left?.artifactId === right?.artifactId &&
  left?.exportName === right?.exportName &&
  left?.symbolId === undefined;

/** Plans a canonical Route-owned Server Function binding or unbinding. */
export const createWorkspaceServerRuntimeBindingPlan = (input: {
  workspace: WorkspaceSnapshot;
  routeNodeId: string;
  slot: WorkspaceServerRuntimeRouteSlot;
  reference?: ServerFunctionReference;
  operationId: string;
  issuedAt: string;
}): WorkspaceServerRuntimeBindingPlanResult => {
  const routeNodeId = input.routeNodeId.trim();
  const route = findRouteNodeById(
    input.workspace.routeManifest.root,
    routeNodeId
  );
  if (!route) {
    return Object.freeze({
      status: 'rejected',
      code: 'WKS_SERVER_RUNTIME_ROUTE_MISSING',
      message: `Route does not exist: ${routeNodeId}`,
    });
  }
  let candidate: WorkspaceServerRuntimeAuthoringCandidate | undefined;
  if (input.reference) {
    const key = createWorkspaceServerRuntimeCandidateKey(input.reference);
    candidate = projectWorkspaceServerRuntimeAuthoring(
      input.workspace
    ).candidates.find((entry) => entry.key === key);
    if (!candidate) {
      return Object.freeze({
        status: 'rejected',
        code: 'WKS_SERVER_RUNTIME_CANDIDATE_MISSING',
        message:
          'The Server Function must be declared by one canonical Code profile.',
      });
    }
    if (candidate.slot !== input.slot) {
      return Object.freeze({
        status: 'rejected',
        code: 'WKS_SERVER_RUNTIME_SLOT_MISMATCH',
        message: `The ${candidate.definition.kind} function cannot bind to route ${input.slot}.`,
      });
    }
  }
  if (
    sameReference(routeRuntimeReference(route, input.slot), input.reference)
  ) {
    return Object.freeze({ status: 'unchanged' });
  }
  const plan = createWorkspaceRouteIntentPlan(
    input.workspace,
    {
      type: 'set-runtime-ref',
      routeNodeId,
      kind: input.slot,
      ...(input.reference
        ? {
            reference: {
              artifactId: input.reference.artifactId,
              exportName: input.reference.exportName,
            },
          }
        : {}),
    },
    { id: input.operationId, issuedAt: input.issuedAt }
  );
  return plan
    ? Object.freeze({
        status: 'ready',
        plan,
        ...(candidate ? { candidate } : {}),
      })
    : Object.freeze({
        status: 'rejected',
        code: 'WKS_SERVER_RUNTIME_BINDING_INVALID',
        message: 'The Server Function route binding could not be planned.',
      });
};

const OWNER_GUARD_EXPORT_NAME = 'requireWorkspaceOwner';

const ownerGuardProfile = (
  target: WorkspaceOwnerGuardTarget,
  exportName: string
): ServerRuntimeProfile =>
  Object.freeze({
    schemaVersion: '1.0',
    functionsByExport: Object.freeze({
      [exportName]: Object.freeze({
        kind: 'route-guard' as const,
        runtimeZone: 'server' as const,
        adapterId:
          target === 'remote-live'
            ? 'core.auth.require-workspace-owner'
            : 'prodivix.code-export',
        effect: 'read' as const,
        auth: Object.freeze({
          kind: 'permission' as const,
          permissionId: 'workspace.owner',
        }),
        inputSchema: Object.freeze({
          type: 'object',
          additionalProperties: false,
          required: Object.freeze(['routeId']),
          properties: Object.freeze({
            routeId: Object.freeze({ type: 'string' }),
          }),
        }),
        outputSchema: true,
      }),
    }),
  });

const ownerGuardSource = (
  target: WorkspaceOwnerGuardTarget,
  exportName: string
): string =>
  target === 'remote-live'
    ? `/** Executed only by the audited Prodivix Remote workspace-owner adapter. */\nexport const ${exportName} = () => {\n  throw new Error('Use the authenticated Prodivix Remote gateway.');\n};\n`
    : `type OwnerGuardContext = Readonly<{\n  principal?: Readonly<{ providerId: string; principalId: string }>;\n}>;\n\nexport const ${exportName} = (\n  _input: Readonly<{ routeId: string }>,\n  context: OwnerGuardContext,\n) => context.principal\n  ? ({ kind: 'allow' as const })\n  : ({ kind: 'deny' as const, code: 'WORKSPACE_OWNER_REQUIRED' });\n`;

/** Creates one canonical workspace.owner guard artifact and Route binding atomically. */
export const createWorkspaceOwnerGuardTransactionPlan = (input: {
  workspace: WorkspaceSnapshot;
  routeNodeId: string;
  target: WorkspaceOwnerGuardTarget;
  documentId: string;
  path: string;
  transactionId: string;
  issuedAt: string;
  exportName?: string;
}): WorkspaceOwnerGuardTransactionPlanResult => {
  const routeNodeId = input.routeNodeId.trim();
  if (!findRouteNodeById(input.workspace.routeManifest.root, routeNodeId)) {
    return Object.freeze({
      status: 'rejected',
      code: 'WKS_SERVER_RUNTIME_ROUTE_MISSING',
      message: `Route does not exist: ${routeNodeId}`,
    });
  }
  const documentId = input.documentId.trim();
  const path = input.path.trim();
  const exportName = input.exportName?.trim() || OWNER_GUARD_EXPORT_NAME;
  if (!documentId || !path || !/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(exportName)) {
    return Object.freeze({
      status: 'rejected',
      code: 'WKS_SERVER_RUNTIME_PRESET_INVALID',
      message: 'Owner guard identity, path, or export name is invalid.',
    });
  }
  let metadata: Readonly<Record<string, unknown>>;
  try {
    metadata = writeServerRuntimeProfile(
      undefined,
      ownerGuardProfile(input.target, exportName),
      'ts'
    );
  } catch (error) {
    return Object.freeze({
      status: 'rejected',
      code: 'WKS_SERVER_RUNTIME_PRESET_INVALID',
      message:
        error instanceof Error
          ? error.message
          : 'Owner guard profile is invalid.',
    });
  }
  let createArtifact;
  try {
    createArtifact = createWorkspaceDocumentAtPathCommand({
      workspace: input.workspace,
      document: {
        id: documentId,
        type: 'code',
        name: path.split('/').at(-1),
        path,
        contentRev: 1,
        metaRev: 1,
        content: {
          language: 'ts',
          source: ownerGuardSource(input.target, exportName),
          metadata,
        },
      },
      commandId: `${input.transactionId}:artifact`,
      issuedAt: input.issuedAt,
      label: `Create ${input.target} workspace owner guard`,
    });
  } catch (error) {
    return Object.freeze({
      status: 'rejected',
      code: 'WKS_SERVER_RUNTIME_ARTIFACT_UNSUPPORTED',
      message:
        error instanceof Error
          ? error.message
          : 'Owner guard CodeArtifact could not be created.',
    });
  }
  const staged = applyWorkspaceCommand(input.workspace, createArtifact);
  if (!staged.ok) {
    return Object.freeze({
      status: 'rejected',
      code: 'WKS_SERVER_RUNTIME_ARTIFACT_UNSUPPORTED',
      message:
        staged.issues[0]?.message ??
        'Owner guard CodeArtifact failed Workspace validation.',
    });
  }
  const functionRef = Object.freeze({ artifactId: documentId, exportName });
  const binding = createWorkspaceServerRuntimeBindingPlan({
    workspace: staged.snapshot,
    routeNodeId,
    slot: 'guard',
    reference: functionRef,
    operationId: `${input.transactionId}:binding`,
    issuedAt: input.issuedAt,
  });
  if (binding.status !== 'ready' || binding.plan.kind !== 'command') {
    return Object.freeze({
      status: 'rejected',
      code: 'WKS_SERVER_RUNTIME_BINDING_INVALID',
      message:
        binding.status === 'rejected'
          ? binding.message
          : 'Owner guard Route binding could not be created.',
    });
  }
  return Object.freeze({
    status: 'ready',
    plan: Object.freeze({
      transaction: Object.freeze({
        id: input.transactionId,
        workspaceId: input.workspace.id,
        issuedAt: input.issuedAt,
        label: `Create ${input.target} workspace owner guard`,
        commands: [createArtifact, binding.plan.command],
      }),
      functionRef,
      documentId,
    }),
  });
};
