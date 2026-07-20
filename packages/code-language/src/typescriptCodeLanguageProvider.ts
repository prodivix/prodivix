import * as ts from 'typescript';
import {
  CODE_LANGUAGE_CAPABILITIES,
  createCodeLanguageSnapshotIdentity,
  isSameCodeLanguageSnapshotIdentity,
  type CodeArtifact,
  type CodeLanguageCapabilityProvider,
  type CodeLanguageCompletion,
  type CodeLanguageCompletionKind,
  type CodeLanguageLocation,
  type CodeLanguageProviderDescriptor,
  type CodeLanguageSession,
  type CodeLanguageSnapshot,
  type CodeLanguageSnapshotIdentity,
  type CodeLanguageStaleResult,
  type CodeLanguageTextEdit,
  type CodeLanguageUnavailableResult,
  type CodeLanguageWorkspaceEditProposal,
} from '@prodivix/authoring';
import {
  acquireTypeScriptCodeProject,
  defaultTypeScriptCodeProjectHost,
} from './typescriptProjectHost';
import {
  collectTypeScriptProjectDiagnostics,
  createTypeScriptSemanticContributionFromProject,
  TYPESCRIPT_CONFIGURATION_DIGEST,
  TYPESCRIPT_SEMANTIC_PROVIDER_ID,
  TYPESCRIPT_SEMANTIC_PROVIDER_VERSION,
} from './typescriptSemanticContribution';

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const descriptor: CodeLanguageProviderDescriptor = Object.freeze({
  id: TYPESCRIPT_SEMANTIC_PROVIDER_ID,
  semanticVersion: TYPESCRIPT_SEMANTIC_PROVIDER_VERSION,
  configurationDigest: TYPESCRIPT_CONFIGURATION_DIGEST,
  languageIds: Object.freeze(['ts', 'js'] as const),
  capabilities: CODE_LANGUAGE_CAPABILITIES,
});

const displayParts = (
  parts: readonly ts.SymbolDisplayPart[] | undefined
): string => parts?.map((part) => part.text).join('') ?? '';

const isIdentifierName = (value: string): boolean => {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    value
  );
  return (
    scanner.scan() === ts.SyntaxKind.Identifier &&
    scanner.getTokenText() === value &&
    scanner.scan() === ts.SyntaxKind.EndOfFileToken
  );
};

const completionKind = (
  entry: ts.CompletionEntry
): CodeLanguageCompletionKind => {
  if (entry.isSnippet) return 'snippet';
  if (entry.kind === ts.ScriptElementKind.keyword) return 'keyword';
  if (entry.kind === ts.ScriptElementKind.externalModuleName) return 'path';
  return 'symbol';
};

const COMPLETION_TRIGGER_CHARACTERS = new Set<string>([
  '.',
  '"',
  "'",
  '`',
  '/',
  '@',
  '<',
  '#',
  ' ',
]);

const completionTriggerCharacter = (
  value: string | undefined
): ts.CompletionsTriggerCharacter | undefined =>
  value && COMPLETION_TRIGGER_CHARACTERS.has(value)
    ? (value as ts.CompletionsTriggerCharacter)
    : undefined;

const locationKey = (location: CodeLanguageLocation): string => {
  const span = location.sourceSpan;
  return [
    span.artifactId,
    span.startLine,
    span.startColumn,
    span.endLine,
    span.endColumn,
  ].join(':');
};

const sortLocations = (
  locations: readonly CodeLanguageLocation[]
): readonly CodeLanguageLocation[] =>
  Object.freeze(
    [
      ...new Map(
        locations.map((location) => [locationKey(location), location])
      ).values(),
    ].sort((left, right) => {
      const leftSpan = left.sourceSpan;
      const rightSpan = right.sourceSpan;
      return (
        compareText(leftSpan.artifactId, rightSpan.artifactId) ||
        leftSpan.startLine - rightSpan.startLine ||
        leftSpan.startColumn - rightSpan.startColumn ||
        leftSpan.endLine - rightSpan.endLine ||
        leftSpan.endColumn - rightSpan.endColumn
      );
    })
  );

