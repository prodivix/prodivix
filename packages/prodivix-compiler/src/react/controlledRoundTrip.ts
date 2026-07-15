import {
  CONTROLLED_SOURCE_METADATA_KEY,
  CONTROLLED_SOURCE_SCHEMA_VERSION,
  decodeControlledSourceManifest,
  renderControlledSourceRegion,
  replaceControlledSourceRegion,
  scanControlledSourceRegions,
  type ControlledSourceManifest,
  type ControlledSourceAdapterId,
  type ControlledSourceCapability,
  type ControlledSourceRegionBinding,
} from '@prodivix/authoring';
import type { PIRDocument } from '@prodivix/pir';
import {
  applyWorkspaceCommand,
  applyWorkspaceTransaction,
  collectChangedWorkspaceDocumentIds,
  createWorkspaceCodeContentUpdateCommand,
  createWorkspaceCodeDocumentCommand,
  createWorkspaceCodeSourceUpdateCommand,
  createWorkspacePirDocumentUpdateCommand,
  decodeWorkspacePirDocument,
  getWorkspaceOperationCommands,
  getWorkspaceOperationId,
  isWorkspaceCodeDocumentContent,
  type WorkspaceCodeDocumentContent,
  type WorkspaceCommandEnvelope,
  type WorkspaceDocument,
  type WorkspaceOperation,
  type WorkspaceSnapshot,
  type WorkspaceTransactionEnvelope,
} from '@prodivix/workspace';
import {
  parseControlledReactJsxToPirDocument,
  projectPirDocumentToControlledReactJsx,
} from './controlledReactJsx';
import {
  parseControlledCssToPirDocument,
  projectPirDocumentToControlledCss,
} from './controlledCss';

const REACT_JSX_CAPABILITIES = Object.freeze([
  'element-structure',
  'literal-props',
  'literal-text',
] as const satisfies readonly ControlledSourceCapability[]);

const CSS_CAPABILITIES = Object.freeze([
  'literal-style',
] as const satisfies readonly ControlledSourceCapability[]);

const ADAPTER_CAPABILITIES: Readonly<
  Record<ControlledSourceAdapterId, readonly ControlledSourceCapability[]>
> = Object.freeze({
  'react-jsx': REACT_JSX_CAPABILITIES,
  css: CSS_CAPABILITIES,
});

export const CONTROLLED_ROUND_TRIP_ISSUE_CODES = Object.freeze({
  inputInvalid: 'CONTROLLED_ROUND_TRIP_INPUT_INVALID',
  revisionMismatch: 'CONTROLLED_ROUND_TRIP_REVISION_MISMATCH',
  pirDocumentUnavailable: 'CONTROLLED_ROUND_TRIP_PIR_UNAVAILABLE',
  codeDocumentUnavailable: 'CONTROLLED_ROUND_TRIP_CODE_UNAVAILABLE',
  manifestInvalid: 'CONTROLLED_ROUND_TRIP_MANIFEST_INVALID',
  regionInvalid: 'CONTROLLED_ROUND_TRIP_REGION_INVALID',
  adapterBlocked: 'CONTROLLED_ROUND_TRIP_ADAPTER_BLOCKED',
  driftDetected: 'CONTROLLED_ROUND_TRIP_DRIFT_DETECTED',
  operationRejected: 'CONTROLLED_ROUND_TRIP_OPERATION_REJECTED',
  noChanges: 'CONTROLLED_ROUND_TRIP_NO_CHANGES',
} as const);

export type ControlledRoundTripIssueCode =
  (typeof CONTROLLED_ROUND_TRIP_ISSUE_CODES)[keyof typeof CONTROLLED_ROUND_TRIP_ISSUE_CODES];

export type ControlledRoundTripIssue = Readonly<{
  code: ControlledRoundTripIssueCode;
  path: string;
  message: string;
  documentId?: string;
  regionId?: string;
  causeCode?: string;
}>;

export type ControlledRoundTripPlanResult =
  | Readonly<{
      status: 'ready';
      operation: WorkspaceOperation;
      pirDocumentIds: readonly string[];
      codeDocumentIds: readonly string[];
    }>
  | Readonly<{
      status: 'unchanged';
      pirDocumentIds: readonly string[];
      codeDocumentIds: readonly string[];
    }>
  | Readonly<{
      status: 'rejected';
      issues: readonly ControlledRoundTripIssue[];
    }>;

export type ControlledRoundTripAugmentResult =
  | Readonly<{ status: 'ready'; operation: WorkspaceOperation }>
  | Readonly<{
      status: 'rejected';
      issues: readonly ControlledRoundTripIssue[];
    }>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const compareIssues = (
  left: ControlledRoundTripIssue,
  right: ControlledRoundTripIssue
): number =>
  compareText(left.path, right.path) ||
  compareText(left.code, right.code) ||
  compareText(left.documentId ?? '', right.documentId ?? '') ||
  compareText(left.regionId ?? '', right.regionId ?? '') ||
  compareText(left.message, right.message);

const reject = (
  issues: readonly ControlledRoundTripIssue[]
): Readonly<{
  status: 'rejected';
  issues: readonly ControlledRoundTripIssue[];
}> => ({ status: 'rejected', issues: [...issues].sort(compareIssues) });

const valuesEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => valuesEqual(value, right[index]))
    );
  }
  if (
    typeof left !== 'object' ||
    left === null ||
    typeof right !== 'object' ||
    right === null
  ) {
    return false;
  }
  const leftRecord = left as Readonly<Record<string, unknown>>;
  const rightRecord = right as Readonly<Record<string, unknown>>;
  const leftKeys = Object.keys(leftRecord).sort(compareText);
  const rightKeys = Object.keys(rightRecord).sort(compareText);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        valuesEqual(leftRecord[key], rightRecord[key])
    )
  );
};

