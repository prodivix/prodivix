import type { PIRDocument, PIRNode } from '@prodivix/pir';
import type { WorkspacePirDocument } from '@prodivix/workspace';
import type { TargetAdapter } from '#src/core/adapter';
import type { CompileDiagnostic } from '#src/core/diagnostics';
import type { PirElementEmitter } from '#src/workspace/pirElementEmitter';
import { PirImportRegistry } from '#src/workspace/pirImportRegistry';
import { PirSourceTraceCollector } from '#src/workspace/pirSourceTrace';

export type PirNodeCompileContext = Readonly<{
  documentId: string;
  document: PIRDocument;
  workspaceDocument: WorkspacePirDocument;
  documentsById: Readonly<Record<string, WorkspacePirDocument>>;
  moduleIdByDocumentId: Readonly<Record<string, string>>;
  moduleNameByDocumentId: Readonly<Record<string, string>>;
  adapter: TargetAdapter;
  emitter: PirElementEmitter;
  /**
   * Nodes the RouteManifest designates as route outlets in this document. They
   * are ordinary PIR nodes — the manifest points at them by id — so the
   * compiler resolves them at build time and emits the same
   * renderer-or-fallback shape component slot outlets already use.
   */
  routeOutletNodeIds: ReadonlySet<string>;
  imports: PirImportRegistry;
  traces: PirSourceTraceCollector;
  diagnostics: CompileDiagnostic[];
}>;

export type PirNodeCompiler = Readonly<{
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