const isCanonicalSemanticSnapshot = (snapshot: CodeLanguageSnapshot): boolean =>
  snapshot.artifacts.every((artifact) => {
    const revision =
      snapshot.identity.workspaceRevisions.documentRevs[artifact.id];
    return revision && String(revision.contentRev) === artifact.revision;
  });

/** Provides immutable TS/JS sessions over one shared incremental Workspace engine. */
export const createTypeScriptCodeLanguageCapabilityProvider =
  (): CodeLanguageCapabilityProvider =>
    Object.freeze({
      descriptor,
      async openSession(snapshot): Promise<CodeLanguageSession> {
        const snapshotIdentity = createCodeLanguageSnapshotIdentity(snapshot);
        const projectLease = acquireTypeScriptCodeProject(
          defaultTypeScriptCodeProjectHost,
          snapshot.identity.workspaceRevisions.workspaceId,
          snapshot.artifacts
        );
        const project = projectLease.project;
        let disposed = false;
        let semanticContribution:
          | ReturnType<typeof createTypeScriptSemanticContributionFromProject>
          | undefined;

        const blocked = (
          expectedSnapshotIdentity: CodeLanguageSnapshotIdentity
        ): CodeLanguageStaleResult | CodeLanguageUnavailableResult | null => {
          if (disposed) {
            return Object.freeze({
              status: 'unavailable',
              snapshotIdentity,
              reason: 'The code language session has been disposed.',
            });
          }
          if (!projectLease.isCurrent()) {
            return Object.freeze({
              status: 'unavailable',
              snapshotIdentity,
              reason:
                'The code language session was superseded by a newer Workspace code snapshot.',
            });
          }
          if (
            !isSameCodeLanguageSnapshotIdentity(
              snapshotIdentity,
              expectedSnapshotIdentity
            )
          ) {
            return Object.freeze({
              status: 'stale',
              snapshotIdentity,
              expectedSnapshotIdentity,
            });
          }
          return null;
        };

        const resolvePosition = (position: {
          artifactId: string;
          line: number;
          column: number;
        }): Readonly<{
          artifact: CodeArtifact;
          fileName: string;
          offset: number;
        }> | null => {
          const artifact = project.getArtifact(position.artifactId);
          const fileName = project.getFileName(position.artifactId);
          const offset = project.getOffset(position);
          return artifact && fileName && offset !== null
            ? Object.freeze({ artifact, fileName, offset })
            : null;
        };

        const createLocation = (
          fileName: string,
          textSpan: ts.TextSpan
        ): CodeLanguageLocation | null => {
          const artifact = project.getArtifactByFileName(fileName);
          if (!artifact) return null;
          const sourceSpan = project.createSourceSpan(artifact.id, textSpan);
          return sourceSpan
            ? Object.freeze({
                targetRef: Object.freeze({
                  kind: 'code-artifact' as const,
                  artifactId: artifact.id,
                }),
                sourceSpan,
              })
            : null;
        };

        const createEdit = (
          artifact: CodeArtifact,
          sourceSpan: CodeLanguageTextEdit['sourceSpan'],
          newText: string
        ): CodeLanguageTextEdit =>
          Object.freeze({
            artifactId: artifact.id,
            expectedRevision: artifact.revision,
            sourceSpan,
            newText,
          });

        return Object.freeze({
          descriptor,
          snapshotIdentity,
          async getDefinition(request) {
            const rejected = blocked(request.expectedSnapshotIdentity);
            if (rejected) return rejected;
            const position = resolvePosition(request.position);
            if (!position) {
              return Object.freeze({ status: 'missing', snapshotIdentity });
            }
            const locations = (
              project.service.getDefinitionAtPosition(
                position.fileName,
                position.offset
              ) ?? []
            )
              .map((definition) =>
                createLocation(definition.fileName, definition.textSpan)
              )
              .filter((location): location is CodeLanguageLocation =>
                Boolean(location)
              );
            return locations.length
              ? Object.freeze({
                  status: 'resolved',
                  snapshotIdentity,
                  value: sortLocations(locations),
                })
              : Object.freeze({ status: 'missing', snapshotIdentity });
          },
          async getReferences(request) {
            const rejected = blocked(request.expectedSnapshotIdentity);
            if (rejected) return rejected;
            const position = resolvePosition(request.position);
            if (!position) {
              return Object.freeze({ status: 'missing', snapshotIdentity });
            }
            const locations = (
              project.service.findReferences(
                position.fileName,
                position.offset
              ) ?? []
            ).flatMap((symbol) =>
              symbol.references
                .filter(
                  (reference) =>
                    request.includeDeclaration !== false ||
                    !reference.isDefinition
                )
                .map((reference) =>
                  createLocation(reference.fileName, reference.textSpan)
                )
                .filter((location): location is CodeLanguageLocation =>
                  Boolean(location)
                )
            );
            return locations.length
              ? Object.freeze({
                  status: 'resolved',
                  snapshotIdentity,
                  value: sortLocations(locations),
                })
              : Object.freeze({ status: 'missing', snapshotIdentity });
          },
          async getCompletions(request) {
            const rejected = blocked(request.expectedSnapshotIdentity);
            if (rejected) return rejected;
            const position = resolvePosition(request.position);
            if (!position) {
              return Object.freeze({ status: 'missing', snapshotIdentity });
            }
            const triggerCharacter =
              request.trigger?.kind === 'character'
                ? completionTriggerCharacter(request.trigger.character)
                : undefined;
            const completionInfo = project.service.getCompletionsAtPosition(
              position.fileName,
              position.offset,
              {
                includeCompletionsForImportStatements: true,
                includeCompletionsWithInsertText: true,
                includeCompletionsWithSnippetText: true,
                triggerCharacter,
                triggerKind: triggerCharacter
                  ? ts.CompletionTriggerKind.TriggerCharacter
                  : request.trigger?.kind === 'incomplete'
                    ? ts.CompletionTriggerKind.TriggerForIncompleteCompletions
                    : ts.CompletionTriggerKind.Invoked,
              }
            );
            if (!completionInfo) {
              return Object.freeze({ status: 'missing', snapshotIdentity });
            }
            const value = Object.freeze(
              completionInfo.entries
                .filter((entry) => !entry.hasAction)
                .map((entry): CodeLanguageCompletion => {
                  const replacementSpan =
                    entry.replacementSpan ??
                    completionInfo.optionalReplacementSpan;
                  const sourceSpan = replacementSpan
                    ? project.createSourceSpan(
                        position.artifact.id,
                        replacementSpan
                      )
                    : null;
                  const sourceDisplay = displayParts(entry.sourceDisplay);
                  return Object.freeze({
                    label: entry.name,
                    kind: completionKind(entry),
                    ...(sourceDisplay ? { detail: sourceDisplay } : {}),
                    sortText: entry.sortText,
                    ...(entry.filterText
                      ? { filterText: entry.filterText }
                      : {}),
                    ...(entry.insertText
                      ? { insertText: entry.insertText }
                      : {}),
                    ...(sourceSpan
                      ? {
                          textEdit: createEdit(
                            position.artifact,
                            sourceSpan,
                            entry.insertText ?? entry.name
                          ),
                        }
                      : {}),
                  });
                })
            );
            return Object.freeze({
              status: 'resolved',
              snapshotIdentity,
              value,
            });
          },
          async getDiagnostics(request) {
            const rejected = blocked(request.expectedSnapshotIdentity);
            if (rejected) return rejected;
            if (
              request.artifactId &&
              !project.getArtifact(request.artifactId)
            ) {
              return Object.freeze({ status: 'missing', snapshotIdentity });
            }
            return Object.freeze({
              status: 'resolved',
              snapshotIdentity,
              value: collectTypeScriptProjectDiagnostics(
                project,
                request.artifactId
              ),
            });
          },
          async prepareRename(request) {
            const rejected = blocked(request.expectedSnapshotIdentity);
            if (rejected) return rejected;
            const position = resolvePosition(request.position);
            if (!position) {
              return Object.freeze({ status: 'missing', snapshotIdentity });
            }
            const info = project.service.getRenameInfo(
              position.fileName,
              position.offset,
              { allowRenameOfImportPath: false }
            );
            const sourceSpan = info.canRename
              ? project.createSourceSpan(position.artifact.id, info.triggerSpan)
              : null;
            return info.canRename && !info.fileToRename && sourceSpan
              ? Object.freeze({
                  status: 'resolved',
                  snapshotIdentity,
                  value: Object.freeze({
                    sourceSpan,
                    placeholder: info.displayName,
                  }),
                })
              : Object.freeze({ status: 'missing', snapshotIdentity });
          },
          async getRenameEdits(request) {
            const rejected = blocked(request.expectedSnapshotIdentity);
            if (rejected) return rejected;
            const position = resolvePosition(request.position);
            if (
              !position ||
              !request.newName ||
              !isIdentifierName(request.newName)
            ) {
              return Object.freeze({ status: 'missing', snapshotIdentity });
            }
            const info = project.service.getRenameInfo(
              position.fileName,
              position.offset,
              { allowRenameOfImportPath: false }
            );
            if (!info.canRename || info.fileToRename) {
              return Object.freeze({ status: 'missing', snapshotIdentity });
            }
            const locations =
              project.service.findRenameLocations(
                position.fileName,
                position.offset,
                false,
                false,
                { providePrefixAndSuffixTextForRename: true }
              ) ?? [];
            const edits = locations
              .map((location): CodeLanguageTextEdit | null => {
                const artifact = project.getArtifactByFileName(
                  location.fileName
                );
                if (!artifact) return null;
                const sourceSpan = project.createSourceSpan(
                  artifact.id,
                  location.textSpan
                );
                return sourceSpan
                  ? createEdit(
                      artifact,
                      sourceSpan,
                      `${location.prefixText ?? ''}${request.newName}${location.suffixText ?? ''}`
                    )
                  : null;
              })
              .filter((edit): edit is CodeLanguageTextEdit => Boolean(edit))
              .sort(
                (left, right) =>
                  compareText(left.artifactId, right.artifactId) ||
                  left.sourceSpan.startLine - right.sourceSpan.startLine ||
                  left.sourceSpan.startColumn - right.sourceSpan.startColumn
              );
            if (!edits.length) {
              return Object.freeze({ status: 'missing', snapshotIdentity });
            }
            const proposal: CodeLanguageWorkspaceEditProposal = Object.freeze({
              snapshotIdentity,
              edits: Object.freeze(edits),
            });
            return Object.freeze({
              status: 'resolved',
              snapshotIdentity,
              value: proposal,
            });
          },
          async getHover(request) {
            const rejected = blocked(request.expectedSnapshotIdentity);
            if (rejected) return rejected;
            const position = resolvePosition(request.position);
            if (!position) {
              return Object.freeze({ status: 'missing', snapshotIdentity });
            }
            const info = project.service.getQuickInfoAtPosition(
              position.fileName,
              position.offset
            );
            if (!info) {
              return Object.freeze({ status: 'missing', snapshotIdentity });
            }
            const signature = displayParts(info.displayParts);
            const documentation = displayParts(info.documentation);
            const sourceSpan = project.createSourceSpan(
              position.artifact.id,
              info.textSpan
            );
            return Object.freeze({
              status: 'resolved',
              snapshotIdentity,
              value: Object.freeze({
                contents: Object.freeze([
                  ...(signature
                    ? [{ format: 'plaintext' as const, value: signature }]
                    : []),
                  ...(documentation
                    ? [{ format: 'markdown' as const, value: documentation }]
                    : []),
                ]),
                ...(sourceSpan ? { sourceSpan } : {}),
              }),
            });
          },
          async getSemanticContribution(request) {
            const rejected = blocked(request.expectedSnapshotIdentity);
            if (rejected) return rejected;
            if (!isCanonicalSemanticSnapshot(snapshot)) {
              return Object.freeze({
                status: 'unavailable',
                snapshotIdentity,
                reason:
                  'Semantic contributions require canonical Workspace document revisions.',
              });
            }
            return Object.freeze({
              status: 'resolved',
              snapshotIdentity,
              value:
                semanticContribution ??
                (semanticContribution =
                  createTypeScriptSemanticContributionFromProject({
                    workspaceId:
                      snapshot.identity.workspaceRevisions.workspaceId,
                    artifacts: project.artifacts,
                    project,
                  })),
            });
          },
          dispose() {
            if (disposed) return;
            disposed = true;
            projectLease.release();
          },
        });
      },
    });