const applyOperation = (
  workspace: WorkspaceSnapshot,
  operation: WorkspaceOperation
):
  | Readonly<{ ok: true; snapshot: WorkspaceSnapshot }>
  | Readonly<{ ok: false; message: string }> => {
  const result =
    operation.kind === 'command'
      ? applyWorkspaceCommand(workspace, operation.command)
      : applyWorkspaceTransaction(workspace, operation.transaction);
  return result.ok
    ? { ok: true, snapshot: result.snapshot }
    : {
        ok: false,
        message:
          result.issues[0]?.message ?? 'The Workspace operation was rejected.',
      };
};

const createBinding = (input: {
  documentId: string;
  regionId: string;
  adapterId: ControlledSourceAdapterId;
}): ControlledSourceRegionBinding => ({
  id: input.regionId,
  owner: { kind: 'pir-document', documentId: input.documentId },
  adapterId: input.adapterId,
  controlledOwnership: 'pir-owned',
  capabilities: ADAPTER_CAPABILITIES[input.adapterId],
});

const createManifest = (
  binding: ControlledSourceRegionBinding
): ControlledSourceManifest => ({
  schemaVersion: CONTROLLED_SOURCE_SCHEMA_VERSION,
  unmanagedOwnership: 'code-owned',
  regions: [binding],
});

const toDefaultRegionId = (
  documentId: string,
  adapterId: ControlledSourceAdapterId
): string =>
  `pir.${encodeURIComponent(documentId).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  )}.${adapterId}`;

const findControlledOwnerBindings = (
  workspace: WorkspaceSnapshot,
  pirDocumentId: string
): readonly Readonly<{
  codeDocumentId: string;
  binding: ControlledSourceRegionBinding;
}>[] =>
  Object.values(workspace.docsById)
    .filter(
      (document) =>
        document.type === 'code' &&
        isWorkspaceCodeDocumentContent(document.content)
    )
    .flatMap((document) => {
      const content = document.content as WorkspaceCodeDocumentContent;
      const decoded = decodeControlledSourceManifest(content.metadata);
      return decoded.status === 'valid'
        ? decoded.manifest.regions
            .filter((binding) => binding.owner.documentId === pirDocumentId)
            .map((binding) => ({ codeDocumentId: document.id, binding }))
        : [];
    })
    .sort(
      (left, right) =>
        compareText(left.codeDocumentId, right.codeDocumentId) ||
        compareText(left.binding.id, right.binding.id)
    );

const rejectExistingOwner = (
  workspace: WorkspaceSnapshot,
  pirDocumentId: string,
  adapterId: ControlledSourceAdapterId
): ControlledRoundTripPlanResult | undefined => {
  const capabilities = new Set(ADAPTER_CAPABILITIES[adapterId]);
  const existing = findControlledOwnerBindings(workspace, pirDocumentId).find(
    ({ binding }) =>
      binding.capabilities.some((capability) => capabilities.has(capability))
  );
  return existing
    ? reject([
        {
          code: CONTROLLED_ROUND_TRIP_ISSUE_CODES.manifestInvalid,
          path: `/docsById/${existing.codeDocumentId}/content/metadata/${CONTROLLED_SOURCE_METADATA_KEY}`,
          message: `PIR document "${pirDocumentId}" already has a writable projection for ${existing.binding.capabilities.join(', ')}.`,
          documentId: existing.codeDocumentId,
          regionId: existing.binding.id,
        },
      ])
    : undefined;
};

const validateBaseRevision = (
  workspace: WorkspaceSnapshot,
  baseRevision: number
): ControlledRoundTripIssue | undefined =>
  workspace.workspaceRev === baseRevision
    ? undefined
    : {
        code: CONTROLLED_ROUND_TRIP_ISSUE_CODES.revisionMismatch,
        path: '/baseRevision',
        message: `Expected Workspace revision ${baseRevision}, received ${workspace.workspaceRev}.`,
      };

const readPirDocument = (
  workspace: WorkspaceSnapshot,
  documentId: string
):
  | Readonly<{
      ok: true;
      workspaceDocument: WorkspaceDocument;
      document: PIRDocument;
    }>
  | Readonly<{ ok: false; issue: ControlledRoundTripIssue }> => {
  const workspaceDocument = workspace.docsById[documentId];
  if (!workspaceDocument) {
    return {
      ok: false,
      issue: {
        code: CONTROLLED_ROUND_TRIP_ISSUE_CODES.pirDocumentUnavailable,
        path: `/docsById/${documentId}`,
        message: `PIR document "${documentId}" does not exist.`,
        documentId,
      },
    };
  }
  const read = decodeWorkspacePirDocument(workspaceDocument, {
    workspaceId: workspace.id,
  });
  if (read.status !== 'valid') {
    return {
      ok: false,
      issue: {
        code: CONTROLLED_ROUND_TRIP_ISSUE_CODES.pirDocumentUnavailable,
        path: `/docsById/${documentId}/content`,
        message: `PIR document "${documentId}" is not valid PIR-current.`,
        documentId,
      },
    };
  }
  return {
    ok: true,
    workspaceDocument,
    document: read.decodedContent,
  };
};

const readCodeDocument = (
  workspace: WorkspaceSnapshot,
  documentId: string
):
  | Readonly<{
      ok: true;
      document: WorkspaceDocument;
      content: WorkspaceCodeDocumentContent;
    }>
  | Readonly<{ ok: false; issue: ControlledRoundTripIssue }> => {
  const document = workspace.docsById[documentId];
  if (
    !document ||
    document.type !== 'code' ||
    !isWorkspaceCodeDocumentContent(document.content)
  ) {
    return {
      ok: false,
      issue: {
        code: CONTROLLED_ROUND_TRIP_ISSUE_CODES.codeDocumentUnavailable,
        path: `/docsById/${documentId}`,
        message: `Code document "${documentId}" is unavailable.`,
        documentId,
      },
    };
  }
  return { ok: true, document, content: document.content };
};

const mapAdapterIssues = (
  issues: readonly Readonly<{
    code: string;
    path: string;
    message: string;
  }>[],
  documentId: string,
  regionId: string
): readonly ControlledRoundTripIssue[] =>
  issues.map((issue) => ({
    code: CONTROLLED_ROUND_TRIP_ISSUE_CODES.adapterBlocked,
    path: `/docsById/${documentId}/content${issue.path}`,
    message: issue.message,
    documentId,
    regionId,
    causeCode: issue.code,
  }));

