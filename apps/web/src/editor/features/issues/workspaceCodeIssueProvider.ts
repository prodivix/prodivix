import { typescriptLanguage } from '@codemirror/lang-javascript';
import type { LRLanguage } from '@codemirror/language';
import type { CodeArtifact } from '@prodivix/authoring';
import type { ProdivixDiagnostic } from '@prodivix/diagnostics';
import {
  createWorkspaceCodeArtifactProvider,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import { getWorkspaceCodeLanguageDiagnostics } from '@/editor/codeLanguage';
import { createSourceSpanFromOffsets } from '@/editor/navigation';

type ParserErrorRange = Readonly<{ from: number; to: number }>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const collectParserErrors = (
  language: LRLanguage,
  source: string
): ParserErrorRange[] => {
  const errors: ParserErrorRange[] = [];
  language.parser.parse(source).iterate({
    enter(node) {
      if (node.type.isError) errors.push({ from: node.from, to: node.to });
    },
  });
  return errors;
};

const deduplicateRanges = (
  ranges: readonly ParserErrorRange[]
): ParserErrorRange[] => {
  const seen = new Set<string>();
  return ranges.filter((range) => {
    const key = `${range.from}:${range.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const parseArtifact = (
  artifact: CodeArtifact
): { code: 'COD-1001' | 'COD-1004'; errors: ParserErrorRange[] } | null => {
  if (artifact.language === 'expr') {
    const wrappedSource = `(${artifact.source}\n)`;
    return {
      code: 'COD-1004',
      errors: deduplicateRanges(
        collectParserErrors(typescriptLanguage, wrappedSource).map((range) => ({
          from: Math.min(artifact.source.length, Math.max(0, range.from - 1)),
          to: Math.min(artifact.source.length, Math.max(0, range.to - 1)),
        }))
      ),
    };
  }

  return null;
};

const createArtifactDiagnostic = (input: {
  artifact: CodeArtifact;
  code: 'COD-1001' | 'COD-1004';
  range: ParserErrorRange;
}): ProdivixDiagnostic => ({
  code: input.code,
  severity: 'error',
  domain: 'code',
  message:
    input.code === 'COD-1004'
      ? 'The code artifact must contain one valid expression.'
      : 'The code artifact contains syntax that cannot be parsed.',
  hint: 'Open the code location and correct the highlighted syntax.',
  docsUrl: `/reference/diagnostics/${input.code.toLowerCase()}`,
  targetRef: { kind: 'code-artifact', artifactId: input.artifact.id },
  sourceSpan: createSourceSpanFromOffsets({
    artifactId: input.artifact.id,
    source: input.artifact.source,
    from: input.range.from,
    to: input.range.to,
  }),
  meta: {
    language: input.artifact.language,
    path: input.artifact.path,
    stage: 'parse',
  },
});

/** Collects canonical provider diagnostics without depending on editor state. */
export const collectWorkspaceCodeDiagnostics = (
  workspace: WorkspaceSnapshot
): ProdivixDiagnostic[] => {
  const artifacts = createWorkspaceCodeArtifactProvider(workspace)
    .listArtifacts({ surface: 'issues-panel' })
    .sort(
      (left, right) =>
        compareText(left.path, right.path) || compareText(left.id, right.id)
    );

  const parserDiagnostics = artifacts.flatMap((artifact) => {
    if (
      artifact.language === 'ts' ||
      artifact.language === 'js' ||
      artifact.language === 'css' ||
      artifact.language === 'scss' ||
      artifact.language === 'glsl' ||
      artifact.language === 'wgsl'
    ) {
      return [];
    }
    if (!artifact.source.trim()) {
      return [
        {
          code: 'COD-1003',
          severity: 'warning',
          domain: 'code',
          message: 'The code artifact is empty.',
          hint: 'Add code to the artifact or remove it if it is no longer used.',
          docsUrl: '/reference/diagnostics/cod-1003',
          targetRef: { kind: 'code-artifact', artifactId: artifact.id },
          sourceSpan: createSourceSpanFromOffsets({
            artifactId: artifact.id,
            source: artifact.source,
            from: 0,
            to: 0,
          }),
          meta: {
            language: artifact.language,
            path: artifact.path,
            stage: 'parse',
          },
        } satisfies ProdivixDiagnostic,
      ];
    }

    try {
      const parsed = parseArtifact(artifact);
      if (!parsed) return [];
      return parsed.errors.map((range) =>
        createArtifactDiagnostic({ artifact, code: parsed.code, range })
      );
    } catch {
      return [
        {
          code: 'COD-9001',
          severity: 'error',
          domain: 'code',
          message: 'The code artifact could not be analyzed.',
          hint: 'Retry analysis after reopening the workspace.',
          retryable: true,
          docsUrl: '/reference/diagnostics/cod-9001',
          targetRef: { kind: 'code-artifact', artifactId: artifact.id },
          meta: {
            language: artifact.language,
            path: artifact.path,
            stage: 'environment',
          },
        } satisfies ProdivixDiagnostic,
      ];
    }
  });

  let languageDiagnostics: readonly ProdivixDiagnostic[];
  try {
    languageDiagnostics = getWorkspaceCodeLanguageDiagnostics(workspace);
  } catch (error) {
    languageDiagnostics = [
      {
        code: 'COD-9001',
        severity: 'error',
        domain: 'code',
        message: 'The code language environment could not be analyzed.',
        hint: 'Retry analysis after reopening the Workspace.',
        retryable: true,
        docsUrl: '/reference/diagnostics/cod-9001',
        targetRef: { kind: 'workspace', workspaceId: workspace.id },
        meta: {
          stage: 'environment',
          reason: error instanceof Error ? error.message : String(error),
        },
      },
    ];
  }

  return [...languageDiagnostics, ...parserDiagnostics];
};
