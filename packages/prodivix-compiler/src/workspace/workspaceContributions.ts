import {
  classifyBinaryAssetDelivery,
  createBinaryAssetMaterialization,
  type BinaryAssetBlobReference,
  type BinaryAssetMaterialization,
} from '@prodivix/assets';
import {
  isWorkspaceAssetDocumentContent,
  isWorkspaceCodeDocumentContent,
  isWorkspaceProjectConfigDocumentContent,
  type WorkspaceDocument,
} from '@prodivix/workspace';
import { isWorkspaceServerRuntimeDocument } from '#src/workspace/workspaceServerRuntimeTarget';
import type { CompileDiagnostic } from '#src/core/diagnostics';
import {
  collectExportCodeArtifactContributions,
  getExportCodeArtifactLanguage,
  joinExportPath,
  normalizeExportCodeArtifactPath,
  normalizeExportPath,
  resolveWorkspaceDocumentExportSource,
  type ExportArtifactContribution,
  type ExportModule,
  type ExportProgramContribution,
  type ExportSourceTrace,
} from '#src/export';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import type { WorkspaceExportCodeArtifact } from '#src/workspace/workspaceTargetRenderLayer';

/** Canonical pretty JSON for emitted manifests; key order is code-point stable. */
const toCanonicalJson = (value: unknown): string =>
  `${canonicalJsonText(value, 2)}\n`;

/**
 * Workspace code and binary-asset contributions are framework-neutral: they
 * emit plain source files and content-addressed artifacts. They live here, not
 * under a target directory, so a second target cannot fork them.
 */
export const createDocumentSourceTrace = (
  document: WorkspaceDocument
): ExportSourceTrace => ({
  sourceRef: {
    domain: 'workspace-document',
    id: document.id,
    path: document.path,
  },
  ownerRootId: document.id,
});

export const createWorkspaceCodeContribution = (input: {
  documents: readonly WorkspaceDocument[];
}): {
  contribution: ExportProgramContribution;
  executableModuleIdByArtifactId: Map<string, string>;
} => {
  const executableModuleIdByArtifactId = new Map<string, string>();
  const modules: ExportModule[] = [];
  const nonExecutableArtifacts: WorkspaceExportCodeArtifact[] = [];
  input.documents.forEach((document) => {
    if (!isWorkspaceCodeDocumentContent(document.content)) return;
    if (isWorkspaceServerRuntimeDocument(document)) return;
    if (
      document.content.language !== 'ts' &&
      document.content.language !== 'js'
    ) {
      nonExecutableArtifacts.push({
        id: document.id,
        path: document.path,
        language: document.content.language,
        source: document.content.source,
      });
      return;
    }
    const language = getExportCodeArtifactLanguage({
      id: document.id,
      path: document.path,
      language: document.content.language,
      source: document.content.source,
    });
    const moduleId = `workspace-code:${document.id}`;
    executableModuleIdByArtifactId.set(document.id, moduleId);
    modules.push({
      id: moduleId,
      kind: 'workspace-module',
      suggestedName: document.path.split('/').at(-1) ?? document.id,
      desiredPath: joinExportPath(
        'src',
        normalizeExportCodeArtifactPath(document.path)
      ),
      language:
        language === 'tsx' || language === 'jsx'
          ? language
          : document.content.language,
      imports: [],
      body: document.content.source,
      sourceTrace: [createDocumentSourceTrace(document)],
      origin: resolveWorkspaceDocumentExportSource({
        label: document.path,
      }).origin,
    });
  });
  return {
    executableModuleIdByArtifactId,
    contribution: {
      modules,
      artifacts: collectExportCodeArtifactContributions(
        nonExecutableArtifacts.filter((artifact) => artifact.language !== 'css')
      ),
      files: nonExecutableArtifacts
        .filter((artifact) => artifact.language === 'css')
        .map((artifact) => ({
          id: `workspace-code-file:${artifact.id}`,
          desiredPath: normalizeExportCodeArtifactPath(artifact.path),
          baseDirectory: 'source-root' as const,
          kind: 'stylesheet' as const,
          language: 'css',
          mimeType: 'text/css',
          importMode: 'copy-only' as const,
          contents: artifact.source,
          sourceTrace: [
            {
              sourceRef: {
                domain: 'workspace-document',
                id: artifact.id,
                path: artifact.path,
              },
            },
          ],
          origin: resolveWorkspaceDocumentExportSource({
            label: artifact.path,
          }).origin,
        })),
    },
  };
};

const binaryAssetReferencesEqual = (
  left: BinaryAssetBlobReference,
  right: BinaryAssetBlobReference
): boolean =>
  left.kind === right.kind &&
  left.digest === right.digest &&
  left.byteLength === right.byteLength &&
  left.mediaType === right.mediaType;