const hasExactCapabilities = (
  binding: ControlledSourceRegionBinding
): boolean => {
  const expected = ADAPTER_CAPABILITIES[binding.adapterId];
  return (
    binding.capabilities.length === expected.length &&
    expected.every((capability) => binding.capabilities.includes(capability))
  );
};

const adapterSupportsLanguage = (
  adapterId: ControlledSourceAdapterId,
  language: WorkspaceCodeDocumentContent['language']
): boolean =>
  adapterId === 'react-jsx'
    ? language === 'ts' || language === 'js'
    : language === 'css';

const projectBinding = (
  binding: ControlledSourceRegionBinding,
  document: PIRDocument
) =>
  binding.adapterId === 'react-jsx'
    ? projectPirDocumentToControlledReactJsx(document)
    : projectPirDocumentToControlledCss(document);

const parseBinding = (input: {
  binding: ControlledSourceRegionBinding;
  body: string;
  baseDocument: PIRDocument;
}) =>
  input.binding.adapterId === 'react-jsx'
    ? parseControlledReactJsxToPirDocument({
        body: input.body,
        baseDocument: input.baseDocument,
      })
    : parseControlledCssToPirDocument({
        body: input.body,
        baseDocument: input.baseDocument,
      });

const readManifest = (
  codeDocumentId: string,
  content: WorkspaceCodeDocumentContent
):
  | Readonly<{ ok: true; manifest: ControlledSourceManifest }>
  | Readonly<{ ok: false; issues: readonly ControlledRoundTripIssue[] }> => {
  const decoded = decodeControlledSourceManifest(content.metadata);
  if (decoded.status === 'valid') {
    const unsupported = decoded.manifest.regions.filter(
      (binding) =>
        !hasExactCapabilities(binding) ||
        !adapterSupportsLanguage(binding.adapterId, content.language)
    );
    return unsupported.length === 0
      ? { ok: true, manifest: decoded.manifest }
      : {
          ok: false,
          issues: unsupported.map((binding) => ({
            code: CONTROLLED_ROUND_TRIP_ISSUE_CODES.manifestInvalid,
            path: `/docsById/${codeDocumentId}/content/metadata/${CONTROLLED_SOURCE_METADATA_KEY}/regions/${binding.id}`,
            message: `The ${binding.adapterId} binding must use its exact capability set and a matching Code language.`,
            documentId: codeDocumentId,
            regionId: binding.id,
          })),
        };
  }
  return {
    ok: false,
    issues:
      decoded.status === 'absent'
        ? [
            {
              code: CONTROLLED_ROUND_TRIP_ISSUE_CODES.manifestInvalid,
              path: `/docsById/${codeDocumentId}/content/metadata/${CONTROLLED_SOURCE_METADATA_KEY}`,
              message: 'The Code document has no controlled source manifest.',
              documentId: codeDocumentId,
            },
          ]
        : decoded.issues.map((issue) => ({
            code: CONTROLLED_ROUND_TRIP_ISSUE_CODES.manifestInvalid,
            path: `/docsById/${codeDocumentId}/content/metadata${issue.path}`,
            message: issue.message,
            documentId: codeDocumentId,
            ...(issue.regionId ? { regionId: issue.regionId } : {}),
            causeCode: issue.code,
          })),
  };
};

const readRegionBody = (input: {
  codeDocumentId: string;
  regionId: string;
  source: string;
}):
  | Readonly<{ ok: true; body: string }>
  | Readonly<{ ok: false; issues: readonly ControlledRoundTripIssue[] }> => {
  const scanned = scanControlledSourceRegions(input.source);
  if (scanned.status === 'invalid') {
    return {
      ok: false,
      issues: scanned.issues.map((issue) => ({
        code: CONTROLLED_ROUND_TRIP_ISSUE_CODES.regionInvalid,
        path: `/docsById/${input.codeDocumentId}/content/source${issue.path}`,
        message: issue.message,
        documentId: input.codeDocumentId,
        ...(issue.regionId ? { regionId: issue.regionId } : {}),
        causeCode: issue.code,
      })),
    };
  }
  const region = scanned.regions.find(
    (candidate) => candidate.id === input.regionId
  );
  return region
    ? { ok: true, body: region.body }
    : {
        ok: false,
        issues: [
          {
            code: CONTROLLED_ROUND_TRIP_ISSUE_CODES.regionInvalid,
            path: `/docsById/${input.codeDocumentId}/content/source`,
            message: `Controlled source region "${input.regionId}" is missing.`,
            documentId: input.codeDocumentId,
            regionId: input.regionId,
          },
        ],
      };
};

const assertCanonicalRegion = (input: {
  codeDocumentId: string;
  source: string;
  binding: ControlledSourceRegionBinding;
  pirDocument: PIRDocument;
}): readonly ControlledRoundTripIssue[] => {
  const projection = projectBinding(input.binding, input.pirDocument);
  if (projection.status === 'blocked') {
    return mapAdapterIssues(
      projection.issues,
      input.binding.owner.documentId,
      input.binding.id
    );
  }
  const region = readRegionBody({
    codeDocumentId: input.codeDocumentId,
    regionId: input.binding.id,
    source: input.source,
  });
  if (!region.ok) return region.issues;
  return region.body === projection.body
    ? []
    : [
        {
          code: CONTROLLED_ROUND_TRIP_ISSUE_CODES.driftDetected,
          path: `/docsById/${input.codeDocumentId}/content/source`,
          message: `Controlled region "${input.binding.id}" no longer matches its PIR owner. Reconcile it before applying another visual change.`,
          documentId: input.codeDocumentId,
          regionId: input.binding.id,
        },
      ];
};

const appendRegion = (source: string, renderedRegion: string): string => {
  if (!source) return `${renderedRegion}\n`;
  const separator = source.endsWith('\n\n')
    ? ''
    : source.endsWith('\n')
      ? '\n'
      : '\n\n';
  return `${source}${separator}${renderedRegion}\n`;
};

