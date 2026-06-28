import type { PIRDocument } from '@prodivix/shared/types/pir';
import { toSafeExportIdentifier } from '#src/export/naming';
import type {
  ExportModule,
  ExportProgramContribution,
  ExportRuntimeRequirement,
  ExportSourceTrace,
} from '#src/export/types';

type NodeGraphRecord = Record<string, unknown>;

const asRecord = (value: unknown): NodeGraphRecord | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as NodeGraphRecord)
    : null;

const readGraphId = (graph: unknown, index: number) => {
  const record = asRecord(graph);
  const id = record?.id;
  if (typeof id === 'string' && id.trim()) return id.trim();
  return `graph-${index + 1}`;
};

const readGraphName = (graph: unknown, index: number) => {
  const record = asRecord(graph);
  const name = record?.name ?? record?.title ?? record?.label;
  if (typeof name === 'string' && name.trim()) return name.trim();
  return `Graph ${index + 1}`;
};

const createGraphSourceTrace = (
  graphId: string,
  index: number
): ExportSourceTrace[] => [
  {
    sourceRef: {
      domain: 'nodegraph',
      id: graphId,
      path: `/logic/graphs/${index}`,
    },
    ownerRootId: graphId,
  },
];

const createNodeGraphModuleBody = (input: {
  exportName: string;
  graph: unknown;
}) => `export const ${input.exportName}Definition = ${JSON.stringify(
  input.graph ?? {},
  null,
  2
)} as const;

export const ${input.exportName} = createNodeGraphExecutor(${input.exportName}Definition, async (context) => {
  return {
    input: context.input,
    graph: context.definition,
  };
});
`;

export const compileNodeGraphExportContributions = (
  pirDoc: PIRDocument
): ExportProgramContribution[] => {
  const graphs = Array.isArray(pirDoc.logic?.graphs)
    ? (pirDoc.logic?.graphs ?? [])
    : [];
  if (!graphs.length) return [];

  const modules: ExportModule[] = [];
  const runtimeRequirements: ExportRuntimeRequirement[] = [];

  graphs.forEach((graph, index) => {
    const graphId = readGraphId(graph, index);
    const graphName = readGraphName(graph, index);
    const exportName = toSafeExportIdentifier(graphName, `graph${index + 1}`);
    const sourceTrace = createGraphSourceTrace(graphId, index);
    const moduleId = `nodegraph:${graphId}`;

    modules.push({
      id: moduleId,
      kind: 'nodegraph-runtime',
      ownerRootId: graphId,
      suggestedName: exportName,
      language: 'ts',
      imports: [],
      body: createNodeGraphModuleBody({ exportName, graph }),
      sourceTrace,
      origin: {
        kind: 'generated',
        owner: 'prodivix',
        writePolicy: 'generated',
        updatePolicy: 'regenerate',
      },
    });
    runtimeRequirements.push({
      id: `nodegraph-runtime:${graphId}`,
      kind: 'nodegraph-runtime',
      ownerModuleId: moduleId,
      importName: 'createNodeGraphExecutor',
      importKind: 'named',
      sourceTrace,
    });
  });

  return [
    {
      roots: graphs.map((graph, index) => {
        const graphId = readGraphId(graph, index);
        return {
          id: graphId,
          kind: 'nodegraph',
          displayName: readGraphName(graph, index),
          sourceRef: createGraphSourceTrace(graphId, index)[0].sourceRef,
        };
      }),
      modules,
      runtimeRequirements,
    },
  ];
};
