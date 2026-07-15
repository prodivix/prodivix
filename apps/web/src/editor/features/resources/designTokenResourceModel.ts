import {
  decodeDtcgDesignTokenDocument,
  decodeDtcgDesignTokenResolverDocument,
  type DesignTokenJsonObject,
  type DesignTokenResolverDocument,
} from '@prodivix/tokens';
import type { WorkspaceDocument } from '@prodivix/workspace';

export type DesignTokenResourceDocumentType = Extract<
  WorkspaceDocument['type'],
  'design-tokens' | 'design-token-resolver'
>;

export type DesignTokenResourceSummary =
  | Readonly<{
      kind: 'tokens';
      groups: number;
      tokens: number;
      aliases: number;
    }>
  | Readonly<{
      kind: 'resolver';
      sets: number;
      modifiers: number;
      contexts: number;
      permutations: number;
      resolver: DesignTokenResolverDocument;
    }>;

export type DesignTokenResourceSourceValidation =
  | Readonly<{
      status: 'valid';
      content: DesignTokenJsonObject;
      summary: DesignTokenResourceSummary;
    }>
  | Readonly<{ status: 'invalid'; message: string }>;

export const listDesignTokenResourceDocuments = (
  documentsById: Readonly<Record<string, WorkspaceDocument>>
): readonly WorkspaceDocument[] =>
  Object.values(documentsById)
    .filter(
      (document) =>
        document.type === 'design-tokens' ||
        document.type === 'design-token-resolver'
    )
    .sort((left, right) =>
      left.path === right.path
        ? left.id.localeCompare(right.id)
        : left.path.localeCompare(right.path)
    );

export const validateDesignTokenResourceSource = (
  type: DesignTokenResourceDocumentType,
  source: string
): DesignTokenResourceSourceValidation => {
  let content: unknown;
  try {
    content = JSON.parse(source);
  } catch (error) {
    return Object.freeze({
      status: 'invalid',
      message:
        error instanceof Error ? error.message : 'The JSON source is invalid.',
    });
  }
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return Object.freeze({
      status: 'invalid',
      message: 'The document root must be a JSON object.',
    });
  }

  if (type === 'design-tokens') {
    const decoded = decodeDtcgDesignTokenDocument(content);
    if ('issues' in decoded) {
      return Object.freeze({
        status: 'invalid',
        message: decoded.issues
          .slice(0, 5)
          .map((issue) => `${issue.path}: ${issue.message}`)
          .join('\n'),
      });
    }
    return Object.freeze({
      status: 'valid',
      content: content as DesignTokenJsonObject,
      summary: Object.freeze({
        kind: 'tokens',
        groups: Math.max(0, decoded.value.groups.length - 1),
        tokens: decoded.value.tokens.length,
        aliases: decoded.value.tokens.filter(
          (token) => token.references.length > 0
        ).length,
      }),
    });
  }

  const decoded = decodeDtcgDesignTokenResolverDocument(content);
  if ('issues' in decoded) {
    return Object.freeze({
      status: 'invalid',
      message: decoded.issues
        .slice(0, 5)
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join('\n'),
    });
  }
  return Object.freeze({
    status: 'valid',
    content: content as DesignTokenJsonObject,
    summary: Object.freeze({
      kind: 'resolver',
      sets: decoded.value.sets.length,
      modifiers: decoded.value.modifiers.length,
      contexts: decoded.value.modifiers.reduce(
        (count, modifier) => count + modifier.contexts.length,
        0
      ),
      permutations: decoded.value.permutationCount,
      resolver: decoded.value,
    }),
  });
};

export const createAvailableDesignSystemSlug = (
  documents: readonly WorkspaceDocument[],
  base = 'product'
): string => {
  const paths = new Set(documents.map((document) => document.path));
  let index = 1;
  let slug = base;
  while (paths.has(`/tokens/${slug}.resolver.json`)) {
    index += 1;
    slug = `${base}-${index}`;
  }
  return slug;
};