const toOperation = (
  workspaceId: string,
  transactionId: string,
  issuedAt: string,
  commands: readonly WorkspaceCommandEnvelope[],
  label: string
): WorkspaceOperation =>
  commands.length === 1
    ? {
        kind: 'command',
        command: { ...commands[0]!, id: transactionId },
      }
    : {
        kind: 'transaction',
        transaction: {
          id: transactionId,
          workspaceId,
          issuedAt,
          commands: [...commands],
          label,
        },
      };

const finalizePlan = (input: {
  workspace: WorkspaceSnapshot;
  operation: WorkspaceOperation;
  pirDocumentIds: readonly string[];
  codeDocumentIds: readonly string[];
}): ControlledRoundTripPlanResult => {
  const applied = applyOperation(input.workspace, input.operation);
  if (!applied.ok) {
    return reject([
      {
        code: CONTROLLED_ROUND_TRIP_ISSUE_CODES.operationRejected,
        path: '/operation',
        message: applied.message,
      },
    ]);
  }
  return {
    status: 'ready',
    operation: input.operation,
    pirDocumentIds: [...new Set(input.pirDocumentIds)].sort(compareText),
    codeDocumentIds: [...new Set(input.codeDocumentIds)].sort(compareText),
  };
};

export type ControlledCodeDocumentInput = Readonly<{
  codeDocumentId: string;
  nodeId: string;
  name: string;
  regionId?: string;
}>;

/** Creates the canonical JSX and CSS projections as one atomic Workspace operation. */
export const createControlledCodeDocumentsPlan = (input: {
  workspace: WorkspaceSnapshot;
  baseRevision: number;
  pirDocumentId: string;
  parentNodeId: string;
  jsx: ControlledCodeDocumentInput;
  css: ControlledCodeDocumentInput;
  operationId: string;
  issuedAt: string;
}): ControlledRoundTripPlanResult => {
  const revisionIssue = validateBaseRevision(
    input.workspace,
    input.baseRevision
  );
  if (revisionIssue) return reject([revisionIssue]);
  const pir = readPirDocument(input.workspace, input.pirDocumentId);
  if (!pir.ok) return reject([pir.issue]);
  for (const adapterId of ['react-jsx', 'css'] as const) {
    const existingOwner = rejectExistingOwner(
      input.workspace,
      input.pirDocumentId,
      adapterId
    );
    if (existingOwner) return existingOwner;
  }

  const jsxBinding = createBinding({
    documentId: input.pirDocumentId,
    regionId:
      input.jsx.regionId ?? toDefaultRegionId(input.pirDocumentId, 'react-jsx'),
    adapterId: 'react-jsx',
  });
  const cssBinding = createBinding({
    documentId: input.pirDocumentId,
    regionId:
      input.css.regionId ?? toDefaultRegionId(input.pirDocumentId, 'css'),
    adapterId: 'css',
  });
  const projections = [
    {
      adapterId: 'react-jsx' as const,
      binding: jsxBinding,
      document: input.jsx,
      language: 'ts' as const,
      projection: projectBinding(jsxBinding, pir.document),
    },
    {
      adapterId: 'css' as const,
      binding: cssBinding,
      document: input.css,
      language: 'css' as const,
      projection: projectBinding(cssBinding, pir.document),
    },
  ];
  const adapterIssues = projections.flatMap(({ binding, projection }) =>
    projection.status === 'blocked'
      ? mapAdapterIssues(projection.issues, input.pirDocumentId, binding.id)
      : []
  );
  if (adapterIssues.length > 0) return reject(adapterIssues);

  const rendered = projections.map((entry) => ({
    ...entry,
    rendered:
      entry.projection.status === 'ready'
        ? renderControlledSourceRegion({
            regionId: entry.binding.id,
            body: entry.projection.body,
          })
        : undefined,
  }));
  const renderIssues = rendered.flatMap((entry) =>
    entry.rendered?.status === 'invalid'
      ? entry.rendered.issues.map((issue) => ({
          code: CONTROLLED_ROUND_TRIP_ISSUE_CODES.inputInvalid,
          path: issue.path,
          message: issue.message,
          regionId: entry.binding.id,
          causeCode: issue.code,
        }))
      : []
  );
  if (renderIssues.length > 0) return reject(renderIssues);

  const jsx = rendered[0]!;
  const jsxCommand = createWorkspaceCodeDocumentCommand({
    workspace: input.workspace,
    commandId: `${input.operationId}:jsx`,
    issuedAt: input.issuedAt,
    parentNodeId: input.parentNodeId,
    documentId: jsx.document.codeDocumentId,
    nodeId: jsx.document.nodeId,
    name: jsx.document.name,
    content: {
      language: 'ts',
      source: `${jsx.rendered!.status === 'ready' ? jsx.rendered!.source : ''}\n`,
      metadata: {
        [CONTROLLED_SOURCE_METADATA_KEY]: createManifest(jsx.binding),
      },
    },
    label: `Create controlled JSX for ${pir.workspaceDocument.path}`,
  });
  const withJsx = applyWorkspaceCommand(input.workspace, jsxCommand);
  if (!withJsx.ok) {
    return reject([
      {
        code: CONTROLLED_ROUND_TRIP_ISSUE_CODES.operationRejected,
        path: '/jsx',
        message:
          withJsx.issues[0]?.message ??
          'The controlled JSX document could not be created.',
      },
    ]);
  }
  const css = rendered[1]!;
  const cssCommand = createWorkspaceCodeDocumentCommand({
    workspace: withJsx.snapshot,
    commandId: `${input.operationId}:css`,
    issuedAt: input.issuedAt,
    parentNodeId: input.parentNodeId,
    documentId: css.document.codeDocumentId,
    nodeId: css.document.nodeId,
    name: css.document.name,
    content: {
      language: 'css',
      source: `${css.rendered!.status === 'ready' ? css.rendered!.source : ''}\n`,
      metadata: {
        [CONTROLLED_SOURCE_METADATA_KEY]: createManifest(css.binding),
      },
    },
    label: `Create controlled CSS for ${pir.workspaceDocument.path}`,
  });
  return finalizePlan({
    workspace: input.workspace,
    operation: toOperation(
      input.workspace.id,
      input.operationId,
      input.issuedAt,
      [jsxCommand, cssCommand],
      `Create controlled code for ${pir.workspaceDocument.path}`
    ),
    pirDocumentIds: [input.pirDocumentId],
    codeDocumentIds: [input.jsx.codeDocumentId, input.css.codeDocumentId],
  });
};

