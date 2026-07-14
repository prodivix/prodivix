import {
  CompletionItemKind,
  InsertTextFormat,
  type CompletionItem,
  type Location,
  type MarkedString,
  type MarkupContent,
  type Position,
  type Range,
  type TextEdit,
  type WorkspaceEdit,
} from 'vscode-css-languageservice';
import {
  CODE_LANGUAGE_CAPABILITIES,
  createCodeLanguageSnapshotIdentity,
  isSameCodeLanguageSnapshotIdentity,
  type CodeArtifact,
  type CodeLanguageCapabilityProvider,
  type CodeLanguageCompletion,
  type CodeLanguageCompletionKind,
  type CodeLanguageLocation,
  type CodeLanguageMarkupContent,
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
  createCssLanguageProject,
  type CssLanguageDocument,
} from './cssLanguageProject';
import {
  collectCssProjectDiagnostics,
  createCssSemanticContribution,
  CSS_CONFIGURATION_DIGEST,
  CSS_SEMANTIC_PROVIDER_ID,
  CSS_SEMANTIC_PROVIDER_VERSION,
} from './cssSemanticContribution';

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const descriptor: CodeLanguageProviderDescriptor = Object.freeze({
  id: CSS_SEMANTIC_PROVIDER_ID,
  semanticVersion: CSS_SEMANTIC_PROVIDER_VERSION,
  configurationDigest: CSS_CONFIGURATION_DIGEST,
  languageIds: Object.freeze(['css', 'scss'] as const),
  capabilities: CODE_LANGUAGE_CAPABILITIES,
});

const MAX_MARKUP_LENGTH = 8_000;

const normalizeMarkupValue = (value: string): string =>
  value
    .replace(/!\[[^\]]*\]\(data:[^)]+\)/giu, '')
    .trim()
    .slice(0, MAX_MARKUP_LENGTH);

const createMarkupContent = (
  value: string | MarkedString | MarkupContent
): CodeLanguageMarkupContent | null => {
  if (typeof value === 'string') {
    const normalized = normalizeMarkupValue(value);
    return normalized
      ? Object.freeze({ format: 'plaintext', value: normalized })
      : null;
  }
  if ('kind' in value) {
    const normalized = normalizeMarkupValue(value.value);
    return normalized
      ? Object.freeze({
          format: value.kind === 'markdown' ? 'markdown' : 'plaintext',
          value: normalized,
        })
      : null;
  }
  const normalized = normalizeMarkupValue(value.value);
  return normalized
    ? Object.freeze({
        format: 'markdown',
        value: `\`\`\`${value.language}\n${normalized}\n\`\`\``,
      })
    : null;
};

const completionKind = (item: CompletionItem): CodeLanguageCompletionKind => {
  if (item.insertTextFormat === InsertTextFormat.Snippet) return 'snippet';
  if (
    item.kind === CompletionItemKind.File ||
    item.kind === CompletionItemKind.Folder ||
    item.kind === CompletionItemKind.Reference
  ) {
    return 'path';
  }
  if (item.kind === CompletionItemKind.Keyword) return 'keyword';
  return 'symbol';
};

const getCompletionRange = (item: CompletionItem): Range | undefined => {
  const edit = item.textEdit;
  if (!edit) return undefined;
  return 'range' in edit ? edit.range : edit.replace;
};

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

const comparePosition = (left: Position, right: Position): number =>
  left.line - right.line || left.character - right.character;

const isLocationInsideDefinition = (
  location: Location,
  definition: Location | null
): boolean =>
  Boolean(
    definition &&
    location.uri === definition.uri &&
    comparePosition(location.range.start, definition.range.start) >= 0 &&
    comparePosition(location.range.end, definition.range.end) <= 0
  );

const isCanonicalSemanticSnapshot = (snapshot: CodeLanguageSnapshot): boolean =>
  snapshot.artifacts.every((artifact) => {
    const revision =
      snapshot.identity.workspaceRevisions.documentRevs[artifact.id];
    return revision && String(revision.contentRev) === artifact.revision;
  });

const isSafeRenameName = (value: string): boolean =>
  Boolean(
    value &&
    value.length <= 256 &&
    value.trim() === value &&
    !/[\s\u0000-\u001f{};]/u.test(value)
  );

