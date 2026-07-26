import type { PIRDocument, PIRNode } from '@prodivix/pir';
import type { WorkspacePirDocument } from '@prodivix/workspace';
import type { TargetAdapter } from '#src/core/adapter';
import type { CompileDiagnostic } from '#src/core/diagnostics';
import { PIRReactImportRegistry } from '#src/react/importRegistry';
import { PIRReactSourceTraceCollector } from '#src/react/sourceTrace';

export type PIRReactNodeCompileContext = Readonly<{
  documentId: string;
  document: PIRDocument;
  workspaceDocument: WorkspacePirDocument;
  documentsById: Readonly<Record<string, WorkspacePirDocument>>;
  moduleIdByDocumentId: Readonly<Record<string, string>>;
  moduleNameByDocumentId: Readonly<Record<string, string>>;
  adapter: TargetAdapter;
  imports: PIRReactImportRegistry;
  traces: PIRReactSourceTraceCollector;
  diagnostics: CompileDiagnostic[];
}>;

export type PIRReactNodeCompiler = Readonly<{
  compileNode(
    nodeId: string,
    scopeExpression: string,
    instancePathExpression: string
  ): string;
  compileNodeList(
    nodeIds: readonly string[],
    scopeExpression: string,
    instancePathExpression: string
  ): string;
}>;

export type PIRNodeOfKind<Kind extends PIRNode['kind']> = Extract<
  PIRNode,
  { kind: Kind }
>;