/** Attaches one new PIR-owned region to an existing code-owned document. */
export const createControlledSourceAttachmentPlan = (input: {
  workspace: WorkspaceSnapshot;
  baseRevision: number;
  pirDocumentId: string;
  codeDocumentId: string;
  adapterId: ControlledSourceAdapterId;
  regionId?: string;
  operationId: string;
  issuedAt: string;
}): ControlledRoundTripPlanResult => {
  const revisionIssue = validateBaseRevision(
    input.workspace,
    input.baseRevision
  );
  if (revisionIssue) return reject([revisionIssue]);
  const pir = readPirDocument(input.workspace, input.pirDocumentId);
  if (!pir.ok) return reject([pir.issue]);
  const existingOwner = rejectExistingOwner(
    input.workspace,
    input.pirDocumentId,
    input.adapterId
  );
  if (existingOwner) return existingOwner;
  const code = readCodeDocument(input.workspace, input.codeDocumentId);
  if (!code.ok) return reject([code.issue]);
  if (!adapterSupportsLanguage(input.adapterId, code.content.language)) {
    return reject([
      {
        code: CONTROLLED_ROUND_TRIP_ISSUE_CODES.manifestInvalid,
        path: `/docsById/${input.codeDocumentId}/content/language`,
        message: `The ${input.adapterId} adapter cannot control a ${code.content.language} document.`,
        documentId: input.codeDocumentId,
      },
    ]);
  }
  const regionId =
    input.regionId ?? toDefaultRegionId(input.pirDocumentId, input.adapterId);
  const manifestRead = decodeControlledSourceManifest(code.content.metadata);
  if (manifestRead.status === 'invalid') {
    return reject(
      manifestRead.issues.map((issue) => ({
        code: CONTROLLED_ROUND_TRIP_ISSUE_CODES.manifestInvalid,
        path: `/docsById/${input.codeDocumentId}/content/metadata${issue.path}`,
        message: issue.message,
        documentId: input.codeDocumentId,
        ...(issue.regionId ? { regionId: issue.regionId } : {}),
        causeCode: issue.code,
      }))
    );
  }
  const existingRegions =
    manifestRead.status === 'valid' ? manifestRead.manifest.regions : [];
  if (manifestRead.status === 'valid') {
    const validatedManifest = readManifest(input.codeDocumentId, code.content);
    if (!validatedManifest.ok) return reject(validatedManifest.issues);
  }
  if (
    existingRegions.some(
      (binding) =>
        binding.id === regionId ||
        binding.owner.documentId === input.pirDocumentId
    )
  ) {
    return reject([
      {
        code: CONTROLLED_ROUND_TRIP_ISSUE_CODES.manifestInvalid,
        path: `/docsById/${input.codeDocumentId}/content/metadata/${CONTROLLED_SOURCE_METADATA_KEY}`,
        message:
          'This Code document already controls that PIR document or region id.',
        documentId: input.codeDocumentId,
        regionId,
      },
    ]);
  }
  const existingScan = scanControlledSourceRegions(code.content.source);
  if (existingScan.status === 'invalid') {
    return reject(
      existingScan.issues.map((issue) => ({
        code: CONTROLLED_ROUND_TRIP_ISSUE_CODES.regionInvalid,
        path: `/docsById/${input.codeDocumentId}/content/source${issue.path}`,
        message: issue.message,
        documentId: input.codeDocumentId,
        ...(issue.regionId ? { regionId: issue.regionId } : {}),
        causeCode: issue.code,
      }))
    );
  }
  const existingManifestRegionIds = new Set(
    existingRegions.map((binding) => binding.id)
  );
  if (
    existingScan.regions.length !== existingManifestRegionIds.size ||
    existingScan.regions.some(
      (region) => !existingManifestRegionIds.has(region.id)
    )
  ) {
    return reject([
      {
        code: CONTROLLED_ROUND_TRIP_ISSUE_CODES.regionInvalid,
        path: `/docsById/${input.codeDocumentId}/content/source`,
        message:
          'Existing controlled source markers must match the ownership manifest before attaching another region.',
        documentId: input.codeDocumentId,
      },
    ]);
  }
  if (existingScan.regions.some((region) => region.id === regionId)) {
    return reject([
      {
        code: CONTROLLED_ROUND_TRIP_ISSUE_CODES.regionInvalid,
        path: `/docsById/${input.codeDocumentId}/content/source`,
        message: `Controlled source region "${regionId}" already exists.`,
        documentId: input.codeDocumentId,
        regionId,
      },
    ]);
  }
  const binding = createBinding({
    documentId: input.pirDocumentId,
    regionId,
    adapterId: input.adapterId,
  });
  const projection = projectBinding(binding, pir.document);
  if (projection.status === 'blocked') {
    return reject(
      mapAdapterIssues(projection.issues, input.pirDocumentId, regionId)
    );
  }
  const rendered = renderControlledSourceRegion({
    regionId,
    body: projection.body,
  });
  if (rendered.status === 'invalid') {
    return reject(
      rendered.issues.map((issue) => ({
        code: CONTROLLED_ROUND_TRIP_ISSUE_CODES.regionInvalid,
        path: issue.path,
        message: issue.message,
        documentId: input.codeDocumentId,
        regionId,
        causeCode: issue.code,
      }))
    );
  }
  const manifest: ControlledSourceManifest = {
    schemaVersion: CONTROLLED_SOURCE_SCHEMA_VERSION,
    unmanagedOwnership: 'code-owned',
    regions: [...existingRegions, binding].sort((left, right) =>
      compareText(left.id, right.id)
    ),
  };
  const command = createWorkspaceCodeContentUpdateCommand({
    workspaceId: input.workspace.id,
    document: code.document,
    content: {
      ...code.content,
      source: appendRegion(code.content.source, rendered.source),
      metadata: {
        ...code.content.metadata,
        [CONTROLLED_SOURCE_METADATA_KEY]: manifest,
      },
    },
    commandId: input.operationId,
    issuedAt: input.issuedAt,
    label: `Attach controlled ${input.adapterId} for ${pir.workspaceDocument.path}`,
  });
  if (!command) {
    return reject([
      {
        code: CONTROLLED_ROUND_TRIP_ISSUE_CODES.noChanges,
        path: '/operation',
        message: 'The controlled source attachment produced no change.',
      },
    ]);
  }
  return finalizePlan({
    workspace: input.workspace,
    operation: { kind: 'command', command },
    pirDocumentIds: [input.pirDocumentId],
    codeDocumentIds: [input.codeDocumentId],
  });
};