const collectWorkspaceTextEdits = (
  workspaceEdit: WorkspaceEdit
): readonly Readonly<{ uri: string; edits: readonly TextEdit[] }>[] => {
  const output: Array<{ uri: string; edits: readonly TextEdit[] }> = [];
  for (const [uri, edits] of Object.entries(workspaceEdit.changes ?? {})) {
    output.push({ uri, edits });
  }
  for (const change of workspaceEdit.documentChanges ?? []) {
    if ('textDocument' in change && 'edits' in change) {
      output.push({ uri: change.textDocument.uri, edits: change.edits });
    }
  }
  return output;
};

/** Provides immutable CSS/SCSS language sessions over canonical or draft artifacts. */
export const createCssCodeLanguageCapabilityProvider =
  (): CodeLanguageCapabilityProvider =>
    Object.freeze({
      descriptor,
      async openSession(snapshot): Promise<CodeLanguageSession> {
        const snapshotIdentity = createCodeLanguageSnapshotIdentity(snapshot);
        const project = createCssLanguageProject(snapshot.artifacts);
        let disposed = false;
        let semanticContribution:
          ReturnType<typeof createCssSemanticContribution> | undefined;

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
          entry: CssLanguageDocument;
          position: Position;
        }> | null => {
          const entry = project.getDocument(position.artifactId);
          const nativePosition = project.getPosition(position);
          return entry && nativePosition
            ? Object.freeze({ entry, position: nativePosition })
            : null;
        };

        const createLocation = (
          location: Location
        ): CodeLanguageLocation | null => {
          const entry = project.getDocumentByUri(location.uri);
          if (!entry) return null;
          const sourceSpan = project.createSourceSpan(
            entry.artifact.id,
            location.range
          );
          return sourceSpan
            ? Object.freeze({
                targetRef: Object.freeze({
                  kind: 'code-artifact' as const,
                  artifactId: entry.artifact.id,
                }),
                sourceSpan,
              })
            : null;
        };

        const createEdit = (
          artifact: CodeArtifact,
          range: Range,
          newText: string
        ): CodeLanguageTextEdit | null => {
          const sourceSpan = project.createSourceSpan(artifact.id, range);
          return sourceSpan
            ? Object.freeze({
                artifactId: artifact.id,
                expectedRevision: artifact.revision,
                sourceSpan,
                newText,
              })
            : null;
        };

        return Object.freeze({
          descriptor,
          snapshotIdentity,
          async getDefinition(request) {
            const rejected = blocked(request.expectedSnapshotIdentity);
            if (rejected) return rejected;
            const resolved = resolvePosition(request.position);
            if (!resolved) {
              return Object.freeze({ status: 'missing', snapshotIdentity });
            }
            const definition = resolved.entry.service.findDefinition(
              resolved.entry.document,
              resolved.position,
              resolved.entry.stylesheet
            );
            const location = definition ? createLocation(definition) : null;
            return location
              ? Object.freeze({
                  status: 'resolved',
                  snapshotIdentity,
                  value: Object.freeze([location]),
                })
              : Object.freeze({ status: 'missing', snapshotIdentity });
          },
          async getReferences(request) {
            const rejected = blocked(request.expectedSnapshotIdentity);
            if (rejected) return rejected;
            const resolved = resolvePosition(request.position);
            if (!resolved) {
              return Object.freeze({ status: 'missing', snapshotIdentity });
            }
            const definition =
              request.includeDeclaration === false
                ? resolved.entry.service.findDefinition(
                    resolved.entry.document,
                    resolved.position,
                    resolved.entry.stylesheet
                  )
                : null;
            const locations = resolved.entry.service
              .findReferences(
                resolved.entry.document,
                resolved.position,
                resolved.entry.stylesheet
              )
              .filter(
                (location) =>
                  request.includeDeclaration !== false ||
                  !isLocationInsideDefinition(location, definition)
              )
              .map(createLocation)
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
          async getCompletions(request) {
            const rejected = blocked(request.expectedSnapshotIdentity);
            if (rejected) return rejected;
            const resolved = resolvePosition(request.position);
            if (!resolved) {
              return Object.freeze({ status: 'missing', snapshotIdentity });
            }
            const completionList = resolved.entry.service.doComplete(
              resolved.entry.document,
              resolved.position,
              resolved.entry.stylesheet
            );
            const value = Object.freeze(
              completionList.items.map((item): CodeLanguageCompletion => {
                const replacementRange = getCompletionRange(item);
                const newText =
                  item.textEdit?.newText ?? item.insertText ?? item.label;
                const textEdit = replacementRange
                  ? createEdit(
                      resolved.entry.artifact,
                      replacementRange,
                      newText
                    )
                  : null;
                const documentation = item.documentation
                  ? createMarkupContent(item.documentation)
                  : null;
                return Object.freeze({
                  label: item.label,
                  kind: completionKind(item),
                  ...(item.detail ? { detail: item.detail } : {}),
                  ...(item.sortText ? { sortText: item.sortText } : {}),
                  ...(item.filterText ? { filterText: item.filterText } : {}),
                  ...(item.insertText ? { insertText: item.insertText } : {}),
                  ...(documentation ? { documentation } : {}),
                  ...(textEdit ? { textEdit } : {}),
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
              !project.getDocument(request.artifactId)
            ) {
              return Object.freeze({ status: 'missing', snapshotIdentity });
            }
            return Object.freeze({
              status: 'resolved',
              snapshotIdentity,
              value: collectCssProjectDiagnostics(project, request.artifactId),
            });
          },
          async prepareRename(request) {
            const rejected = blocked(request.expectedSnapshotIdentity);
            if (rejected) return rejected;
            const resolved = resolvePosition(request.position);
            if (!resolved) {
              return Object.freeze({ status: 'missing', snapshotIdentity });
            }
            const range = resolved.entry.service.prepareRename(
              resolved.entry.document,
              resolved.position,
              resolved.entry.stylesheet
            );
            const sourceSpan = range
              ? project.createSourceSpan(resolved.entry.artifact.id, range)
              : null;
            return range && sourceSpan
              ? Object.freeze({
                  status: 'resolved',
                  snapshotIdentity,
                  value: Object.freeze({
                    sourceSpan,
                    placeholder: resolved.entry.document.getText(range),
                  }),
                })
              : Object.freeze({ status: 'missing', snapshotIdentity });
          },
          async getRenameEdits(request) {
            const rejected = blocked(request.expectedSnapshotIdentity);
            if (rejected) return rejected;
            const resolved = resolvePosition(request.position);
            if (!resolved || !isSafeRenameName(request.newName)) {
              return Object.freeze({ status: 'missing', snapshotIdentity });
            }
            const workspaceEdit = resolved.entry.service.doRename(
              resolved.entry.document,
              resolved.position,
              request.newName,
              resolved.entry.stylesheet
            );
            const edits = collectWorkspaceTextEdits(workspaceEdit)
              .flatMap(({ uri, edits }) => {
                const target = project.getDocumentByUri(uri);
                if (!target) return [];
                return edits
                  .map((edit) =>
                    createEdit(target.artifact, edit.range, edit.newText)
                  )
                  .filter((edit): edit is CodeLanguageTextEdit =>
                    Boolean(edit)
                  );
              })
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
            const resolved = resolvePosition(request.position);
            if (!resolved) {
              return Object.freeze({ status: 'missing', snapshotIdentity });
            }
            const hover = resolved.entry.service.doHover(
              resolved.entry.document,
              resolved.position,
              resolved.entry.stylesheet
            );
            if (!hover) {
              return Object.freeze({ status: 'missing', snapshotIdentity });
            }
            const rawContents = Array.isArray(hover.contents)
              ? hover.contents
              : [hover.contents];
            const contents = Object.freeze(
              rawContents
                .map(createMarkupContent)
                .filter((item): item is CodeLanguageMarkupContent =>
                  Boolean(item)
                )
            );
            const sourceSpan = hover.range
              ? project.createSourceSpan(
                  resolved.entry.artifact.id,
                  hover.range
                )
              : null;
            return contents.length
              ? Object.freeze({
                  status: 'resolved',
                  snapshotIdentity,
                  value: Object.freeze({
                    contents,
                    ...(sourceSpan ? { sourceSpan } : {}),
                  }),
                })
              : Object.freeze({ status: 'missing', snapshotIdentity });
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
                (semanticContribution = createCssSemanticContribution({
                  workspaceId: snapshot.identity.workspaceRevisions.workspaceId,
                  artifacts: project.artifacts,
                })),
            });
          },
          dispose() {
            disposed = true;
          },
        });
      },
    });