export const createWorkspaceResourceContribution = (
  documents: readonly WorkspaceDocument[],
  materializations: readonly BinaryAssetMaterialization[] = []
): ExportProgramContribution => {
  const artifacts: ExportArtifactContribution[] = [];
  const diagnostics: CompileDiagnostic[] = [];
  const materializationsByDocumentId = new Map<
    string,
    BinaryAssetMaterialization[]
  >();
  materializations.forEach((materialization, index) => {
    try {
      const verified = createBinaryAssetMaterialization(materialization);
      const existing =
        materializationsByDocumentId.get(verified.assetDocumentId) ?? [];
      existing.push(verified);
      materializationsByDocumentId.set(verified.assetDocumentId, existing);
    } catch (error) {
      diagnostics.push({
        code: 'AST-1004',
        severity: 'error',
        source: 'export',
        message:
          error instanceof Error
            ? `Asset materialization ${index} is invalid: ${error.message}`
            : `Asset materialization ${index} is invalid.`,
        path: `/assetMaterializations/${index}`,
      });
    }
  });
  const referencedMaterializationIds = new Set<string>();
  documents.forEach((document) => {
    const sourceTrace = [createDocumentSourceTrace(document)];
    const origin = resolveWorkspaceDocumentExportSource({
      label: document.path,
    }).origin;
    if (
      document.type === 'asset' &&
      isWorkspaceAssetDocumentContent(document.content)
    ) {
      const candidates = materializationsByDocumentId.get(document.id) ?? [];
      if (candidates.length !== 1) {
        diagnostics.push({
          code: candidates.length ? 'AST-1002' : 'AST-1001',
          severity: 'error',
          source: 'export',
          message: candidates.length
            ? `Asset ${document.id} has duplicate materializations.`
            : `Asset ${document.id} has no verified materialization.`,
          path: document.path,
        });
        return;
      }
      const candidate = candidates[0]!;
      if (
        !binaryAssetReferencesEqual(candidate.reference, document.content.blob)
      ) {
        diagnostics.push({
          code: 'AST-1003',
          severity: 'error',
          source: 'export',
          message: `Asset ${document.id} materialization identity drifted from its Workspace reference.`,
          path: document.path,
        });
        return;
      }
      let verified: BinaryAssetMaterialization;
      try {
        verified = createBinaryAssetMaterialization({
          assetDocumentId: document.id,
          reference: document.content.blob,
          contents: candidate.contents,
        });
      } catch (error) {
        diagnostics.push({
          code: 'AST-1004',
          severity: 'error',
          source: 'export',
          message:
            error instanceof Error
              ? `Asset ${document.id} bytes failed verification: ${error.message}`
              : `Asset ${document.id} bytes failed verification.`,
          path: document.path,
        });
        return;
      }
      const isPublic = document.path.startsWith('/public/');
      const deliveryClass = classifyBinaryAssetDelivery(document.content.mime);
      if (isPublic && deliveryClass !== 'static') {
        diagnostics.push({
          code: deliveryClass === 'active-content' ? 'AST-1101' : 'AST-1102',
          severity: 'error',
          source: 'export',
          message:
            deliveryClass === 'active-content'
              ? `Asset ${document.id} uses active content media type ${document.content.mime}; public delivery requires a sanitizer and isolated-origin policy.`
              : `Asset ${document.id} uses download-only media type ${document.content.mime}; public delivery requires an attachment-capable isolated origin.`,
          path: document.path,
        });
        return;
      }
      referencedMaterializationIds.add(document.id);
      const emittedPath = normalizeExportPath(document.path);
      artifacts.push({
        id: `workspace-resource:${document.id}`,
        kind: 'asset',
        suggestedName: emittedPath.split('/').at(-1) ?? document.id,
        mimeType: document.content.mime,
        contents: verified.contents,
        ...(isPublic
          ? { publicPath: emittedPath }
          : { sourcePath: joinExportPath('src', 'assets', emittedPath) }),
        placement: {
          deliveryPolicy: isPublic ? 'public' : 'copy',
        },
        sourceTrace,
        origin: { ...origin, writePolicy: 'copy' },
      });
      return;
    }
    if (
      document.type === 'project-config' &&
      isWorkspaceProjectConfigDocumentContent(document.content)
    ) {
      artifacts.push({
        id: `workspace-resource:${document.id}`,
        kind: 'config',
        suggestedName: document.path,
        language: 'json',
        mimeType: 'application/json',
        contents: toCanonicalJson(document.content.value),
        placement: {
          desiredPath: normalizeExportPath(document.path),
          baseDirectory: 'project-root',
          fileKind: 'config',
          importMode: 'copy-only',
        },
        sourceTrace,
        origin: { ...origin, writePolicy: 'copy' },
      });
    }
  });
  materializationsByDocumentId.forEach((_entries, assetDocumentId) => {
    if (referencedMaterializationIds.has(assetDocumentId)) return;
    if (
      documents.some(
        (document) =>
          document.id === assetDocumentId && document.type === 'asset'
      )
    ) {
      return;
    }
    diagnostics.push({
      code: 'AST-1005',
      severity: 'error',
      source: 'export',
      message: `Asset materialization ${assetDocumentId} does not match a canonical Workspace asset document.`,
      path: `/assetMaterializations/${assetDocumentId}`,
    });
  });
  return { artifacts, diagnostics };
};