/** Converts an edited controlled Code projection into one reversible operation. */
export const createControlledCodeEditPlan = (input: {
  workspace: WorkspaceSnapshot;
  baseRevision: number;
  codeDocumentId: string;
  source: string;
  operationId: string;
  issuedAt: string;
}): ControlledRoundTripPlanResult => {
  const revisionIssue = validateBaseRevision(
    input.workspace,
    input.baseRevision
  );
  if (revisionIssue) return reject([revisionIssue]);
  const code = readCodeDocument(input.workspace, input.codeDocumentId);
  if (!code.ok) return reject([code.issue]);
  const manifest = readManifest(input.codeDocumentId, code.content);
  if (!manifest.ok) return reject(manifest.issues);
  const ownerIds = new Set<string>();
  for (const binding of manifest.manifest.regions) {
    if (ownerIds.has(binding.owner.documentId)) {
      return reject([
        {
          code: CONTROLLED_ROUND_TRIP_ISSUE_CODES.manifestInvalid,
          path: `/docsById/${input.codeDocumentId}/content/metadata/${CONTROLLED_SOURCE_METADATA_KEY}`,
          message:
            'One Code document can expose only one controlled region for each PIR owner.',
          documentId: input.codeDocumentId,
          regionId: binding.id,
        },
      ]);
    }
    ownerIds.add(binding.owner.documentId);
  }
  const candidateScan = scanControlledSourceRegions(input.source);
  if (candidateScan.status === 'invalid') {
    return reject(
      candidateScan.issues.map((issue) => ({
        code: CONTROLLED_ROUND_TRIP_ISSUE_CODES.regionInvalid,
        path: `/docsById/${input.codeDocumentId}/content/source${issue.path}`,
        message: issue.message,
        documentId: input.codeDocumentId,
        ...(issue.regionId ? { regionId: issue.regionId } : {}),
        causeCode: issue.code,
      }))
    );
  }
  const declaredRegionIds = new Set(
    manifest.manifest.regions.map((binding) => binding.id)
  );
  const undeclared = candidateScan.regions.filter(
    (region) => !declaredRegionIds.has(region.id)
  );
  if (
    undeclared.length > 0 ||
    candidateScan.regions.length !== declaredRegionIds.size
  ) {
    return reject([
      {
        code: CONTROLLED_ROUND_TRIP_ISSUE_CODES.regionInvalid,
        path: `/docsById/${input.codeDocumentId}/content/source`,
        message:
          'Controlled source markers must match the ownership manifest exactly.',
        documentId: input.codeDocumentId,
        ...(undeclared[0] ? { regionId: undeclared[0].id } : {}),
      },
    ]);
  }

  const issues: ControlledRoundTripIssue[] = [];
  const pirCommands: WorkspaceCommandEnvelope[] = [];
  const pirDocumentIds: string[] = [];
  let canonicalSource = input.source;
  for (const binding of manifest.manifest.regions) {
    const pir = readPirDocument(input.workspace, binding.owner.documentId);
    if (!pir.ok) {
      issues.push(pir.issue);
      continue;
    }
    issues.push(
      ...assertCanonicalRegion({
        codeDocumentId: input.codeDocumentId,
        source: code.content.source,
        binding,
        pirDocument: pir.document,
      })
    );
    const candidateRegion = readRegionBody({
      codeDocumentId: input.codeDocumentId,
      regionId: binding.id,
      source: input.source,
    });
    if (!candidateRegion.ok) {
      issues.push(...candidateRegion.issues);
      continue;
    }
    const parsed = parseBinding({
      binding,
      body: candidateRegion.body,
      baseDocument: pir.document,
    });
    if (parsed.status === 'blocked') {
      issues.push(
        ...mapAdapterIssues(parsed.issues, binding.owner.documentId, binding.id)
      );
      continue;
    }
    const replacement = replaceControlledSourceRegion({
      source: canonicalSource,
      regionId: binding.id,
      body: parsed.body,
    });
    if (replacement.status === 'invalid') {
      issues.push(
        ...replacement.issues.map((issue) => ({
          code: CONTROLLED_ROUND_TRIP_ISSUE_CODES.regionInvalid,
          path: `/docsById/${input.codeDocumentId}/content/source${issue.path}`,
          message: issue.message,
          documentId: input.codeDocumentId,
          regionId: binding.id,
          causeCode: issue.code,
        }))
      );
      continue;
    }
    canonicalSource = replacement.source;
    if (!valuesEqual(pir.document, parsed.document)) {
      const command = createWorkspacePirDocumentUpdateCommand({
        workspace: input.workspace,
        documentId: binding.owner.documentId,
        before: pir.document,
        after: parsed.document,
        commandId: `${input.operationId}:pir:${binding.owner.documentId}`,
        issuedAt: input.issuedAt,
        namespace: 'core.pir.controlled-source',
        type: 'controlled-code.apply',
        label: `Apply controlled ${binding.adapterId} to ${pir.workspaceDocument.path}`,
      });
      if (command) {
        pirCommands.push(command);
        pirDocumentIds.push(binding.owner.documentId);
      }
    }
  }
  if (issues.length > 0) return reject(issues);
  const codeCommand = createWorkspaceCodeSourceUpdateCommand({
    workspaceId: input.workspace.id,
    document: code.document,
    source: canonicalSource,
    commandId: `${input.operationId}:code:${input.codeDocumentId}`,
    issuedAt: input.issuedAt,
    label: `Update ${code.document.path}`,
  });
  const commands = [...pirCommands, ...(codeCommand ? [codeCommand] : [])];
  if (commands.length === 0) {
    return {
      status: 'unchanged',
      pirDocumentIds: [],
      codeDocumentIds: [input.codeDocumentId],
    };
  }
  return finalizePlan({
    workspace: input.workspace,
    operation: toOperation(
      input.workspace.id,
      input.operationId,
      input.issuedAt,
      commands,
      `Controlled visual/code update for ${code.document.path}`
    ),
    pirDocumentIds: [...new Set(pirDocumentIds)].sort(compareText),
    codeDocumentIds: [input.codeDocumentId],
  });
};

