import {
  FIRST_PARTY_NODEGRAPH_DESCRIPTORS,
  compileNodeGraphProgram,
  createFirstPartyNodeGraphDescriptorRegistry,
  type NodeGraphDocument,
  type NodeGraphProgram,
} from '@prodivix/nodegraph';
import { toSafeExportIdentifier } from '#src/export/naming';
import type {
  ExportProgramContribution,
  ExportSourceTrace,
} from '#src/export/types';

export type CompileNodeGraphExportInput = Readonly<{
  documentId: string;
  documentRevision: number;
  displayName?: string;
  definition: NodeGraphDocument;
}>;

const createSourceTrace = (
  documentId: string,
  path = '/'
): ExportSourceTrace[] => [
  {
    sourceRef: { domain: 'nodegraph', id: documentId, path },
    ownerRootId: documentId,
  },
];

const createModuleBody = (input: {
  exportName: string;
  definition: NodeGraphDocument;
  program:
    | NodeGraphProgram
    | Readonly<{
        status: 'blocked';
        documentId: string;
        issues: readonly unknown[];
      }>;
}) => `export const ${input.exportName}Definition = ${JSON.stringify(
  input.definition,
  null,
  2
)} as const;

export const ${input.exportName}Program = ${JSON.stringify(
  input.program,
  null,
  2
)} as const;

export const ${input.exportName} = createNodeGraphExecutor(${input.exportName}Program);
`;

/** Compiles one standalone `pir-graph`; the Workspace document owns identity. */
export const compileNodeGraphExportContributions = (
  input: CompileNodeGraphExportInput
): ExportProgramContribution[] => {
  const displayName = input.displayName?.trim() || input.documentId;
  const exportName = toSafeExportIdentifier(displayName, 'nodeGraph');
  const moduleId = `nodegraph:${input.documentId}`;
  const sourceTrace = createSourceTrace(input.documentId);
  const registry = createFirstPartyNodeGraphDescriptorRegistry();
  const compiled = compileNodeGraphProgram({
    documentId: input.documentId,
    documentRevision: input.documentRevision,
    graph: input.definition,
    registry,
    runtimeZone: 'client',
    availableCapabilities: Object.freeze([
      ...new Set(
        FIRST_PARTY_NODEGRAPH_DESCRIPTORS.flatMap(
          ({ requiredCapabilities }) => requiredCapabilities
        )
      ),
    ]),
  });
  const program = compiled.ok
    ? compiled.program
    : Object.freeze({
        status: 'blocked' as const,
        documentId: input.documentId,
        issues: compiled.issues,
      });
  return [
    {
      roots: [
        {
          id: input.documentId,
          kind: 'nodegraph',
          displayName,
          sourceRef: sourceTrace[0].sourceRef,
        },
      ],
      modules: [
        {
          id: moduleId,
          kind: 'nodegraph-runtime',
          ownerRootId: input.documentId,
          suggestedName: exportName,
          language: 'ts',
          imports: [],
          body: createModuleBody({
            exportName,
            definition: input.definition,
            program,
          }),
          sourceTrace,
          origin: {
            kind: 'generated',
            owner: 'prodivix',
            writePolicy: 'generated',
            updatePolicy: 'regenerate',
          },
        },
      ],
      runtimeRequirements: [
        {
          id: `nodegraph-runtime:${input.documentId}`,
          kind: 'nodegraph-runtime',
          ownerModuleId: moduleId,
          importName: 'createNodeGraphExecutor',
          importKind: 'named',
          sourceTrace,
        },
      ],
    },
  ];
};
