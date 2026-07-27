import { canonicalJsonText } from '@prodivix/shared/canonical';
import {
  digestNodeGraphProgramValue,
  type NodeGraphProgram,
} from './nodeGraphPlanner';
import {
  executeNodeGraphProgram,
  type ExecuteNodeGraphProgramInput,
  type NodeGraphProgramExecutionResult,
} from './nodeGraphProgramRuntime';

export type NodeGraphExecutionSurface = 'preview' | 'export' | 'ci';

export type NodeGraphProgramArtifact = Readonly<{
  mediaType: 'application/vnd.prodivix.nodegraph-program+json';
  text: string;
  digest: string;
}>;

export type NodeGraphSurfaceRuntimeAdapter = Readonly<{
  surface: NodeGraphExecutionSurface;
  adapterId: string;
  materialize(program: NodeGraphProgram): NodeGraphProgramArtifact;
  invoke(input: ExecuteNodeGraphProgramInput): Promise<
    Readonly<{
      surface: NodeGraphExecutionSurface;
      adapterId: string;
      artifactDigest: string;
      result: NodeGraphProgramExecutionResult;
    }>
  >;
}>;

const verifyProgram = (program: NodeGraphProgram): void => {
  const { programDigest: _programDigest, ...unsigned } = program;
  if (digestNodeGraphProgramValue(unsigned) !== program.programDigest) {
    throw new TypeError(
      'NodeGraph surface adapter rejected a Program digest mismatch.'
    );
  }
};

const readArtifact = (artifact: NodeGraphProgramArtifact): NodeGraphProgram => {
  const value = JSON.parse(artifact.text) as NodeGraphProgram;
  verifyProgram(value);
  if (digestNodeGraphProgramValue(value) !== artifact.digest) {
    throw new TypeError(
      'NodeGraph surface adapter rejected an artifact digest mismatch.'
    );
  }
  return value;
};

export const createNodeGraphSurfaceRuntimeAdapter = (
  surface: NodeGraphExecutionSurface
): NodeGraphSurfaceRuntimeAdapter => {
  const adapterId =
    surface === 'preview'
      ? 'nodegraph.preview.browser'
      : surface === 'export'
        ? 'nodegraph.export.snapshot'
        : 'nodegraph.ci.verification';
  const materialize = (program: NodeGraphProgram): NodeGraphProgramArtifact => {
    verifyProgram(program);
    const text = canonicalJsonText(program);
    return Object.freeze({
      mediaType: 'application/vnd.prodivix.nodegraph-program+json' as const,
      text,
      digest: digestNodeGraphProgramValue(program),
    });
  };
  return Object.freeze({
    surface,
    adapterId,
    materialize,
    async invoke(input) {
      const artifact = materialize(input.program);
      const program =
        surface === 'preview' ? input.program : readArtifact(artifact);
      return Object.freeze({
        surface,
        adapterId,
        artifactDigest: artifact.digest,
        result: await executeNodeGraphProgram({ ...input, program }),
      });
    },
  });
};