const changedPirDocumentIds = (
  before: WorkspaceSnapshot,
  after: WorkspaceSnapshot
): readonly string[] =>
  collectChangedWorkspaceDocumentIds(before, after)
    .filter((documentId) => {
      const beforeDocument = before.docsById[documentId];
      const afterDocument = after.docsById[documentId];
      return Boolean(
        (beforeDocument &&
          ['pir-page', 'pir-layout', 'pir-component'].includes(
            beforeDocument.type
          )) ||
        (afterDocument &&
          ['pir-page', 'pir-layout', 'pir-component'].includes(
            afterDocument.type
          ))
      );
    })
    .sort(compareText);

const operationChangesDocument = (
  operation: WorkspaceOperation,
  documentId: string
): boolean =>
  getWorkspaceOperationCommands(operation).some(
    (command) => command.target.documentId === documentId
  );

/** Adds every affected controlled projection to a canonical PIR operation. */
export const augmentWorkspaceOperationWithControlledSource = (input: {
  workspace: WorkspaceSnapshot;
  operation: WorkspaceOperation;
}): ControlledRoundTripAugmentResult => {
  const applied = applyOperation(input.workspace, input.operation);
  if (!applied.ok) {
    return reject([
      {
        code: CONTROLLED_ROUND_TRIP_ISSUE_CODES.operationRejected,
        path: '/operation',
        message: applied.message,
      },
    ]);
  }
  const changedPirIds = new Set(
    changedPirDocumentIds(input.workspace, applied.snapshot)
  );

  const issues: ControlledRoundTripIssue[] = [];
  const syncCommands: WorkspaceCommandEnvelope[] = [];
  const ownerLocations = new Map<
    string,
    Readonly<{ codeDocumentId: string; regionId: string }>
  >();
  for (const candidateDocument of Object.values(applied.snapshot.docsById).sort(
    (left, right) => compareText(left.id, right.id)
  )) {
    if (
      candidateDocument.type !== 'code' ||
      !isWorkspaceCodeDocumentContent(candidateDocument.content)
    ) {
      continue;
    }
    const hasReservedMetadata = Object.hasOwn(
      candidateDocument.content.metadata ?? {},
      CONTROLLED_SOURCE_METADATA_KEY
    );
    const candidateManifest = decodeControlledSourceManifest(
      candidateDocument.content.metadata
    );
    if (candidateManifest.status === 'invalid' && hasReservedMetadata) {
      issues.push(
        ...candidateManifest.issues.map((issue) => ({
          code: CONTROLLED_ROUND_TRIP_ISSUE_CODES.manifestInvalid,
          path: `/docsById/${candidateDocument.id}/content/metadata${issue.path}`,
          message: issue.message,
          documentId: candidateDocument.id,
          ...(issue.regionId ? { regionId: issue.regionId } : {}),
          causeCode: issue.code,
        }))
      );
      continue;
    }
    if (candidateManifest.status !== 'valid') continue;
    const validatedCandidateManifest = readManifest(
      candidateDocument.id,
      candidateDocument.content
    );
    if (!validatedCandidateManifest.ok) {
      issues.push(...validatedCandidateManifest.issues);
      continue;
    }
    const candidateBindings = validatedCandidateManifest.manifest.regions;
    const scanned = scanControlledSourceRegions(
      candidateDocument.content.source
    );
    const declaredIds = new Set(candidateBindings.map((binding) => binding.id));
    if (
      scanned.status === 'invalid' ||
      scanned.regions.length !== declaredIds.size ||
      scanned.regions.some((region) => !declaredIds.has(region.id))
    ) {
      issues.push({
        code: CONTROLLED_ROUND_TRIP_ISSUE_CODES.regionInvalid,
        path: `/docsById/${candidateDocument.id}/content/source`,
        message:
          'Controlled source markers must match the ownership manifest exactly.',
        documentId: candidateDocument.id,
      });
      continue;
    }
    for (const binding of candidateBindings) {
      for (const capability of binding.capabilities) {
        const ownershipKey = `${binding.owner.documentId}:${capability}`;
        const existingOwner = ownerLocations.get(ownershipKey);
        if (existingOwner) {
          issues.push({
            code: CONTROLLED_ROUND_TRIP_ISSUE_CODES.manifestInvalid,
            path: `/docsById/${candidateDocument.id}/content/metadata/${CONTROLLED_SOURCE_METADATA_KEY}`,
            message: `PIR capability "${capability}" has more than one writable Code projection.`,
            documentId: candidateDocument.id,
            regionId: binding.id,
          });
        } else {
          ownerLocations.set(ownershipKey, {
            codeDocumentId: candidateDocument.id,
            regionId: binding.id,
          });
        }
      }
    }
    const previousDocument = input.workspace.docsById[candidateDocument.id];
    const previousManifest =
      previousDocument?.type === 'code' &&
      isWorkspaceCodeDocumentContent(previousDocument.content)
        ? decodeControlledSourceManifest(previousDocument.content.metadata)
        : { status: 'absent' as const };
    if (previousManifest.status === 'valid') continue;
    for (const binding of candidateBindings) {
      const owner = readPirDocument(applied.snapshot, binding.owner.documentId);
      if (!owner.ok) {
        issues.push(owner.issue);
        continue;
      }
      issues.push(
        ...assertCanonicalRegion({
          codeDocumentId: candidateDocument.id,
          source: candidateDocument.content.source,
          binding,
          pirDocument: owner.document,
        })
      );
    }
  }
  if (issues.length > 0) return reject(issues);

  for (const codeDocument of Object.values(input.workspace.docsById).sort(
    (left, right) => compareText(left.id, right.id)
  )) {
    if (
      codeDocument.type !== 'code' ||
      !isWorkspaceCodeDocumentContent(codeDocument.content)
    ) {
      continue;
    }
    const manifestRead = decodeControlledSourceManifest(
      codeDocument.content.metadata
    );
    if (manifestRead.status !== 'valid') continue;
    const affectedBindings = manifestRead.manifest.regions.filter((binding) =>
      changedPirIds.has(binding.owner.documentId)
    );
    const codeChanged = operationChangesDocument(
      input.operation,
      codeDocument.id
    );
    if (affectedBindings.length === 0 && !codeChanged) continue;

    const candidateCodeDocument = applied.snapshot.docsById[codeDocument.id];
    if (
      !candidateCodeDocument ||
      candidateCodeDocument.type !== 'code' ||
      !isWorkspaceCodeDocumentContent(candidateCodeDocument.content)
    ) {
      issues.push({
        code: CONTROLLED_ROUND_TRIP_ISSUE_CODES.codeDocumentUnavailable,
        path: `/docsById/${codeDocument.id}`,
        message:
          'An operation cannot remove a Code document while changing its controlled PIR owner.',
        documentId: codeDocument.id,
      });
      continue;
    }

    let nextSource = codeDocument.content.source;
    for (const binding of affectedBindings) {
      const beforePir = readPirDocument(
        input.workspace,
        binding.owner.documentId
      );
      const afterPir = readPirDocument(
        applied.snapshot,
        binding.owner.documentId
      );
      if (!beforePir.ok) {
        issues.push(beforePir.issue);
        continue;
      }
      if (!afterPir.ok) {
        issues.push(afterPir.issue);
        continue;
      }
      issues.push(
        ...assertCanonicalRegion({
          codeDocumentId: codeDocument.id,
          source: codeDocument.content.source,
          binding,
          pirDocument: beforePir.document,
        })
      );
      const projection = projectBinding(binding, afterPir.document);
      if (projection.status === 'blocked') {
        issues.push(
          ...mapAdapterIssues(
            projection.issues,
            binding.owner.documentId,
            binding.id
          )
        );
        continue;
      }
      const replaced = replaceControlledSourceRegion({
        source: nextSource,
        regionId: binding.id,
        body: projection.body,
      });
      if (replaced.status === 'invalid') {
        issues.push(
          ...replaced.issues.map((issue) => ({
            code: CONTROLLED_ROUND_TRIP_ISSUE_CODES.regionInvalid,
            path: `/docsById/${codeDocument.id}/content/source${issue.path}`,
            message: issue.message,
            documentId: codeDocument.id,
            regionId: binding.id,
            causeCode: issue.code,
          }))
        );
        continue;
      }
      nextSource = replaced.source;
    }
    if (issues.length > 0) continue;

    if (codeChanged) {
      const candidateManifest = decodeControlledSourceManifest(
        candidateCodeDocument.content.metadata
      );
      if (
        candidateManifest.status !== 'valid' ||
        !valuesEqual(candidateManifest.manifest, manifestRead.manifest)
      ) {
        issues.push({
          code: CONTROLLED_ROUND_TRIP_ISSUE_CODES.manifestInvalid,
          path: `/docsById/${codeDocument.id}/content/metadata/${CONTROLLED_SOURCE_METADATA_KEY}`,
          message:
            'Controlled ownership metadata cannot be changed by an ordinary Code operation.',
          documentId: codeDocument.id,
        });
        continue;
      }
      for (const binding of manifestRead.manifest.regions) {
        const afterPir = readPirDocument(
          applied.snapshot,
          binding.owner.documentId
        );
        if (!afterPir.ok) {
          issues.push(afterPir.issue);
          continue;
        }
        issues.push(
          ...assertCanonicalRegion({
            codeDocumentId: codeDocument.id,
            source: candidateCodeDocument.content.source,
            binding,
            pirDocument: afterPir.document,
          })
        );
      }
      continue;
    }

    const command = createWorkspaceCodeSourceUpdateCommand({
      workspaceId: input.workspace.id,
      document: codeDocument,
      source: nextSource,
      commandId: `${getWorkspaceOperationId(input.operation)}:controlled:${codeDocument.id}`,
      issuedAt:
        input.operation.kind === 'command'
          ? input.operation.command.issuedAt
          : input.operation.transaction.issuedAt,
      label: `Synchronize ${codeDocument.path}`,
    });
    if (command) syncCommands.push(command);
  }
  if (issues.length > 0) return reject(issues);
  if (syncCommands.length === 0) {
    return { status: 'ready', operation: input.operation };
  }
  if (input.operation.kind === 'transaction') {
    return {
      status: 'ready',
      operation: {
        ...input.operation,
        transaction: {
          ...input.operation.transaction,
          commands: [...input.operation.transaction.commands, ...syncCommands],
        },
      },
    };
  }
  const command = input.operation.command;
  const transaction: WorkspaceTransactionEnvelope = {
    id: command.id,
    workspaceId: input.workspace.id,
    issuedAt: command.issuedAt,
    commands: [{ ...command, id: `${command.id}:visual` }, ...syncCommands],
    ...(command.label ? { label: command.label } : {}),
    ...(command.mergeKey ? { mergeKey: command.mergeKey } : {}),
  };
  return {
    status: 'ready',
    operation: {
      kind: 'transaction',
      transaction,
    },
  };
};
