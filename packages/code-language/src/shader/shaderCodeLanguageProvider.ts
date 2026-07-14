import {
  CODE_LANGUAGE_CAPABILITIES,
  createCodeLanguageSnapshotIdentity,
  isSameCodeLanguageSnapshotIdentity,
  type CodeLanguageCapabilityProvider,
  type CodeLanguageCompletion,
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
  compareShaderText,
  SHADER_CODE_LANGUAGES,
  type ShaderLanguageDocument,
  type ShaderOffsetRange,
  type ShaderSymbol,
} from './shaderLanguage.types';
import {
  createShaderLanguageProject,
  type ShaderLanguageProject,
} from './shaderLanguageProject';
import {
  collectShaderProjectDiagnostics,
  createShaderSemanticContribution,
  SHADER_CONFIGURATION_DIGEST,
  SHADER_SEMANTIC_PROVIDER_ID,
  SHADER_SEMANTIC_PROVIDER_VERSION,
} from './shaderSemanticContribution';
import {
  getShaderVocabulary,
  getShaderVocabularyItem,
  isReservedShaderName,
} from './shaderLanguageVocabulary';

const descriptor: CodeLanguageProviderDescriptor = Object.freeze({
  id: SHADER_SEMANTIC_PROVIDER_ID,
  semanticVersion: SHADER_SEMANTIC_PROVIDER_VERSION,
  configurationDigest: SHADER_CONFIGURATION_DIGEST,
  languageIds: SHADER_CODE_LANGUAGES,
  capabilities: CODE_LANGUAGE_CAPABILITIES,
});

const isCanonicalSemanticSnapshot = (snapshot: CodeLanguageSnapshot): boolean =>
  snapshot.artifacts.every((artifact) => {
    const revision =
      snapshot.identity.workspaceRevisions.documentRevs[artifact.id];
    return revision && String(revision.contentRev) === artifact.revision;
  });

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
        compareShaderText(leftSpan.artifactId, rightSpan.artifactId) ||
        leftSpan.startLine - rightSpan.startLine ||
        leftSpan.startColumn - rightSpan.startColumn ||
        leftSpan.endLine - rightSpan.endLine ||
        leftSpan.endColumn - rightSpan.endColumn
      );
    })
  );

const createLocation = (
  project: ShaderLanguageProject,
  document: ShaderLanguageDocument,
  symbol: ShaderSymbol,
  range: ShaderOffsetRange
): CodeLanguageLocation | null => {
  const sourceSpan = project.createSourceSpan(document.artifact.id, range);
  return sourceSpan
    ? Object.freeze({
        targetRef: Object.freeze({
          kind: 'code-artifact' as const,
          artifactId: document.artifact.id,
        }),
        sourceSpan,
        symbolId: symbol.id,
      })
    : null;
};

const createEdit = (
  project: ShaderLanguageProject,
  document: ShaderLanguageDocument,
  range: ShaderOffsetRange,
  newText: string
): CodeLanguageTextEdit | null => {
  const sourceSpan = project.createSourceSpan(document.artifact.id, range);
  return sourceSpan
    ? Object.freeze({
        artifactId: document.artifact.id,
        expectedRevision: document.artifact.revision,
        sourceSpan,
        newText,
      })
    : null;
};

const symbolDetail = (symbol: ShaderSymbol): string => {
  if (symbol.category !== 'entry') return `Shader ${symbol.category}`;
  return symbol.stage && symbol.stage !== 'unknown'
    ? `${symbol.stage} shader entry point`
    : 'GLSL shader entry point';
};

const collectCompletions = (
  document: ShaderLanguageDocument,
  offset: number
): readonly CodeLanguageCompletion[] => {
  const items = new Map<string, CodeLanguageCompletion>();
  for (const symbol of document.getVisibleSymbols(offset)) {
    items.set(
      symbol.name,
      Object.freeze({
        label: symbol.name,
        kind: 'symbol',
        detail: symbolDetail(symbol),
        sortText: `0:${symbol.name}`,
        symbolId: symbol.id,
        documentation: Object.freeze({
          format: 'markdown',
          value: `\`${symbol.signature}\``,
        }),
      })
    );
  }
  for (const vocabulary of getShaderVocabulary(document.artifact.language)) {
    if (items.has(vocabulary.label)) continue;
    items.set(
      vocabulary.label,
      Object.freeze({
        label: vocabulary.label,
        kind: vocabulary.kind,
        detail: vocabulary.detail,
        sortText: `1:${vocabulary.label}`,
        documentation: Object.freeze({
          format: 'plaintext',
          value: vocabulary.documentation,
        }),
      })
    );
  }
  return Object.freeze(
    [...items.values()].sort(
      (left, right) =>
        compareShaderText(
          left.sortText ?? left.label,
          right.sortText ?? right.label
        ) || compareShaderText(left.label, right.label)
    )
  );
};

const isSafeRenameName = (
  document: ShaderLanguageDocument,
  symbol: ShaderSymbol,
  newName: string
): boolean =>
  /^[A-Za-z_][A-Za-z0-9_]*$/u.test(newName) &&
  !isReservedShaderName(document.artifact.language, newName) &&
  !document.symbols.some(
    (candidate) =>
      candidate.id !== symbol.id &&
      candidate.scopeId === symbol.scopeId &&
      candidate.name === newName
  );

