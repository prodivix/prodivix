import type { NodeGraphDocument } from '@prodivix/nodegraph';
import { toSafeExportIdentifier } from '#src/export/naming';
import type {
  ExportProgramContribution,
  ExportSourceTrace,
} from '#src/export/types';

export type CompileNodeGraphExportInput = Readonly<{
  documentId: string;
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
}) => `export const ${input.exportName}Definition = ${JSON.stringify(
  input.definition,
  null,
  2
)} as const;

export const ${input.exportName} = createNodeGraphExecutor(${input.exportName}Definition, async (context) => ({
  input: context.input,
  graph: context.definition,
}));
`;

/** Compiles one standalone `pir-graph`; the Workspace document owns identity. */
export const compileNodeGraphExportContributions = (
  input: CompileNodeGraphExportInput
): ExportProgramContribution[] => {
  const displayName = input.displayName?.trim() || input.documentId;
  const exportName = toSafeExportIdentifier(displayName, 'nodeGraph');
  const moduleId = `nodegraph:${input.documentId}`;
  const sourceTrace = createSourceTrace(input.documentId);
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