/** Provides revision-bound GLSL/WGSL authoring capabilities over CodeArtifacts. */
export const createShaderCodeLanguageCapabilityProvider =
  (): CodeLanguageCapabilityProvider =>
    Object.freeze({
      descriptor,
      async openSession(snapshot): Promise<CodeLanguageSession> {
        const snapshotIdentity = createCodeLanguageSnapshotIdentity(snapshot);
        const project = createShaderLanguageProject({
          workspaceId: snapshot.identity.workspaceRevisions.workspaceId,
          artifacts: snapshot.artifacts,
        });
        let disposed = false;
        let semanticContribution:
          ReturnType<typeof createShaderSemanticContribution> | undefined;

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
          document: ShaderLanguageDocument;
          offset: number;
        }> | null => {
          const document = project.getDocument(position.artifactId);
          const offset = project.getOffset(position);
          return document && offset !== null
            ? Object.freeze({ document, offset })
            : null;
        };

        return Object.freeze({
          descriptor,
          snapshotIdentity,
          async getDefinition(request) {
            const rejected = blocked(request.expectedSnapshotIdentity);
            if (rejected) return rejected;
            const resolved = resolvePosition(request.position);
            const symbol = resolved?.document.getSymbolAtOffset(
              resolved.offset
            );
            const location =
              resolved && symbol
                ? createLocation(
                    project,
                    resolved.document,
                    symbol,
                    symbol.declaration
                  )
                : null;
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
            const symbol = resolved?.document.getSymbolAtOffset(
              resolved.offset
            );
            if (!resolved || !symbol) {
              return Object.freeze({ status: 'missing', snapshotIdentity });
            }
            const locations = symbol.occurrences
              .filter(
                (occurrence) =>
                  request.includeDeclaration !== false ||
                  !occurrence.declaration
              )
              .map((occurrence) =>
                createLocation(project, resolved.document, symbol, occurrence)
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
          async getCompletions(request) {
            const rejected = blocked(request.expectedSnapshotIdentity);
            if (rejected) return rejected;
            const resolved = resolvePosition(request.position);
            return resolved
              ? Object.freeze({
                  status: 'resolved',
                  snapshotIdentity,
                  value: collectCompletions(resolved.document, resolved.offset),
                })
              : Object.freeze({ status: 'missing', snapshotIdentity });
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
              value: collectShaderProjectDiagnostics(
                project,
                request.artifactId
              ),
            });
          },
          async prepareRename(request) {
            const rejected = blocked(request.expectedSnapshotIdentity);
            if (rejected) return rejected;
            const resolved = resolvePosition(request.position);
            const symbol = resolved?.document.getSymbolAtOffset(
              resolved.offset
            );
            const sourceSpan =
              resolved && symbol
                ? project.createSourceSpan(
                    resolved.document.artifact.id,
                    symbol.occurrences.find((occurrence) =>
                      containsOffset(occurrence, resolved.offset)
                    ) ?? symbol.declaration
                  )
                : null;
            return sourceSpan && symbol
              ? Object.freeze({
                  status: 'resolved',
                  snapshotIdentity,
                  value: Object.freeze({
                    sourceSpan,
                    placeholder: symbol.name,
                    symbolId: symbol.id,
                  }),
                })
              : Object.freeze({ status: 'missing', snapshotIdentity });
          },
          async getRenameEdits(request) {
            const rejected = blocked(request.expectedSnapshotIdentity);
            if (rejected) return rejected;
            const resolved = resolvePosition(request.position);
            const symbol = resolved?.document.getSymbolAtOffset(
              resolved.offset
            );
            if (
              !resolved ||
              !symbol ||
              !isSafeRenameName(resolved.document, symbol, request.newName)
            ) {
              return Object.freeze({ status: 'missing', snapshotIdentity });
            }
            const edits = symbol.occurrences
              .map((occurrence) =>
                createEdit(
                  project,
                  resolved.document,
                  occurrence,
                  request.newName
                )
              )
              .filter((edit): edit is CodeLanguageTextEdit => Boolean(edit));
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
            const symbol = resolved.document.getSymbolAtOffset(resolved.offset);
            if (symbol) {
              const sourceSpan = project.createSourceSpan(
                resolved.document.artifact.id,
                symbol.occurrences.find((occurrence) =>
                  containsOffset(occurrence, resolved.offset)
                ) ?? symbol.declaration
              );
              return Object.freeze({
                status: 'resolved',
                snapshotIdentity,
                value: Object.freeze({
                  contents: Object.freeze([
                    Object.freeze({
                      format: 'markdown' as const,
                      value: `\`\`\`${resolved.document.artifact.language}\n${symbol.signature}\n\`\`\`\n\n${symbolDetail(symbol)}`,
                    }),
                  ]),
                  ...(sourceSpan ? { sourceSpan } : {}),
                  symbolId: symbol.id,
                }),
              });
            }
            const identifier = resolved.document.getIdentifierAtOffset(
              resolved.offset
            );
            const vocabulary = identifier
              ? getShaderVocabularyItem(
                  resolved.document.artifact.language,
                  identifier.name
                )
              : null;
            const sourceSpan = identifier
              ? project.createSourceSpan(
                  resolved.document.artifact.id,
                  identifier
                )
              : null;
            return vocabulary
              ? Object.freeze({
                  status: 'resolved',
                  snapshotIdentity,
                  value: Object.freeze({
                    contents: Object.freeze([
                      Object.freeze({
                        format: 'plaintext' as const,
                        value: `${vocabulary.detail}\n\n${vocabulary.documentation}`,
                      }),
                    ]),
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
                (semanticContribution = createShaderSemanticContribution({
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

const containsOffset = (range: ShaderOffsetRange, offset: number): boolean =>
  range.from <= offset && offset <= range.to;
